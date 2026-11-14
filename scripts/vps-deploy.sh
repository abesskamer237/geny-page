#!/usr/bin/env bash
set -euo pipefail

APP_NAME="geny-shop"
APP_DIR="/opt/geny-shop"
RELEASE_TAR="/tmp/release.tar.gz"
CI_ENV_FILE="/tmp/geny-ci.env"
SUDO_PASS_FILE="/tmp/geny-sudo.pass"

cleanup() {
  rm -f "$RELEASE_TAR" "$CI_ENV_FILE" "$SUDO_PASS_FILE" /tmp/vps-deploy.sh
}
trap cleanup EXIT

run_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    "$@"
  elif [ -f "$SUDO_PASS_FILE" ]; then
    { cat "$SUDO_PASS_FILE"; printf '\n'; } | sudo -S -p '' "$@"
  else
    sudo "$@"
  fi
}

get_env_val() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d'=' -f2- || true
}

echo "=================================================="
echo "  Déploiement Geny sur VPS"
echo "=================================================="

if [ ! -f "$RELEASE_TAR" ] || [ ! -f "$CI_ENV_FILE" ]; then
  echo "Erreur: fichiers de déploiement manquants dans /tmp."
  exit 1
fi

APP_PORT="$(get_env_val PORT "$CI_ENV_FILE")"
APP_PORT="${APP_PORT:-3000}"
DOMAIN="$(get_env_val VPS_DOMAIN "$CI_ENV_FILE")"
DOMAINS_CSV="$(get_env_val VPS_DOMAINS "$CI_ENV_FILE")"
EMAIL="$(get_env_val CERTBOT_EMAIL "$CI_ENV_FILE")"
GENY_API_KEY="$(get_env_val GENY_API_KEY "$CI_ENV_FILE")"
GENY_API_BASE_URL="$(get_env_val GENY_API_BASE_URL "$CI_ENV_FILE")"
GENY_WEBHOOK_SECRET="$(get_env_val GENY_WEBHOOK_SECRET "$CI_ENV_FILE")"
GENY_TENANTS_JSON="$(get_env_val GENY_TENANTS_JSON "$CI_ENV_FILE")"

# 1. Installer prérequis système + Node.js 22 LTS si besoin
if command -v apt-get >/dev/null 2>&1; then
  run_root apt-get update -y
  run_root apt-get install -y curl ca-certificates gnupg
fi

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -ge 22 ]; then
    NEED_NODE=0
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "-> Installation de Node.js 22 LTS..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | run_root bash -
    run_root apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | run_root bash -
    run_root dnf install -y nodejs
  else
    echo "Installez Node.js >= 22 manuellement sur le VPS."
    exit 1
  fi
fi

echo "-> Node.js $(node -v) prêt."

# 2. Déployer le code compilé dans /opt/geny-shop en préservant .data/
run_root mkdir -p "$APP_DIR" "$APP_DIR/.data"
run_root tar -xzf "$RELEASE_TAR" -C "$APP_DIR"
run_root chmod +x "$APP_DIR/install.sh" "$APP_DIR/scripts/add-domain.sh"

# 3. Écrire .env proprement (conserve GENY_API_KEY existante si le secret GitHub est vide)
EXISTING_KEY="$(get_env_val GENY_API_KEY "$APP_DIR/.env")"
EXISTING_WH="$(get_env_val GENY_WEBHOOK_SECRET "$APP_DIR/.env")"
EXISTING_TENANTS="$(get_env_val GENY_TENANTS_JSON "$APP_DIR/.env")"

FINAL_KEY="${GENY_API_KEY:-$EXISTING_KEY}"
FINAL_WH="${GENY_WEBHOOK_SECRET:-$EXISTING_WH}"
FINAL_TENANTS="${GENY_TENANTS_JSON:-$EXISTING_TENANTS}"

