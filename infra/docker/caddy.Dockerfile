# Caddy with the web app baked in (§9.7): TLS termination, the static build, and the /api proxy in
# one image, so nothing has to be copied between containers at start-up. Build from the repository
# root:  docker buildx build -f infra/docker/caddy.Dockerfile .

FROM node:24-alpine AS builder
RUN npm install --global pnpm@12.4.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @typing-trainer/web...
RUN pnpm --filter @typing-trainer/web build

FROM caddy:2-alpine
COPY --from=builder /repo/apps/web/dist /srv/web
COPY infra/Caddyfile /etc/caddy/Caddyfile
