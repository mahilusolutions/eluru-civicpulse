#!/usr/bin/env bash
# Production deploy: frontend build, API + OCR under PM2, nginx reload
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="${CIVICPULSE_ROOT:-$REPO_ROOT}"
FRONTEND_DIR="$APP_ROOT/civicpulse"
BACKEND_DIR="$APP_ROOT/civicpulse-backend"
OCR_DIR="$APP_ROOT/eluru_voters_data_ocr_extraction/code"
ECOSYSTEM="$APP_ROOT/deploy/ecosystem.config.cjs"
LOG_DIR="/var/log/civicpulse"

echo "==> App root: $APP_ROOT"
mkdir -p "$LOG_DIR"
mkdir -p "$APP_ROOT/eluru_voters_data_ocr_extraction/uploaded_files"
mkdir -p "$APP_ROOT/eluru_voters_data_ocr_extraction/extracted_ocr_data"

export REACT_APP_API_URL="${REACT_APP_API_URL:-/api}"

echo "==> Backend: npm install + prisma generate"
cd "$BACKEND_DIR"
npm install --omit=dev
npx prisma generate

echo "==> OCR: npm install"
cd "$OCR_DIR"
npm install --omit=dev

echo "==> Frontend: npm install + build"
cd "$FRONTEND_DIR"
npm install
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 not found. Install: npm install -g pm2"
  exit 1
fi

echo "==> PM2: start / reload API + OCR"
export CIVICPULSE_ROOT="$APP_ROOT"
if pm2 describe civicpulse-api >/dev/null 2>&1 || pm2 describe eluru-ocr >/dev/null 2>&1; then
  pm2 startOrReload "$ECOSYSTEM" --update-env
else
  pm2 start "$ECOSYSTEM"
fi
pm2 save

echo "==> Nginx site"
if [[ -f "$APP_ROOT/deploy/setup-nginx.sh" ]]; then
  bash "$APP_ROOT/deploy/setup-nginx.sh" || true
elif command -v nginx >/dev/null 2>&1; then
  nginx -t && systemctl reload nginx || true
fi

echo ""
echo "Deploy complete."
echo "  App:   http://SERVER_IP/"
echo "  API:   http://SERVER_IP/api/"
echo "  OCR:   http://SERVER_IP/ocr/"
pm2 status
