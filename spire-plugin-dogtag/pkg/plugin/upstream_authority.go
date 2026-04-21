package plugin

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"sync"
	"time"

	"github.com/hashicorp/go-hclog"
	"github.com/hashicorp/hcl"
	upstreamauthorityv1 "github.com/spiffe/spire-plugin-sdk/proto/spire/plugin/server/upstreamauthority/v1"
	"github.com/spiffe/spire-plugin-sdk/proto/spire/plugin/types"
	configv1 "github.com/spiffe/spire-plugin-sdk/proto/spire/service/common/config/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/dogtagpki/spire-plugin-dogtag/pkg/dogtag"
)

type Config struct {
	DogtagURL      string `hcl:"dogtag_url"`
	ClientCertPath string `hcl:"client_cert_path"`
	ClientKeyPath  string `hcl:"client_key_path"`
	CACertPath     string `hcl:"ca_cert_path"`
	ProfileID      string `hcl:"profile_id"`
	PollInterval   string `hcl:"poll_interval"`
	RequestTimeout string `hcl:"request_timeout"`
}

type DogtagPlugin struct {
	upstreamauthorityv1.UnsafeUpstreamAuthorityServer
	configv1.UnsafeConfigServer

	mu     sync.Mutex
	config *Config
	client *dogtag.Client
	logger hclog.Logger
}

func New() *DogtagPlugin {
	return &DogtagPlugin{}
}

func (p *DogtagPlugin) SetLogger(logger hclog.Logger) {
	p.logger = logger
}

func (p *DogtagPlugin) Configure(_ context.Context, req *configv1.ConfigureRequest) (*configv1.ConfigureResponse, error) {
	config := new(Config)
	if err := hcl.Decode(config, req.HclConfiguration); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "failed to decode configuration: %v", err)
	}

	if config.DogtagURL == "" {
		return nil, status.Error(codes.InvalidArgument, "dogtag_url is required")
	}
	if config.ClientCertPath == "" {
		return nil, status.Error(codes.InvalidArgument, "client_cert_path is required")
	}
	if config.ClientKeyPath == "" {
		return nil, status.Error(codes.InvalidArgument, "client_key_path is required")
	}
	if config.ProfileID == "" {
		config.ProfileID = "caSpireIntermediateCA"
	}
	if config.PollInterval == "" {
		config.PollInterval = "10s"
	}
	if config.RequestTimeout == "" {
		config.RequestTimeout = "60s"
	}

	requestTimeout, err := time.ParseDuration(config.RequestTimeout)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid request_timeout: %v", err)
	}

	client, err := dogtag.NewClient(dogtag.ClientConfig{
		BaseURL:        config.DogtagURL,
		ClientCertPath: config.ClientCertPath,
		ClientKeyPath:  config.ClientKeyPath,
		CACertPath:     config.CACertPath,
		ProfileID:      config.ProfileID,
		RequestTimeout: requestTimeout,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create Dogtag client: %v", err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	p.config = config
	p.client = client

	return &configv1.ConfigureResponse{}, nil
}

func (p *DogtagPlugin) MintX509CAAndSubscribe(
	req *upstreamauthorityv1.MintX509CARequest,
	stream grpc.ServerStreamingServer[upstreamauthorityv1.MintX509CAResponse],
) error {
	p.mu.Lock()
	client := p.client
	config := p.config
	p.mu.Unlock()

	if client == nil {
		return status.Error(codes.FailedPrecondition, "plugin not configured")
	}

	csrPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE REQUEST",
		Bytes: req.Csr,
	})

	p.logger.Info("submitting CSR to Dogtag", "profile", config.ProfileID)

	requestID, err := client.SubmitEnrollment(csrPEM)
	if err != nil {
		return status.Errorf(codes.Internal, "enrollment submission failed: %v", err)
	}

	p.logger.Info("enrollment request submitted", "request_id", requestID)

	certDER, err := p.waitForCertificate(client, requestID, config)
	if err != nil {
		return status.Errorf(codes.Internal, "certificate retrieval failed: %v", err)
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to parse issued certificate: %v", err)
	}

	p.logger.Info("intermediate CA certificate obtained",
		"serial", fmt.Sprintf("0x%X", cert.SerialNumber),
		"expires", cert.NotAfter.Format(time.RFC3339),
	)

	caCertDER, err := client.GetCACert()
	if err != nil {
		return status.Errorf(codes.Internal, "failed to retrieve CA certificate: %v", err)
	}

	x509CAChain := []*types.X509Certificate{
		{Asn1: certDER},
		{Asn1: caCertDER},
	}

	upstreamRoots := []*types.X509Certificate{
		{Asn1: caCertDER},
	}

	err = stream.Send(&upstreamauthorityv1.MintX509CAResponse{
		X509CaChain:       x509CAChain,
		UpstreamX509Roots: upstreamRoots,
	})
	if err != nil {
		return err
	}

	// Block until SPIRE cancels the stream — SPIRE manages rotation by
	// calling MintX509CAAndSubscribe again with a fresh CSR at ca_ttl/2.
	<-stream.Context().Done()
	return nil
}

