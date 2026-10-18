#!/usr/bin/env bash
# Start or restart CivicPulse API under PM2 only
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

if pm2 describe civicpulse-api >/dev/null 2>&1; then
  pm2 restart civicpulse-api --update-env
else
  pm2 start "$ECOSYSTEM"
fi

pm2 save
# Enable boot persistence (safe to re-run)
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -n 1 | bash || true

pm2 status
echo "API logs: pm2 logs civicpulse-api"
