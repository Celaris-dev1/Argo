#!/usr/bin/env bash
# Build the ultra-lean images on a bigger box (8 GB is plenty) and pack them for a small one.
# The 2 GB box never builds: it only runs `docker load`.
#
#   bash infra/compose/build-ultra-images.sh             # Scout (Lightpanda); writes argo-ultra-images.tar.gz
#   PAGE_BROWSER=chrome bash infra/compose/build-ultra-images.sh   # Navigator: chrome-headless-shell, amd64
#   scp argo-ultra-images.tar.gz root@[2001:db8::10]:/root/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-argo-ultra-images.tar.gz}"
PAGE_BROWSER="${PAGE_BROWSER:-lightpanda}"
case "$PAGE_BROWSER" in
  lightpanda) COMPUTER_TAG=scout ;;
  chrome) COMPUTER_TAG=navigator ;;
  *) echo "PAGE_BROWSER must be lightpanda or chrome" >&2; exit 1 ;;
esac
docker build -f "$ROOT/infra/sandboxes/computer/Dockerfile.headless" \
  --build-arg PAGE_BROWSER="$PAGE_BROWSER" \
  -t "argo/computer:$COMPUTER_TAG" "$ROOT/infra/sandboxes/computer"
DOCKER_BUILDKIT=1 docker build -t argo/app:local -f "$ROOT/infra/compose/Dockerfile" "$ROOT"
# Pull the small third-party images once here so the small box does not need a registry.
# Saved by tag (a loaded image keeps no registry digest); install-ultra.sh sets POSTGRES_IMAGE to match.
extra=(busybox:1 postgres:16)
for img in "${extra[@]}"; do docker pull "$img"; done
docker save "argo/computer:$COMPUTER_TAG" argo/app:local "${extra[@]}" | gzip -1 > "$OUT"
ls -lh "$OUT"
echo "Copy $OUT and this checkout's infra/compose folder to the small box, then run install-ultra.sh."
