#!/usr/bin/env bash
# Deploys a release tarball built by .github/workflows/release-tarball.yml, and rolls back to an
# older one the same way. Run as root after setup.sh:
#
#   sudo ./deploy.sh <version>      # the 12-character commit hash
#
# Environment:
#   TARBALL   a local .tar.gz to use instead of downloading it (needed while the repository, and so
#             its releases, are private: scp the file and its .sha256 next to it)
#   RELEASES  base URL of the releases (default: this project's GitHub releases)
#   KEEP      releases to keep on disk (default 3)
#
# The order matters: extract, migrate (explicit, never at start-up, spec §9.2), switch the
# `current` link, restart, and wait until the API reports ready. A release that does not become
# ready is switched back.
set -euo pipefail

version=${1:?usage: deploy.sh <version>}
[[ $version =~ ^[0-9a-f]{12}$ ]] || { echo "version must be the 12-character commit hash" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

root=/opt/typing-trainer
name=typing-trainer-$version-linux-x64
releases_url=${RELEASES:-https://github.com/leon0128/typingtrainer/releases/download}
keep=${KEEP:-3}
target=$root/releases/$version

if [ ! -d "$target" ]; then
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  if [ -n "${TARBALL:-}" ]; then
    cp "$TARBALL" "$work/$name.tar.gz"
    cp "$TARBALL.sha256" "$work/$name.tar.gz.sha256"
  else
    curl -fsSL "$releases_url/$version/$name.tar.gz" -o "$work/$name.tar.gz"
    curl -fsSL "$releases_url/$version/$name.tar.gz.sha256" -o "$work/$name.tar.gz.sha256"
  fi
  # The checksum file names the file as built; compare only the hash.
  [ "$(cut -d' ' -f1 "$work/$name.tar.gz.sha256")" = "$(sha256sum "$work/$name.tar.gz" | cut -d' ' -f1)" ] \
    || { echo "checksum mismatch: refusing to deploy" >&2; exit 1; }
  mkdir -p "$target.partial"
  tar -xzf "$work/$name.tar.gz" -C "$target.partial" --strip-components=1
  chmod -R go+rX "$target.partial"
  [ "$(sed -n 's/^APP_VERSION=//p' "$target.partial/version.env")" = "$version" ] \
    || { echo "the tarball is not release $version" >&2; rm -rf "$target.partial"; exit 1; }
  mv "$target.partial" "$target"
fi

previous=$(readlink "$root/current" || true)

# Explicit migration, as a one-off unit with the service's own sandbox and secrets.
echo "migrating"
systemd-run --quiet --wait --pipe --collect \
  -p DynamicUser=yes -p NoNewPrivileges=yes -p ProtectSystem=strict -p PrivateTmp=yes \
  -p WorkingDirectory="$target" -p EnvironmentFile=/etc/typing-trainer/env \
  -p Environment=NODE_ENV=production -p Environment=NODE_OPTIONS=--max-old-space-size=96 \
  /usr/local/bin/node --enable-source-maps dist/migrate.js

ln -sfn "$target" "$root/current"
systemctl restart typing-trainer-api.service

# The Caddyfile ships in the release; reload only when it changed.
if ! cmp -s "$target/Caddyfile" /etc/caddy/Caddyfile; then
  install -m 644 "$target/Caddyfile" /etc/caddy/Caddyfile
  systemctl restart caddy.service
elif ! systemctl is-active --quiet caddy.service; then
  systemctl start caddy.service
fi

ready=no
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/health/ready; then ready=yes; break; fi
  sleep 1
done
if [ "$ready" != yes ]; then
  echo "release $version did not become ready" >&2
  if [ -n "$previous" ]; then
    ln -sfn "$previous" "$root/current"
    systemctl restart typing-trainer-api.service
    echo "switched back to $(basename "$previous")" >&2
  fi
  exit 1
fi

# Keep the newest few releases by modification time, never the one in use.
ls -1dt "$root"/releases/*/ | tail -n "+$((keep + 1))" | while read -r old; do
  [ "$(readlink -f "$root/current")" = "$(readlink -f "$old")" ] || rm -rf "$old"
done

echo "deployed $version"
free -m
