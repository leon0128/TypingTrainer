#!/usr/bin/env bash
# Daily database backup (§9.6: daily pg_dump, 7 days retained, copied off the host).
#
#   BACKUP_DIR=/var/backups/typing-trainer infra/backup.sh
#
# Run it from cron or a systemd timer. Optional variables:
#   BACKUP_KEEP_DAYS    days of dumps to keep (default 7)
#   BACKUP_COPY_COMMAND a command that receives the new dump's path as its last argument and copies
#                       it off the host, for example "rclone copyto" needs a destination, so wrap
#                       it in a script; a non-zero exit fails this script and cron reports it
#   COMPOSE_FILES       compose files, default "-f compose.yaml" (add -f compose.pi.yaml on the Pi)
#   BACKUP_DB_COMMAND   a command that writes the dump to standard output, replacing the Compose
#                       database; the native deployment (infra/native) uses
#                       "runuser -u postgres -- pg_dump --no-owner typing_trainer"
#
# The password pepper is not in the database and so not in this dump: back it up separately (§7).
set -euo pipefail

dir=${BACKUP_DIR:?set BACKUP_DIR to the directory that holds the dumps}
keep=${BACKUP_KEEP_DAYS:-7}
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$dir"

file="$dir/typing_trainer-$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

# A partial file is never left under the final name: a dump that fails midway must not look like a
# good backup, so it is written aside and renamed only when pg_dump and gzip both succeeded
# (pipefail: without it the pipeline's status would be gzip's, and a failed pg_dump would leave a
# valid-looking empty archive) and the dump ends with the marker pg_dump writes when it completes.
if [ -n "${BACKUP_DB_COMMAND:-}" ]; then
  # shellcheck disable=SC2086
  $BACKUP_DB_COMMAND | gzip > "$tmp"
else
  # shellcheck disable=SC2086
  (cd "$here" && docker compose ${COMPOSE_FILES:--f compose.yaml} exec -T db \
    pg_dump -U typing_trainer --no-owner typing_trainer) | gzip > "$tmp"
fi
gunzip -c "$tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || { echo "backup failed: the dump is incomplete" >&2; exit 1; }
mv "$tmp" "$file"
trap - EXIT

find "$dir" -name 'typing_trainer-*.sql.gz' -type f -mtime "+$((keep - 1))" -delete

if [ -n "${BACKUP_COPY_COMMAND:-}" ]; then
  # shellcheck disable=SC2086
  $BACKUP_COPY_COMMAND "$file"
fi
echo "$file"
