#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-dashboard.akbarakma.tech}"
EMAIL="${2:-admin@akbarakma.tech}"
APP_DIR="/home/ubuntu/.openclaw/workspace-david/openclaw-dashboard"
SERVICE="akbar-dashboard"

sudo apt-get update
sudo apt-get install -y nginx python3-venv python3-pip certbot python3-certbot-nginx

python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"

sudo tee /etc/systemd/system/${SERVICE}.service >/dev/null <<EOF
[Unit]
Description=Akbar Dashboard FastAPI
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/.venv/bin:/usr/bin:/bin"
ExecStart=$APP_DIR/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ${SERVICE}

sudo tee /etc/nginx/sites-available/${DOMAIN} >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

echo "--- VERIFY ---"
systemctl --no-pager --full status ${SERVICE} | sed -n '1,15p'
curl -I "https://${DOMAIN}" | sed -n '1,10p'
curl -s "https://${DOMAIN}/api/status" | head -c 400; echo
