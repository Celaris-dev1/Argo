#!/usr/bin/env bash
# Build the ultra-lean images on a bigger box (8 GB is plenty) and pack them for a small one.
# The 2 GB box never builds: it only runs `docker load`.
#
#   bash infra/compose/build-ultra-images.sh             # writes rakazo-ultra-images.tar.gz
#   scp rakazo-ultra-images.tar.gz root@[2001:db8::10]:/root/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-rakazo-ultra-images.tar.gz}"
docker build -f "$ROOT/infra/sandboxes/computer/Dockerfile.headless" \
  -t rakazo/computer:headless "$ROOT/infra/sandboxes/computer"
DOCKER_BUILDKIT=1 docker build -t rakazo/app:local -f "$ROOT/infra/compose/Dockerfile" "$ROOT"
# Pull the small third-party images once here so the small box does not need a registry.
# Saved by tag (a loaded image keeps no registry digest); install-ultra.sh sets POSTGRES_IMAGE to match.
extra=(busybox:1 postgres:16)
for img in "${extra[@]}"; do docker pull "$img"; done
docker save rakazo/computer:headless rakazo/app:local "${extra[@]}" | gzip -1 > "$OUT"
ls -lh "$OUT"
echo "Copy $OUT and this checkout's infra/compose folder to the small box, then run install-ultra.sh."
