package dogtag

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	profileID  string
}

type enrollmentRequest struct {
	ProfileID string          `json:"ProfileID"`
	Input     []enrollInput   `json:"Input"`
}

type enrollInput struct {
	ID      string           `json:"id"`
	ClassID string           `json:"ClassID"`
	Name    string           `json:"Name"`
	Attribute []enrollAttr   `json:"Attribute"`
}

type enrollAttr struct {
	Name  string `json:"name"`
	Value string `json:"Value"`
}

type enrollmentResponse struct {
	RequestID string `json:"RequestID"`
	RequestStatus string `json:"RequestStatus"`
}

type requestStatusResponse struct {
	RequestID     string `json:"RequestID"`
	RequestStatus string `json:"RequestStatus"`
	CertID        string `json:"CertId"`
}

type certResponse struct {
	Encoded  string `json:"Encoded"`
	PKCSEncoded string `json:"PKCS7CertChain"`
}

type ClientConfig struct {
	BaseURL        string
	ClientCertPath string
	ClientKeyPath  string
	CACertPath     string
	ProfileID      string
	RequestTimeout time.Duration
}

func NewClient(cfg ClientConfig) (*Client, error) {
	clientCert, err := tls.LoadX509KeyPair(cfg.ClientCertPath, cfg.ClientKeyPath)
	if err != nil {
		return nil, fmt.Errorf("loading client certificate: %w", err)
	}

	caCertPool := x509.NewCertPool()
	if cfg.CACertPath != "" {
		caCert, err := os.ReadFile(cfg.CACertPath)
		if err != nil {
			return nil, fmt.Errorf("reading CA cert: %w", err)
		}
		if !caCertPool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("failed to parse CA certificate from %s", cfg.CACertPath)
		}
	}

	timeout := cfg.RequestTimeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}

	httpClient := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				Certificates: []tls.Certificate{clientCert},
				RootCAs:      caCertPool,
				MinVersion:   tls.VersionTLS12,
			},
		},
	}

	return &Client{
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		httpClient: httpClient,
		profileID:  cfg.ProfileID,
	}, nil
}

func (c *Client) SubmitEnrollment(csrPEM []byte) (string, error) {
	csrB64 := base64.StdEncoding.EncodeToString(csrPEM)

	reqBody := enrollmentRequest{
		ProfileID: c.profileID,
		Input: []enrollInput{
			{
				ID:      "i1",
				ClassID: "certReqInputImpl",
				Name:    "Certificate Request Input",
				Attribute: []enrollAttr{
					{Name: "cert_request_type", Value: "pkcs10"},
					{Name: "cert_request", Value: csrB64},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshaling enrollment request: %w", err)
	}

	url := c.baseURL + "/ca/rest/certrequests"
	req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return "", fmt.Errorf("creating enrollment request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("submitting enrollment: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("enrollment failed with status %d: %s", resp.StatusCode, string(body))
	}

	var enrollResp enrollmentResponse
	if err := json.Unmarshal(body, &enrollResp); err != nil {
		return "", fmt.Errorf("parsing enrollment response: %w", err)
	}

	return enrollResp.RequestID, nil
}

func (c *Client) GetRequestStatus(requestID string) (status string, certID string, err error) {
	url := fmt.Sprintf("%s/ca/rest/certrequests/%s", c.baseURL, requestID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", "", fmt.Errorf("creating status request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("checking request status: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("status check failed with %d: %s", resp.StatusCode, string(body))
	}

	var statusResp requestStatusResponse
	if err := json.Unmarshal(body, &statusResp); err != nil {
		return "", "", fmt.Errorf("parsing status response: %w", err)
	}

	return statusResp.RequestStatus, statusResp.CertID, nil
}

func (c *Client) GetCertificate(certID string) ([]byte, error) {
	url := fmt.Sprintf("%s/ca/rest/certs/%s", c.baseURL, certID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating cert request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("retrieving certificate: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cert retrieval failed with %d: %s", resp.StatusCode, string(body))
	}

	var certResp certResponse
	if err := json.Unmarshal(body, &certResp); err != nil {
		return nil, fmt.Errorf("parsing cert response: %w", err)
	}

	certDER, err := base64.StdEncoding.DecodeString(certResp.Encoded)
	if err != nil {
		return nil, fmt.Errorf("decoding certificate: %w", err)
	}

	return certDER, nil
}

// GetCACert retrieves the CA signing certificate (the root or issuing CA).
func (c *Client) GetCACert() ([]byte, error) {
	url := c.baseURL + "/ca/rest/agent/cacert"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating CA cert request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("retrieving CA cert: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("CA cert retrieval failed with %d: %s", resp.StatusCode, string(body))
	}

	var certResp certResponse
	if err := json.Unmarshal(body, &certResp); err != nil {
		return nil, fmt.Errorf("parsing CA cert response: %w", err)
	}

	certDER, err := base64.StdEncoding.DecodeString(certResp.Encoded)
	if err != nil {
		return nil, fmt.Errorf("decoding CA certificate: %w", err)
	}

	return certDER, nil
}
