#!/bin/sh
set -e

CONF_TEMPLATE=/etc/nginx/conf.d/default.conf.template
CONF=/etc/nginx/conf.d/default.conf

sed -e "s|\${CA_TARGET_URL}|$CA_TARGET_URL|g" \
    -e "s|\${REKOR_URL}|$REKOR_URL|g" \
    "$CONF_TEMPLATE" > "$CONF"

# Remove Rekor proxy block if not configured
if [ -z "$REKOR_URL" ]; then
    sed -i '/location \/rekor/,/^    }/d' "$CONF"
fi

# Remove TLS server block if no TLS cert is mounted
if [ ! -f /etc/nginx/certs/tls.crt ]; then
    sed -i '/^server {$/,/^}$/{ /listen 8443/,/^}$/d }' "$CONF"
    # Remove the HTTP->HTTPS redirect since TLS is not available
    sed -i '/if (-f \/etc\/nginx\/certs\/tls.crt)/,/}/d' "$CONF"
fi

exec nginx -g "daemon off;"
