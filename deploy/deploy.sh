#!/usr/bin/env bash
# Deploy CivicPulse: install deps, build frontend, (re)start PM2 API, reload nginx
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ROOT="${CIVICPULSE_ROOT:-$REPO_ROOT}"
FRONTEND_DIR="$APP_ROOT/civicpulse"
BACKEND_DIR="$APP_ROOT/civicpulse-backend"
ECOSYSTEM="$APP_ROOT/deploy/ecosystem.config.cjs"
LOG_DIR="/var/log/civicpulse"

echo "==> App root: $APP_ROOT"

mkdir -p "$LOG_DIR"

# Production frontend calls same-origin /api (nginx proxies to :4000)
export REACT_APP_API_URL="${REACT_APP_API_URL:-/api}"

echo "==> Backend: npm install"
cd "$BACKEND_DIR"
npm install --omit=dev

echo "==> Frontend: npm install + build"
cd "$FRONTEND_DIR"
npm install
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 not found. Install: npm install -g pm2"
  exit 1
fi

echo "==> PM2: start / reload civicpulse-api"
export CIVICPULSE_ROOT="$APP_ROOT"
if pm2 describe civicpulse-api >/dev/null 2>&1; then
  pm2 reload "$ECOSYSTEM" --update-env
else
  pm2 start "$ECOSYSTEM"
fi
pm2 save

echo "==> Nginx reload (if present)"
if command -v nginx >/dev/null 2>&1; then
  if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null || true
  fi
fi

echo ""
echo "Deploy complete."
echo "  Frontend build: $FRONTEND_DIR/build"
echo "  API (PM2):      civicpulse-api  -> http://127.0.0.1:4000/api"
echo "  Public:         http://SERVER_IP/  (nginx)  +  /api/"
echo ""
pm2 status
