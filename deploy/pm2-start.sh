#!/usr/bin/env bash
# Start / restart CivicPulse API + OCR under PM2
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="${CIVICPULSE_ROOT:-$REPO_ROOT}"
ECOSYSTEM="$APP_ROOT/deploy/ecosystem.config.cjs"
LOG_DIR="/var/log/civicpulse"

mkdir -p "$LOG_DIR"
export CIVICPULSE_ROOT="$APP_ROOT"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2 globally..."
  npm install -g pm2
fi

pm2 startOrReload "$ECOSYSTEM" --update-env
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -n 1 | bash || true

pm2 status
echo "Logs: pm2 logs civicpulse-api | pm2 logs eluru-ocr"
