#!/usr/bin/env bash
# IPv4 egress for IPv6-only boxes over WireGuard.
# GitHub, many websites and some model APIs only answer over IPv4. This sends a small box's
# IPv4 traffic through a box that has IPv4 (for example one of your 8 GB servers). IPv6 stays
# native. Run as root.
#
# On the box WITH IPv4 (once, then once per small box):
#   sudo bash ultra-egress.sh server            # sets up wg0 and NAT, idempotent
#   sudo bash ultra-egress.sh add-peer ultra1   # prints a client config for box "ultra1"
#
# On the IPv6-only box:
#   sudo bash ultra-egress.sh client ultra1.conf
#   curl -4 https://api.github.com              # should answer
set -euo pipefail

WG_DIR=/etc/wireguard
WG_IF=wg0
WG_PORT="${RAKAZO_WG_PORT:-51820}"
WG_NET="${RAKAZO_WG_NET:-10.77.0}"   # /24, server is .1

need_root() { [ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }; }
install_wg() {
  command -v wg >/dev/null 2>&1 && return
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard-tools iptables
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q wireguard-tools iptables
  else
    echo "Install wireguard-tools, then run again." >&2; exit 1
  fi
}

server() {
  need_root; install_wg
  mkdir -p "$WG_DIR"; chmod 700 "$WG_DIR"
  if [ ! -f "$WG_DIR/$WG_IF.conf" ]; then
    umask 077
    wg genkey | tee "$WG_DIR/server.key" | wg pubkey > "$WG_DIR/server.pub"
    out_if="$(ip -4 route show default | awk '{print $5; exit}')"
    [ -n "$out_if" ] || { echo "This box has no IPv4 default route." >&2; exit 1; }
    cat > "$WG_DIR/$WG_IF.conf" <<EOF
[Interface]
Address = $WG_NET.1/24
ListenPort = $WG_PORT
PrivateKey = $(cat "$WG_DIR/server.key")
PostUp = sysctl -qw net.ipv4.ip_forward=1; iptables -t nat -A POSTROUTING -s $WG_NET.0/24 -o $out_if -j MASQUERADE; iptables -A FORWARD -i $WG_IF -j ACCEPT; iptables -A FORWARD -o $WG_IF -m state --state RELATED,ESTABLISHED -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s $WG_NET.0/24 -o $out_if -j MASQUERADE; iptables -D FORWARD -i $WG_IF -j ACCEPT; iptables -D FORWARD -o $WG_IF -m state --state RELATED,ESTABLISHED -j ACCEPT
EOF
  fi
  systemctl enable --now "wg-quick@$WG_IF" >/dev/null
  echo "WireGuard egress server is up on UDP $WG_PORT. Open that port (IPv6) in your firewall."
}

add_peer() {
  need_root
  name="${1:?usage: add-peer <name>}"
  [ -f "$WG_DIR/$WG_IF.conf" ] || server
  last=$(grep -oE "AllowedIPs = $WG_NET\.[0-9]+" "$WG_DIR/$WG_IF.conf" | awk -F. '{print $4}' | sort -n | tail -1)
  n=$(( ${last:-1} + 1 ))
  [ "$n" -lt 255 ] || { echo "Peer range full." >&2; exit 1; }
  umask 077
  key=$(wg genkey); pub=$(printf '%s' "$key" | wg pubkey)
  printf '\n# %s\n[Peer]\nPublicKey = %s\nAllowedIPs = %s.%s/32\n' "$name" "$pub" "$WG_NET" "$n" >> "$WG_DIR/$WG_IF.conf"
  wg set "$WG_IF" peer "$pub" allowed-ips "$WG_NET.$n/32"
  v6=$(ip -6 addr show scope global | awk '/inet6/ {sub(/\/.*/,"",$2); print $2; exit}')
  cat > "$name.conf" <<EOF
[Interface]
Address = $WG_NET.$n/32
PrivateKey = $key
DNS = 1.1.1.1, 2606:4700:4700::1111

[Peer]
PublicKey = $(cat "$WG_DIR/server.pub")
Endpoint = [$v6]:$WG_PORT
# IPv4 only goes through the tunnel; IPv6 stays native.
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
  echo "Wrote $name.conf. Copy it to the small box (scp over IPv6) and run: ultra-egress.sh client $name.conf"
}

client() {
  need_root; install_wg
  conf="${1:?usage: client <file.conf>}"
  mkdir -p "$WG_DIR"; chmod 700 "$WG_DIR"
  install -m 600 "$conf" "$WG_DIR/$WG_IF.conf"
  # Debian minimal images lack resolvconf; drop the DNS line rather than fail.
  command -v resolvconf >/dev/null 2>&1 || sed -i '/^DNS = /d' "$WG_DIR/$WG_IF.conf"
  systemctl enable --now "wg-quick@$WG_IF" >/dev/null
  sleep 2
  if curl -4 -fsS --max-time 10 -o /dev/null https://api.github.com; then
    echo "IPv4 egress works through the tunnel."
  else
    echo "Tunnel is up but IPv4 test failed. Check UDP $WG_PORT on the server." >&2; exit 1
  fi
}

case "${1:-}" in
  server) server ;;
  add-peer) shift; add_peer "$@" ;;
  client) shift; client "$@" ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
