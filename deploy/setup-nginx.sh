#!/usr/bin/env bash
# Install / refresh Nginx site for CivicPulse
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SRC="$REPO_ROOT/deploy/nginx/civicpulse.conf"
NGINX_AVAIL="/etc/nginx/sites-available/civicpulse"
NGINX_ENABLED="/etc/nginx/sites-enabled/civicpulse"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/setup-nginx.sh"
  exit 1
fi

if [[ ! -f "$NGINX_SRC" ]]; then
  echo "Missing $NGINX_SRC"
  exit 1
fi

cp "$NGINX_SRC" "$NGINX_AVAIL"
ln -sfn "$NGINX_AVAIL" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# The template above is plain HTTP. If a Let's Encrypt certificate already exists, put HTTPS back,
# otherwise every deploy would switch the site to HTTP only and https:// would stop loading.
DOMAIN="$(grep -m1 -oP 'server_name\s+\K[^\s;_]+' "$NGINX_SRC" || true)"
if [[ -n "$DOMAIN" && -d "/etc/letsencrypt/live/$DOMAIN" ]] && command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "$DOMAIN" --reinstall --redirect --non-interactive --no-eff-email
  nginx -t && systemctl reload nginx
fi

echo "Nginx site installed: $NGINX_AVAIL"
echo "Reload done. Point DNS here, then: certbot --nginx -d your.domain.com"
