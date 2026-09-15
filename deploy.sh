#!/bin/bash
# RIE deploy script — run as root on the VPS
# Usage: bash deploy.sh
set -e

REPO="https://github.com/trendsyncjourney-max/RisksAssessments.git"
BRANCH="claude/gifted-rubin-mepxnb"
APP_DIR="/var/www/rie"
JWT_SECRET="DHL-RIE-$(openssl rand -hex 16)"
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

echo "=== 6. Nginx config ==="
NGINX_CONF="/etc/nginx/sites-available/default"
[ -f /etc/nginx/sites-available/dhl-audit ] && NGINX_CONF="/etc/nginx/sites-available/dhl-audit"
[ -f /etc/nginx/sites-available/dhl-audit.conf ] && NGINX_CONF="/etc/nginx/sites-available/dhl-audit.conf"

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
else
  echo "Nginx blocks already present, skipping"
fi

nginx -t && systemctl reload nginx

echo ""
echo "=== DONE ==="
echo "App: https://dhl-audit.duckdns.org/rie/"
echo "API: https://dhl-audit.duckdns.org/rie/api/"
echo "DB:  $DB_PATH"
echo "PM2: pm2 status"
