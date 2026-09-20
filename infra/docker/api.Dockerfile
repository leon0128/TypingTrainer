# The API image (§9.7). Build from the repository root:
#   docker buildx build -f infra/docker/api.Dockerfile --build-arg APP_VERSION="$(infra/docker/version.sh)" .
# Multi-architecture: the same file builds linux/amd64 and linux/arm64 (§9.7); @node-rs/argon2 ships
# prebuilt musl bindings for both.

FROM node:24-alpine AS builder
RUN npm install --global pnpm@12.4.1
WORKDIR /repo
COPY . .
# Only the API and the workspace packages it bundles: no content-cli, and so no tree-sitter.
RUN pnpm install --frozen-lockfile --filter @typing-trainer/api...
RUN pnpm --filter @typing-trainer/api build
# Runtime dependencies only. The workspace packages are bundled into dist/, so what is left to
# install is exactly the external dependencies build.ts leaves out.
RUN pnpm --filter @typing-trainer/api deploy --prod /deploy

FROM node:24-alpine
# Every stored run records this (R7), so an image without a real version is refused rather than
# built with the development default `dev`.
ARG APP_VERSION
RUN case "${APP_VERSION}" in ""|dev) echo "APP_VERSION must be set to a real version (infra/docker/version.sh)" >&2; exit 1;; esac
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    HOST=0.0.0.0 \
    PORT=3000 \
    CONTENT_DIR=/app/content/dist
WORKDIR /app
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist/main.js /repo/apps/api/dist/main.js.map /repo/apps/api/dist/migrate.js /repo/apps/api/dist/migrate.js.map ./dist/
COPY --from=builder /repo/content/dist ./content/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health/live || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
