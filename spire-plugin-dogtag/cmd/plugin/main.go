package main

import (
	"github.com/hashicorp/go-hclog"
	upstreamauthorityv1 "github.com/spiffe/spire-plugin-sdk/proto/spire/plugin/server/upstreamauthority/v1"
	configv1 "github.com/spiffe/spire-plugin-sdk/proto/spire/service/common/config/v1"
	"github.com/spiffe/spire-plugin-sdk/pluginmain"

	"github.com/dogtagpki/spire-plugin-dogtag/pkg/plugin"
)

func main() {
	p := plugin.New()
	p.SetLogger(hclog.Default())

	pluginmain.Serve(
		upstreamauthorityv1.UpstreamAuthorityPluginServer(p),
		configv1.ConfigServiceServer(p),
	)
}
