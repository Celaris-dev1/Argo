#!/usr/bin/env bash
# Argo ultra-lean installer for a 1 vCPU / 2 GB / 6 GB box (IPv6-only is fine).
# Nothing is built here. Build and pack the images on a bigger box with build-ultra-images.sh.
#
#   sudo bash install-ultra.sh argo-ultra-images.tar.gz [egress.conf]
#
# egress.conf is the WireGuard client file from `ultra-egress.sh add-peer` on an IPv4 box.
# Give it when this box has no IPv4.
set -euo pipefail
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$COMPOSE_DIR/.env"
IMAGES="${1:?usage: install-ultra.sh <images.tar.gz> [egress.conf]}"
EGRESS_CONF="${2:-}"
[ "$(id -u)" = 0 ] || { echo "Run with sudo (swap, firewall and tunnel need root)." >&2; exit 1; }
command -v docker >/dev/null || { echo "Install Docker first." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Install the Docker Compose plugin." >&2; exit 1; }

# 1. Swap: 2 GB, low swappiness so it only catches peaks.
if [ "$(awk '/SwapTotal/ {print $2}' /proc/meminfo)" -lt 1900000 ]; then
  echo "Adding 2 GB swap at /swapfile"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null || echo 'vm.swappiness=10' >> /etc/sysctl.conf

# 2. IPv4 egress for IPv6-only boxes.
if ! ip -4 route show default | grep -q .; then
  if [ -n "$EGRESS_CONF" ]; then
    bash "$COMPOSE_DIR/ultra-egress.sh" client "$EGRESS_CONF"
  else
    echo "This box has no IPv4 route. Bots will fail on IPv4-only sites, GitHub and some model APIs."
    echo "Re-run with a WireGuard client file from: ultra-egress.sh add-peer <name>  (on an IPv4 box)."
    read -r -p "Continue without IPv4? [y/N] " a; [ "${a:-n}" = y ] || exit 1
  fi
fi

# 3. Disk check: images plus Postgres need roughly 3 GB free.
free_mb=$(df -Pm /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}')
[ "${free_mb:-0}" -ge 2500 ] || echo "Warning: only ${free_mb:-?} MB free under /var/lib/docker."

# Docker logs can fill a 6 GB disk; cap them (only when no daemon.json exists yet).
if [ ! -f /etc/docker/daemon.json ]; then
  printf '{\n  "log-driver": "local",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi

# 4. Images.
echo "Loading images…"
gunzip -c "$IMAGES" | docker load
# Use whichever computer image the bundle carried (Navigator if build-ultra-images.sh built it).
COMPUTER_TAG=scout
# Archives built before Scout was named carry the same image as argo/computer:headless.
docker image inspect argo/computer:scout >/dev/null 2>&1 || COMPUTER_TAG=headless
docker image inspect argo/computer:navigator >/dev/null 2>&1 && COMPUTER_TAG=navigator
docker image prune -f >/dev/null

# 5. Environment.
if [ ! -f "$ENV_FILE" ]; then
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 16)"
    printf 'POSTGRES_APP_PASSWORD=%s\n' "$(openssl rand -hex 16)"
    printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'SCREEN_PROXY_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'SANDBOX_SUPERVISOR_TOKEN=%s\n' "$(openssl rand -hex 32)"
    printf 'SANDBOX_PROVIDER=docker\n'
    printf 'POSTGRES_IMAGE=postgres:16\n'
    printf 'ARGO_COMPUTER_IMAGE_TAG=%s\n' "$COMPUTER_TAG"
    printf 'ARGO_COMPUTER_HEADLESS=1\n'
    [ -f "$COMPOSE_DIR/.env.lite.example" ] && grep -v '^ARGO_COMPUTER_IMAGE_TAG=' "$COMPOSE_DIR/.env.lite.example"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
if ! grep -q '^SANDBOX_COMPUTER_EGRESS=' "$ENV_FILE"; then
  if bash "$COMPOSE_DIR/restrict-computer-egress.sh"; then
    echo 'SANDBOX_COMPUTER_EGRESS=restricted' >> "$ENV_FILE"
  else
    echo 'SANDBOX_COMPUTER_EGRESS=open' >> "$ENV_FILE"
  fi
fi

# 6. Start.
cd "$COMPOSE_DIR"
docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.lite.yml \
  -f docker-compose.ultra.yml up -d --pull never
echo
echo "Argo ultra is starting at http://127.0.0.1:5173 ($COMPUTER_TAG computer, API models)."
echo "Put Cloudflare (proxied) or Caddy in front so IPv4 users can reach this IPv6 box."