{
  printf 'NODE_ENV=production\n'
  printf 'PORT=%s\n' "$APP_PORT"
  printf 'APP_URL=%s\n' "${DOMAIN:+https://${DOMAIN}}"
  printf 'GENY_API_KEY=%s\n' "$FINAL_KEY"
  printf 'GENY_API_BASE_URL=%s\n' "${GENY_API_BASE_URL:-https://geny.payool.net/api/v1/partner}"
  printf 'GENY_WEBHOOK_SECRET=%s\n' "$FINAL_WH"
  if [ -n "$FINAL_TENANTS" ]; then
    printf 'GENY_TENANTS_JSON=%s\n' "$FINAL_TENANTS"
  fi
} | run_root tee "$APP_DIR/.env" >/dev/null
run_root chmod 600 "$APP_DIR/.env"

# 4. Installer les dépendances runtime de production
echo "-> Installation des dépendances runtime..."
cd "$APP_DIR"
run_root npm install --omit=dev --no-audit --no-fund

# 5. Configurer & redémarrer le service systemd
NODE_BIN="$(command -v node)"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  run_root tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Geny Storefront & Reseller Portal
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} ${APP_DIR}/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  run_root systemctl daemon-reload
  run_root systemctl enable "${APP_NAME}"
  run_root systemctl restart "${APP_NAME}"
else
  run_root pkill -f "node ${APP_DIR}/server.ts" >/dev/null 2>&1 || true
  run_root sh -c "nohup env NODE_ENV=production ${NODE_BIN} ${APP_DIR}/server.ts > ${APP_DIR}/geny-shop.log 2>&1 &"
fi

# 6. Vérifier que le serveur répond localement
echo "-> Vérification santé locale sur le port ${APP_PORT}..."
HEALTH_OK=0
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health"; then
    echo ""
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "Erreur: l'application n'a pas démarré correctement."
  run_root journalctl -u "${APP_NAME}" -n 40 --no-pager || true
  exit 1
fi

# 7. Configurer Nginx + HTTPS Certbot pour tous les domaines (VPS_DOMAIN + VPS_DOMAINS)
ALL_DOMAINS="$(printf '%s,%s' "$DOMAIN" "$DOMAINS_CSV" | tr ',' '\n' | sed -E 's|^https?://||; s|/.*$||; s|:.*$||; s|^www\.||' | tr '[:upper:]' '[:lower:]' | awk 'NF && !seen[$0]++')"

if [ -n "$ALL_DOMAINS" ] && command -v apt-get >/dev/null 2>&1; then
  if ! command -v nginx >/dev/null 2>&1; then
    run_root apt-get install -y nginx
  fi
  if [ -e /etc/nginx/sites-enabled/default ]; then
    run_root rm -f /etc/nginx/sites-enabled/default
  fi

  for D in $ALL_DOMAINS; do
    echo "-> Configuration Nginx pour le domaine : ${D}"
    NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}-${D}"
    run_root tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${D} www.${D};

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
    run_root ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${APP_NAME}-${D}"
  done

  run_root nginx -t
  run_root systemctl enable nginx
  run_root systemctl reload nginx

  if ! command -v certbot >/dev/null 2>&1; then
    run_root apt-get install -y certbot python3-certbot-nginx || true
  fi

  if command -v certbot >/dev/null 2>&1; then
    for D in $ALL_DOMAINS; do
      if [ ! -f "/etc/letsencrypt/live/${D}/fullchain.pem" ]; then
        echo "-> Activation SSL HTTPS via Certbot pour ${D}..."
        if [ -n "$EMAIL" ]; then
          run_root certbot --nginx -d "$D" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
            echo "Note: Certbot différé pour ${D} (vérifiez le DNS A)."
        else
          run_root certbot --nginx -d "$D" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
            echo "Note: Certbot différé pour ${D} (vérifiez le DNS A)."
        fi
      fi
    done
  fi
fi

echo "=================================================="
echo "  Déploiement terminé avec succès !"
for D in $ALL_DOMAINS; do
  echo "  Boutique : https://${D}/  (Webhook: https://${D}/api/webhooks/geny)"
done
echo "=================================================="
