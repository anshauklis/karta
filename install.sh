#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Parse flags ──────────────────────────────────────────────────────
USE_SSL=false
for arg in "$@"; do
  case "$arg" in
    --ssl) USE_SSL=true ;;
    --help|-h)
      echo "Usage: ./install.sh [--ssl]"
      echo ""
      echo "Options:"
      echo "  --ssl    Enable HTTPS with Let's Encrypt (requires DOMAIN env var)"
      echo ""
      echo "Environment variables:"
      echo "  DOMAIN   Your domain name (required for --ssl, e.g. charts.example.com)"
      echo ""
      echo "Examples:"
      echo "  ./install.sh                                    # HTTP on port 80"
      echo "  DOMAIN=charts.example.com ./install.sh --ssl    # HTTPS with SSL"
      exit 0
      ;;
    *) error "Unknown option: $arg. Use --help for usage." ;;
  esac
done

# ─── Check prerequisites ─────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose V2 is not available. Update Docker or install the compose plugin."
fi

if ! docker info &>/dev/null 2>&1; then
  error "Docker daemon is not running. Start Docker and try again."
fi

ok "Docker and Docker Compose are ready."

# ─── SSL validation ──────────────────────────────────────────────────
if [ "$USE_SSL" = true ]; then
  if [ -z "${DOMAIN:-}" ]; then
    error "DOMAIN environment variable is required for --ssl mode.\n       Usage: DOMAIN=charts.example.com ./install.sh --ssl"
  fi
  info "SSL mode enabled for domain: $DOMAIN"
fi

# ─── Generate .env ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from template..."
  cp .env.example .env
fi

# Replace any CHANGE_ME placeholders with generated secrets
_replace_placeholder() {
  local key="$1"
  local current
  current=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2- || true)
  if [ "$current" = "CHANGE_ME" ] || [ -z "$current" ]; then
    local secret
    if [ "$key" = "POSTGRES_PASSWORD" ] || [ "$key" = "REDIS_PASSWORD" ]; then
      secret=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24 || true)
    else
      secret=$(openssl rand -base64 32)
    fi
    if grep -q "^${key}=" .env 2>/dev/null; then
      sed -i.bak "s|^${key}=.*|${key}=${secret}|" .env
    else
      echo "${key}=${secret}" >> .env
    fi
    rm -f .env.bak
    info "Generated ${key}"
  fi
}

_replace_placeholder JWT_SECRET
_replace_placeholder CONNECTION_SECRET
_replace_placeholder POSTGRES_PASSWORD
_replace_placeholder REDIS_PASSWORD

# Set NEXTAUTH_URL / DOMAIN for SSL mode
if [ "$USE_SSL" = true ]; then
  sed -i.bak "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|" .env
  sed -i.bak "s|^# DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
  sed -i.bak "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
  rm -f .env.bak
fi

ok ".env is ready."

# ─── Start services ──────────────────────────────────────────────────
info "Building and starting Karta..."

if [ "$USE_SSL" = true ]; then
  # Generate nginx SSL config from template
  info "Generating nginx SSL config for $DOMAIN..."
  sed "s/__DOMAIN__/${DOMAIN}/g" nginx.ssl.conf > nginx.ssl.generated.conf

  COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

  # Build and start services (nginx needs certbot-www volume to exist)
  $COMPOSE up -d --build postgres api frontend nginx

  info "Obtaining SSL certificate for $DOMAIN..."
  info "Make sure DNS for $DOMAIN points to this server before continuing."
  $COMPOSE run --rm certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "admin@${DOMAIN}" --agree-tos --no-eff-email \
    -d "$DOMAIN"

  # Reload nginx to pick up new certificate
  $COMPOSE exec nginx nginx -s reload

  echo ""
  ok "Karta is running with HTTPS!"
  echo ""
  info "Open ${GREEN}https://${DOMAIN}${NC} in your browser."
  info "On first launch you will be redirected to the setup page."
  info "Register there — the first user automatically becomes admin."
  echo ""
  info "Certificate auto-renewal is handled by the certbot container."
  info "To manually renew: $COMPOSE run --rm certbot renew"
else
  docker compose up -d --build

  echo ""
  ok "Karta is running!"
  echo ""
  local port
  port=$(grep "^PORT=" .env 2>/dev/null | cut -d= -f2- || echo "8090")
  info "Open ${GREEN}http://localhost:${port}${NC} in your browser."
  info "Or use your server IP: ${GREEN}http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<server-ip>')${NC}"
  info "On first launch you will be redirected to the setup page."
  info "Register there — the first user automatically becomes admin."
fi

echo ""
info "Useful commands:"
echo "  docker compose logs -f        # View logs"
echo "  docker compose restart        # Restart all services"
echo "  docker compose down           # Stop all services"
echo "  docker compose up -d --build  # Rebuild and restart"