func (p *DogtagPlugin) PublishJWTKeyAndSubscribe(
	_ *upstreamauthorityv1.PublishJWTKeyRequest,
	_ grpc.ServerStreamingServer[upstreamauthorityv1.PublishJWTKeyResponse],
) error {
	return status.Error(codes.Unimplemented, "Dogtag PKI does not manage JWT signing keys")
}

func (p *DogtagPlugin) SubscribeToLocalBundle(
	_ *upstreamauthorityv1.SubscribeToLocalBundleRequest,
	_ grpc.ServerStreamingServer[upstreamauthorityv1.SubscribeToLocalBundleResponse],
) error {
	return status.Error(codes.Unimplemented, "not supported")
}

func (p *DogtagPlugin) Validate(_ context.Context, req *configv1.ValidateRequest) (*configv1.ValidateResponse, error) {
	config := new(Config)
	if err := hcl.Decode(config, req.HclConfiguration); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid configuration: %v", err)
	}
	if config.DogtagURL == "" {
		return &configv1.ValidateResponse{Valid: false, Notes: []string{"dogtag_url is required"}}, nil
	}
	if config.ClientCertPath == "" {
		return &configv1.ValidateResponse{Valid: false, Notes: []string{"client_cert_path is required"}}, nil
	}
	if config.ClientKeyPath == "" {
		return &configv1.ValidateResponse{Valid: false, Notes: []string{"client_key_path is required"}}, nil
	}
	return &configv1.ValidateResponse{Valid: true}, nil
}

func (p *DogtagPlugin) waitForCertificate(client *dogtag.Client, requestID string, config *Config) ([]byte, error) {
	pollInterval, err := time.ParseDuration(config.PollInterval)
	if err != nil {
		pollInterval = 10 * time.Second
	}

	deadline := time.Now().Add(5 * time.Minute)

	for time.Now().Before(deadline) {
		reqStatus, certID, err := client.GetRequestStatus(requestID)
		if err != nil {
			return nil, fmt.Errorf("checking request %s: %w", requestID, err)
		}

		switch reqStatus {
		case "complete":
			certDER, err := client.GetCertificate(certID)
			if err != nil {
				return nil, fmt.Errorf("retrieving cert %s: %w", certID, err)
			}
			return certDER, nil

		case "pending":
			p.logger.Debug("enrollment request pending, waiting", "request_id", requestID)
			time.Sleep(pollInterval)

		case "rejected":
			return nil, fmt.Errorf("enrollment request %s was rejected", requestID)

		case "canceled":
			return nil, fmt.Errorf("enrollment request %s was canceled", requestID)

		default:
			return nil, fmt.Errorf("unexpected request status %q for request %s", reqStatus, requestID)
		}
	}

	return nil, fmt.Errorf("timed out waiting for enrollment request %s", requestID)
}
