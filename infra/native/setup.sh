#!/usr/bin/env bash
# One-time set-up of a 512 MB Lightsail instance (Debian 12) to run TypingTrainer natively:
# PostgreSQL 16, Caddy, Node 24, the API service, and a swap file. Run it as root from a copy of
# this directory; it is safe to run again.
#
#   sudo ./setup.sh typing.example.com
#
# Nothing is deployed yet: run deploy.sh <version> afterwards. See docs/deployment.md.
set -euo pipefail

domain=${1:?usage: setup.sh <host name>, for example typing.example.com}
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)

. /etc/os-release
if [ "${ID:-}" != debian ] || [ "${VERSION_ID:-}" != 12 ]; then
  echo "this script is written for Debian 12 (found ${PRETTY_NAME:-unknown})" >&2
  exit 1
fi
if [ "$(dpkg --print-architecture)" != amd64 ]; then
  echo "the release tarball is built for amd64 only" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# --- swap: the safety net that keeps a memory spike from becoming an OOM kill ------------------
if ! swapon --show=NAME --noheadings | grep -q .; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness = 20' > /etc/sysctl.d/90-typing-trainer.conf
sysctl -q -p /etc/sysctl.d/90-typing-trainer.conf

# --- packages -----------------------------------------------------------------------------------
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg openssl xz-utils debian-keyring debian-archive-keyring \
  apt-transport-https postgresql-common

# PostgreSQL 16 from PGDG, the major version the schema is tested on (Debian 12 ships 15).
if [ ! -f /etc/apt/sources.list.d/pgdg.list ] && [ ! -f /etc/apt/sources.list.d/pgdg.sources ]; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
fi

if [ ! -f /etc/apt/sources.list.d/caddy-stable.list ]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
fi
apt-get update -qq
apt-get install -y -qq postgresql-16 caddy

# --- Node 24: the official tarball, checked against its published checksum --------------------
if ! /usr/local/bin/node --version 2>/dev/null | grep -q '^v24\.'; then
  base=https://nodejs.org/dist/latest-v24.x
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  curl -fsSL "$base/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
  file=$(grep -oE 'node-v24[0-9.]*-linux-x64\.tar\.xz' "$work/SHASUMS256.txt" | head -n 1)
  curl -fsSL "$base/$file" -o "$work/$file"
  (cd "$work" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf /opt/node
  mkdir -p /opt/node
  tar -xJf "$work/$file" -C /opt/node --strip-components=1
  ln -sfn /opt/node/bin/node /usr/local/bin/node
fi

# --- secrets and configuration ------------------------------------------------------------------
install -d -m 755 /etc/typing-trainer /opt/typing-trainer/releases
if [ ! -f /etc/typing-trainer/env ]; then
  db_password=$(openssl rand -hex 24)
  umask 077
  cat > /etc/typing-trainer/env <<EOF
APP_ORIGIN=https://$domain
TRUST_PROXY=127.0.0.1/32
POSTGRES_PASSWORD=$db_password
DATABASE_URL=postgres://typing_trainer:$db_password@127.0.0.1:5432/typing_trainer
PASSWORD_PEPPER=$(openssl rand -base64 32)
EOF
  umask 022
  echo
  echo "PASSWORD_PEPPER was generated in /etc/typing-trainer/env. Copy it somewhere OFF this server"
  echo "and off the database backups now: losing it invalidates every password (spec §7)."
fi
chmod 600 /etc/typing-trainer/env

cat > /etc/typing-trainer/caddy.env <<EOF
APP_DOMAIN=$domain
API_UPSTREAM=127.0.0.1:3000
WEB_ROOT=/opt/typing-trainer/current/web
EOF
chmod 644 /etc/typing-trainer/caddy.env

# --- PostgreSQL ---------------------------------------------------------------------------------
install -m 644 "$here/postgresql-512mb.conf" /etc/postgresql/16/main/conf.d/typing-trainer.conf
systemctl restart postgresql@16-main

db_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' /etc/typing-trainer/env)
psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -X -q "$@"; }
if [ "$(psql_admin -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'typing_trainer'")" != 1 ]; then
  psql_admin -c "CREATE ROLE typing_trainer LOGIN PASSWORD '$db_password'"
else
  psql_admin -c "ALTER ROLE typing_trainer PASSWORD '$db_password'"
fi
if [ "$(psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname = 'typing_trainer'")" != 1 ]; then
  psql_admin -c "CREATE DATABASE typing_trainer OWNER typing_trainer"
fi

# --- services -----------------------------------------------------------------------------------
install -m 644 "$here/typing-trainer-api.service" /etc/systemd/system/typing-trainer-api.service
install -d /etc/systemd/system/caddy.service.d
install -m 644 "$here/caddy-drop-in.conf" /etc/systemd/system/caddy.service.d/typing-trainer.conf
systemctl daemon-reload
systemctl enable typing-trainer-api.service caddy.service >/dev/null

echo
echo "Set up for https://$domain. Next: ./deploy.sh <version>  (see docs/deployment.md)"
free -m
