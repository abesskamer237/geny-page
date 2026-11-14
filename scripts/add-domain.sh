#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash /opt/geny-shop/scripts/add-domain.sh <domaine> [nom_boutique] [cle_api] [webhook_secret]
# Exemple (Nginx + SSL uniquement pour un domaine déjà ajouté dans l'interface) :
#   sudo bash /opt/geny-shop/scripts/add-domain.sh boutique-alice.cm
# Exemple complet (Nginx + SSL + enregistrement du revendeur) :
#   sudo bash /opt/geny-shop/scripts/add-domain.sh boutique-alice.cm "Alice WiFi" "gk_live_..." "whsec_..."

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <domaine> [nom_boutique] [cle_api] [webhook_secret]"
  exit 1
fi

RAW_DOMAIN="$1"
DOMAIN="$(printf '%s' "$RAW_DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -E 's|^https?://||; s|/.*$||; s|:.*$||; s|^www\.||')"
RESELLER_NAME="${2:-}"
API_KEY="${3:-}"
WEBHOOK_SECRET="${4:-}"
APP_DIR="/opt/geny-shop"
APP_NAME="geny-shop"
STORE_FILE="${APP_DIR}/.data/geny-store.json"

if [ -z "$DOMAIN" ]; then
  echo "Domaine invalide."
  exit 1
fi

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

APP_PORT="3000"
if [ -f "${APP_DIR}/.env" ]; then
  FOUND_PORT="$(grep -E '^PORT=' "${APP_DIR}/.env" | head -n1 | cut -d'=' -f2- || true)"
  if [ -n "$FOUND_PORT" ]; then APP_PORT="$FOUND_PORT"; fi
fi

echo "-> Configuration Nginx pour ${DOMAIN} (proxy vers 127.0.0.1:${APP_PORT})..."
if ! command -v nginx >/dev/null 2>&1; then
  $SUDO apt-get update -y
  $SUDO apt-get install -y nginx
fi

NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}-${DOMAIN}"
$SUDO tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

$SUDO ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${APP_NAME}-${DOMAIN}"
$SUDO nginx -t
$SUDO systemctl reload nginx

if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "-> Activation SSL HTTPS via Certbot pour ${DOMAIN}..."
  if ! command -v certbot >/dev/null 2>&1; then
    $SUDO apt-get install -y certbot python3-certbot-nginx || true
  fi
  if command -v certbot >/dev/null 2>&1; then
    $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
      echo "Note: Certbot différé. Assurez-vous que le DNS A de ${DOMAIN} pointe vers ce VPS puis relancez: sudo certbot --nginx -d ${DOMAIN}"
  fi
fi

if [ -n "$RESELLER_NAME" ] && [ -n "$API_KEY" ]; then
  echo "-> Enregistrement du revendeur ${RESELLER_NAME} (${DOMAIN})..."
  $SUDO mkdir -p "${APP_DIR}/.data"
  $SUDO env DOMAIN="$DOMAIN" RESELLER_NAME="$RESELLER_NAME" API_KEY="$API_KEY" WEBHOOK_SECRET="$WEBHOOK_SECRET" STORE_FILE="$STORE_FILE" node -e '
    const fs = require("fs");
    const crypto = require("crypto");
    const file = process.env.STORE_FILE;
    let store = { resellers: {}, sessions: {}, payments: {}, codes: {}, shopOrders: {}, tenants: {} };
    if (fs.existsSync(file)) {
      try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    }
    if (!store.tenants) store.tenants = {};
    const dom = process.env.DOMAIN;
    const now = Math.floor(Date.now() / 1000);
    const prev = store.tenants[dom];
    store.tenants[dom] = {
      id: prev?.id || "ten_" + crypto.randomBytes(6).toString("hex"),
      domain: dom,
      reseller_name: process.env.RESELLER_NAME,
      api_key: process.env.API_KEY.trim(),
      webhook_secret: (process.env.WEBHOOK_SECRET || prev?.webhook_secret || "").trim(),
      api_base_url: "https://geny.payool.net/api/v1/partner",
      enabled: true,
      created: prev?.created || now,
      updated: now,
    };
    fs.writeFileSync(file, JSON.stringify(store, null, 2));
  '
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service | grep -q "${APP_NAME}.service"; then
    $SUDO systemctl restart "${APP_NAME}"
  fi
fi

echo "=================================================="
echo "  Boutique prête : https://${DOMAIN}/"
echo "  Webhook Geny   : https://${DOMAIN}/api/webhooks/geny"
echo "=================================================="
