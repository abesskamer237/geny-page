#!/usr/bin/env bash
set -euo pipefail

APP_NAME="geny-shop"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=================================================="
echo "  Installation Geny Boutique & Portail Revendeur"
echo "=================================================="

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

# 1. Prérequis système & Node.js 22 LTS
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -y
  $SUDO apt-get install -y curl ca-certificates gnupg
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
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO dnf install -y nodejs
  else
    echo "Installez Node.js >= 22 manuellement puis relancez install.sh."
    exit 1
  fi
fi

echo "-> Node.js $(node -v) prêt."

# 2. Configuration .env (clé API Geny + Webhook + Port)
cd "$APP_DIR"

if [ ! -f .env ]; then
  INPUT_KEY="${GENY_API_KEY:-}"
  INPUT_WEBHOOK="${GENY_WEBHOOK_SECRET:-}"
  INPUT_PORT="${PORT:-3000}"

  if [ -z "$INPUT_KEY" ] && [ -t 0 ]; then
    echo ""
    echo "Connexion à votre compte revendeur Geny (https://geny.payool.net/espace-api#/keys)"
    read -r -p "Entrez votre GENY_API_KEY (gk_live_... ou gk_test_..., Entrée pour mode démo): " INPUT_KEY || true
    if [ -n "$INPUT_KEY" ]; then
      read -r -p "Entrez votre GENY_WEBHOOK_SECRET (whsec_..., optionnel): " INPUT_WEBHOOK || true
    fi
    read -r -p "Port d'écoute du serveur [3000]: " PROMPT_PORT || true
    if [ -n "${PROMPT_PORT:-}" ]; then
      INPUT_PORT="$PROMPT_PORT"
    fi
  fi

  cat > .env <<EOF
NODE_ENV=production
PORT=${INPUT_PORT}
GENY_API_KEY=${INPUT_KEY}
GENY_API_BASE_URL=https://geny.payool.net/api/v1/partner
GENY_WEBHOOK_SECRET=${INPUT_WEBHOOK}
EOF
  chmod 600 .env
  echo "-> Fichier .env créé."
else
  echo "-> Fichier .env existant conservé."
fi

# 3. Installation des dépendances & compilation frontend
echo "-> Installation des dépendances npm..."
npm install --no-audit --no-fund

echo "-> Build de production (Vite)..."
npm run build

# 4. Création du service systemd (démarrage automatique 24/7)
NODE_BIN="$(command -v node)"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  $SUDO tee "$SERVICE_FILE" >/dev/null <<EOF
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

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "${APP_NAME}"
  $SUDO systemctl restart "${APP_NAME}"
  SERVICE_MODE="systemd"
else
  pkill -f "node ${APP_DIR}/server.ts" >/dev/null 2>&1 || true
  nohup env NODE_ENV=production "$NODE_BIN" "${APP_DIR}/server.ts" > "${APP_DIR}/geny-shop.log" 2>&1 &
  SERVICE_MODE="nohup"
fi

SERVER_PORT="$(grep -E '^PORT=' .env | cut -d'=' -f2- || echo 3000)"
PUBLIC_IP="$(curl -fsSL -m 3 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || echo 'VOTRE_IP')"

echo ""
echo "=================================================="
echo "  Installation terminée ($SERVICE_MODE)"
echo "=================================================="
echo "Boutique client  : http://${PUBLIC_IP}:${SERVER_PORT}/"
echo "Espace revendeur : http://${PUBLIC_IP}:${SERVER_PORT}/revendeur"
echo "Espace API       : http://${PUBLIC_IP}:${SERVER_PORT}/espace-api#/overview"
echo "URL Webhook Geny : http://${PUBLIC_IP}:${SERVER_PORT}/api/webhooks/geny"
echo ""
echo "Pour modifier votre clé API plus tard :"
echo "  nano ${APP_DIR}/.env && ${SUDO} systemctl restart ${APP_NAME}"
echo "Logs en direct :"
echo "  ${SUDO} journalctl -u ${APP_NAME} -f"
echo "=================================================="
