FROM node:24.22.1-bookworm@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a AS build
# pnpm lives in the image so containers start without downloading it.
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable
WORKDIR /app
# Manifests land before the source tree so editing a source file does not re-run the
# install. pnpm gets a partial workspace: every package listed in pnpm-workspace.yaml
# needs its manifest below, or --frozen-lockfile fails. The store is a cache mount, so
# a lockfile change reuses whatever was already downloaded.
COPY --chmod=755 package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack install && chmod -R a+rX "${COREPACK_HOME}"
COPY --chmod=755 patches patches
COPY --chmod=755 apps/api/package.json apps/api/
COPY --chmod=755 apps/desktop/package.json apps/desktop/
COPY --chmod=755 apps/mobile/package.json apps/mobile/
COPY --chmod=755 apps/web/package.json apps/web/
COPY --chmod=755 apps/worker/package.json apps/worker/
COPY --chmod=755 apps/www/package.json apps/www/
COPY --chmod=755 packages/adapter-kit/package.json packages/adapter-kit/
COPY --chmod=755 packages/adapters/package.json packages/adapters/
COPY --chmod=755 packages/auth/package.json packages/auth/
COPY --chmod=755 packages/chat-ui/package.json packages/chat-ui/
COPY --chmod=755 packages/contracts/package.json packages/contracts/
COPY --chmod=755 packages/core/package.json packages/core/
COPY --chmod=755 packages/db/package.json packages/db/
COPY --chmod=755 packages/logging/package.json packages/logging/
COPY --chmod=755 packages/memory/package.json packages/memory/
COPY --chmod=755 packages/testkit/package.json packages/testkit/
COPY --chmod=755 packages/ui-tokens/package.json packages/ui-tokens/
COPY --chmod=755 packages/ui-web/package.json packages/ui-web/
COPY --chmod=755 infra/sandboxes/supervisor/package.json infra/sandboxes/supervisor/
COPY --chmod=755 infra/updater/package.json infra/updater/
# Server images need only this machine's native binaries, not the arm64/musl copies the
# repo keeps for cross-platform dev, and never the mobile, desktop or marketing-site deps
# (Expo, React Native, Electron, Pagefind). ARGO_FULL_INSTALL=1 restores the old behaviour.
ARG ARGO_FULL_INSTALL=0
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  if [ "$ARGO_FULL_INSTALL" = 1 ]; then \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store; \
  else \
    node -e 'const f="package.json",p=require("./"+f);p.pnpm.supportedArchitectures={os:["current"],cpu:["current"],libc:["current"]};require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' \
    && pnpm install --frozen-lockfile --store-dir=/pnpm/store \
      --filter '!@argo/mobile' --filter '!@argo/desktop' --filter '!@argo/www'; \
  fi
# Normalize modes: a restrictive host umask (e.g. 077 on hardened hosts) would otherwise
# leave the copied tree unreadable to USER node at runtime.
COPY --chmod=755 . .
RUN pnpm --filter @argo/db generate
RUN pnpm --filter @argo/api --filter @argo/worker build
RUN ARGO_ALLOW_DEV_SECRETS=1 pnpm --filter @argo/web build
# Drop what only the build needed: mobile/desktop/site sources (their manifests stay so
# pnpm still sees a valid workspace) and build caches.
RUN find apps/mobile apps/desktop apps/www -mindepth 1 -maxdepth 1 ! -name package.json -exec rm -rf {} + \
  && rm -rf node_modules/.cache apps/*/node_modules/.cache apps/web/node_modules/.vite .turbo

# Runtime: the slim base drops ~800 MB of compilers and headers the full node image carries.
FROM node:24.22.1-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl git \
  && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable
COPY --from=build /usr/local/share/corepack /usr/local/share/corepack
WORKDIR /app
COPY --from=build /app /app
RUN install -d -m 750 -o node -g node /data /app/apps/web/node_modules/.vite-temp /app/apps/web/asset-archive
ARG GIT_SHA
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
EXPOSE 3100 5173 7091
USER node
CMD ["pnpm", "--filter", "@argo/api", "start"]
