#!/bin/sh
set -e

CONF_TEMPLATE=/etc/nginx/conf.d/default.conf.template
CONF=/etc/nginx/conf.d/default.conf

# Default backend port
BACKEND_PORT="${BACKEND_PORT:-3000}"
export BACKEND_PORT

sed -e "s|\${BACKEND_PORT}|$BACKEND_PORT|g" \
    "$CONF_TEMPLATE" > "$CONF"

# Remove TLS server block if no TLS cert is mounted
if [ ! -f /etc/nginx/certs/tls.crt ]; then
    sed -i '/^server {$/,/^}$/{ /listen 8443/,/^}$/d }' "$CONF"
    sed -i '/if (-f \/etc\/nginx\/certs\/tls.crt)/,/}/d' "$CONF"
fi

# Start the Fastify backend
node /app/server/dist/index.mjs &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 30); do
    if wget -q -O /dev/null "http://127.0.0.1:${BACKEND_PORT}/healthz" 2>/dev/null; then
        break
    fi
    sleep 0.5
done

# Start nginx in foreground
exec nginx -g "daemon off;"
