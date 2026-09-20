#!/usr/bin/env bash
# Assembles the release tarball from a built tree, mirroring infra/docker/api.Dockerfile and
# caddy.Dockerfile: the API bundle, its runtime dependencies, the content bundles, the web build,
# and the Caddyfile. Run it from the repository root after
#   pnpm install --frozen-lockfile --filter @typing-trainer/api... --filter @typing-trainer/web...
#   pnpm --filter @typing-trainer/api build && pnpm --filter @typing-trainer/web build
# on the platform it will run on: the native Argon2 binding is chosen at install time, and the
# server is linux-x64 with glibc.
#
#   infra/native/build-tarball.sh <version> [output directory]
set -euo pipefail

version=${1:?usage: build-tarball.sh <12-character commit hash> [output directory]}
[[ $version =~ ^[0-9a-f]{12}$ ]] || { echo "version must be the 12-character commit hash" >&2; exit 1; }
out=${2:-.}
name=typing-trainer-$version-linux-x64

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
stage=$work/$name
mkdir -p "$stage/dist" "$out"

pnpm --filter @typing-trainer/api deploy --prod "$work/deploy"
cp -R "$work/deploy/node_modules" "$stage/node_modules"
for f in main.js main.js.map migrate.js migrate.js.map argon2-bench.js; do
  cp "apps/api/dist/$f" "$stage/dist/$f"
done
cp -R content/dist "$stage/content-dist"
mkdir "$stage/content" && mv "$stage/content-dist" "$stage/content/dist"
cp -R apps/web/dist "$stage/web"
cp infra/Caddyfile "$stage/Caddyfile"
echo "APP_VERSION=$version" > "$stage/version.env"

tar -czf "$out/$name.tar.gz" -C "$work" "$name"
(cd "$out" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
echo "$out/$name.tar.gz"
