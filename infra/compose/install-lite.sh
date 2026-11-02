#!/usr/bin/env bash
# Rakazo lite installer for an 8 GB Linux machine.
# Builds the app and computer images from this checkout, writes .env with fresh secrets,
# and starts the stack with docker-compose.lite.yml.
#
#   bash infra/compose/install-lite.sh                 # stack only (API models)
#   bash infra/compose/install-lite.sh --local-ai qwen3:1.7b   # plus Ollama with that model
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_DIR="$ROOT/infra/compose"
ENV_FILE="$COMPOSE_DIR/.env"
LOCAL_AI=""
LOCAL_MODEL=""
if [ "${1:-}" = "--local-ai" ]; then LOCAL_AI=1; LOCAL_MODEL="${2:-qwen3:1.7b}"; fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. Install it first." >&2; exit 1; }; }
need docker; need openssl
docker compose version >/dev/null 2>&1 || { echo "Install the Docker Compose plugin." >&2; exit 1; }

mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
echo "RAM: $((mem_kb / 1024)) MB, swap: $((swap_kb / 1024)) MB"
if [ "$swap_kb" -lt 2000000 ]; then
  echo "Less than 2 GB swap. Building the images needs headroom on 8 GB."
  echo "Add 4 GB swap with:"
  echo "  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
  echo "  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
  read -r -p "Continue anyway? [y/N] " answer
  [ "${answer:-n}" = "y" ] || exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Writing $ENV_FILE"
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 16)"
    printf 'POSTGRES_APP_PASSWORD=%s\n' "$(openssl rand -hex 16)"
    printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'SCREEN_PROXY_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'SANDBOX_SUPERVISOR_TOKEN=%s\n' "$(openssl rand -hex 32)"
    printf 'SANDBOX_PROVIDER=docker\n'
    cat "$COMPOSE_DIR/.env.lite.example"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "Keeping existing $ENV_FILE"
fi
# Bot computers default to restricted egress, which needs host firewall rules (root).
if ! grep -q '^SANDBOX_COMPUTER_EGRESS=' "$ENV_FILE"; then
  echo "Installing the bot-computer firewall rules (needs sudo)…"
  if sudo bash "$COMPOSE_DIR/restrict-computer-egress.sh"; then
    echo 'SANDBOX_COMPUTER_EGRESS=restricted' >> "$ENV_FILE"
  else
    echo "Could not install them; bot computers get open internet access instead."
    echo 'SANDBOX_COMPUTER_EGRESS=open' >> "$ENV_FILE"
  fi
fi
if [ -n "$LOCAL_AI" ]; then
  sed -i "s|^RAKAZO_LOCAL_MODELS=.*|RAKAZO_LOCAL_MODELS=$LOCAL_MODEL|" "$ENV_FILE"
fi

echo "Building the computer image (bot desktop, browser, OpenCode)…"
docker build -t rakazo/computer:local "$ROOT/infra/sandboxes/computer"
echo "Building the app image (this is the slow, memory-hungry step)…"
DOCKER_BUILDKIT=1 docker build -t rakazo/app:local -f "$COMPOSE_DIR/Dockerfile" "$ROOT"

cd "$COMPOSE_DIR"
profile=()
[ -n "$LOCAL_AI" ] && profile=(--profile local-ai)
docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.lite.yml "${profile[@]}" up -d

if [ -n "$LOCAL_AI" ]; then
  echo "Pulling $LOCAL_MODEL into Ollama…"
  docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.lite.yml "${profile[@]}" \
    exec -T ollama ollama pull "$LOCAL_MODEL"
fi

echo
echo "Rakazo lite is starting at http://127.0.0.1:5173"
echo "Add models in Settings > Models: pick a preset or paste any OpenAI-compatible URL."
