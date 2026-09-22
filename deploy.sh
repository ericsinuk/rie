#!/bin/bash
# RIE deploy script — run as root on the VPS
# Usage: bash deploy.sh
set -e

REPO="https://github.com/ericsinuk/rie.git"
BRANCH="main"
APP_DIR="/var/www/rie"
PORT=5555
DB_PATH="$APP_DIR/server/rie.db"

echo "=== 1. Cloning / updating repo ==="
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  git clone -b "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "=== 2. Server .env ==="
# Preserve existing JWT_SECRET if present, otherwise generate one
EXISTING_SECRET=""
[ -f server/.env ] && EXISTING_SECRET=$(grep ^JWT_SECRET server/.env | cut -d= -f2-)
JWT_SECRET="${EXISTING_SECRET:-DHL-RIE-$(openssl rand -hex 16)}"

cat > server/.env << EOF
PORT=$PORT
DB_PATH=$DB_PATH
JWT_SECRET=$JWT_SECRET
CORS_ORIGIN=https://dhl-audit.duckdns.org
EOF

echo "=== 3. Server deps + migrate ==="
cd server && npm install --omit=dev
node migrate.js
cd ..

echo "=== 4. PM2 ==="
if pm2 list | grep -q rie-server; then
  pm2 restart rie-server
else
  pm2 start server/ecosystem.config.cjs
fi
pm2 save

echo "=== 5. Frontend build ==="
npm install
npm run build

echo "=== 6. Caddy / Nginx config ==="
# Try Caddy first (preferred on this VPS)
CADDYFILE="/etc/caddy/Caddyfile"
NGINX_CONF=""
[ -f /etc/nginx/sites-available/dhl-audit ] && NGINX_CONF="/etc/nginx/sites-available/dhl-audit"
[ -f /etc/nginx/sites-available/dhl-audit.conf ] && NGINX_CONF="/etc/nginx/sites-available/dhl-audit.conf"
[ -f /etc/nginx/sites-available/default ] && [ -z "$NGINX_CONF" ] && NGINX_CONF="/etc/nginx/sites-available/default"

if [ -f "$CADDYFILE" ]; then
  if ! grep -q "handle /rie/api/" "$CADDYFILE"; then
    cat >> "$CADDYFILE" << 'CADDYEOF'

  handle /rie/api/* {
    uri strip_prefix /rie/api
    reverse_proxy localhost:5555
  }

  handle /rie/* {
    root * /var/www/rie/dist
    try_files {path} /rie/index.html
    file_server
  }
CADDYEOF
    echo "Caddy blocks added"
  fi
  caddy reload --config "$CADDYFILE" && echo "Caddy reloaded"
elif [ -n "$NGINX_CONF" ]; then
  if ! grep -q "location /rie/" "$NGINX_CONF"; then
    cat >> "$NGINX_CONF" << 'NGINXEOF'

    location /rie/api/ {
        proxy_pass http://127.0.0.1:5555/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    location /rie/ {
        alias /var/www/rie/dist/;
        try_files $uri $uri/ /rie/index.html;
    }
NGINXEOF
    echo "Nginx blocks added to $NGINX_CONF"
  fi
  if systemctl is-active --quiet nginx; then
    nginx -t && systemctl reload nginx
  else
    echo "nginx installed but not running — skipping reload (Caddy serves this host)"
  fi
fi

echo ""
echo "=== DONE ==="
echo "App: https://dhl-audit.duckdns.org/rie/"
echo "API: https://dhl-audit.duckdns.org/rie/api/"
echo "DB:  $DB_PATH"
echo "PM2: pm2 status"
