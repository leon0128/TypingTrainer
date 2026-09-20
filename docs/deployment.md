# Deployment

The production composition is `infra/compose.yaml`: `caddy` (TLS, the static web build, the `/api`
proxy) → `api` → `db` (docs/requirements.md §9.7). Two multi-architecture images are built from
this repository (`infra/docker/api.Dockerfile`, `infra/docker/caddy.Dockerfile`) and published to
GHCR by `.github/workflows/docker.yml` under the 12-character commit hash and `latest`.

Status: everything below marked **verified** was run on one machine (Docker Desktop, arm64 and
amd64 images, Caddy's local CA). **Not yet verified** items are listed at the end; nothing here has
run on a public host, on GitHub Actions, or on a Raspberry Pi.

## Version

Every stored run records the version of the API that scored it (`play_sessions.app_version`, R7),
so a later scoring change never silently mixes results. The version is the commit hash:

```bash
infra/docker/version.sh    # 12 characters, plus -dirty if the tree has uncommitted changes
```

The API image refuses to build without one (`APP_VERSION` build argument). Deploy only images built
from a clean tree.

## First deployment (Lightsail, 1 GB or more: Docker)

1. Create an instance with at least 1 GB of RAM (Ubuntu LTS), open TCP 80 and 443 and UDP 443 in
   its firewall, and point a DNS `A` record for the host name at its static IP. Caddy obtains its
   certificate on first start, so the record must resolve first.
2. Install Docker Engine and the Compose plugin.
3. Copy the `infra/` directory to the server (only `infra/` is needed: the images come from GHCR).
4. `cp .env.example .env` and fill it in:
   - `APP_VERSION`: the tag to deploy, a commit hash published by the workflow.
   - `APP_DOMAIN` and `APP_ORIGIN`: the host name, and `https://` plus that host name.
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24` (hex keeps it safe inside a URL).
   - `PASSWORD_PEPPER`: `openssl rand -base64 32`. **Keep a copy apart from the server and from
     the database backups**: it is mixed into every password hash, and losing it invalidates every
     password (§7). The database dump does not contain it.
5. Start the database, apply migrations, then start everything. Migrations are never run at
   start-up (§9.2), so this is a deliberate step, and the API reports not ready until it is done:

   ```bash
   docker compose pull
   docker compose up -d db
   docker compose run --rm --no-deps api node dist/migrate.js
   docker compose up -d
   ```

6. Check `https://<host>/api/health/ready` (200), register an account, and play a run.

## Updating

Set `APP_VERSION` to the new hash in `.env`, then `docker compose pull`, run the migration step
above (it says "no pending migrations" when there is nothing to apply), and `docker compose up -d`.
Roll back by setting the previous `APP_VERSION` again; a migration is undone only deliberately,
with a reviewed `down`, never automatically.

## Backups

`infra/backup.sh` writes a compressed `pg_dump` to `BACKUP_DIR`, keeps 7 days, and can hand each
new dump to `BACKUP_COPY_COMMAND` to copy it off the host (§9.6). Schedule it daily, for example:

```cron
15 3 * * * BACKUP_DIR=/var/backups/typing-trainer BACKUP_COPY_COMMAND=/usr/local/bin/copy-offsite /srv/typing-trainer/infra/backup.sh
```

A failed dump exits non-zero and leaves no file, so cron mail is the alarm. Restore into an empty
database with `gunzip -c <dump> | docker compose exec -T db psql -U typing_trainer -d <database>`.
**Verified:** a dump restores into a fresh database with the same rows, old dumps are pruned by age,
and a stopped database or a failed `pg_dump` fails the script without leaving a file.

**Erased accounts and backups.** A player who deletes their account (Account screen, §7) is erased
from the database at once, but every dump taken before that still holds their data until it is pruned,
**up to 7 days** (and longer for any copy handed to `BACKUP_COPY_COMMAND`); the screen says so. There is
no purge. Restoring a dump also **restores the accounts erased since it was taken**, complete with
their runs. After a restore, ask the people concerned, or erase the accounts again from the record you
keep of who asked, before letting anyone in.

## Lightsail 512 MB (native, no Docker)

On the $5 plan (512 MB) Docker's daemons alone take roughly 100–150 MB, so PostgreSQL, Caddy and the
API run directly on the host from a release tarball. The estimate is 300–380 MB resident, with a 1 GB
swap file as the safety net; **these figures are not measured**, so check them after the first
deployment (below). Everything for this lives in `infra/native/`.

1. Create the instance: **Linux/Unix, OS only, Debian 12** (Ubuntu's snapd and SSM agent cost 50 MB
   or more), the $5 plan. Attach a static IP, open TCP 80 and 443 and UDP 443, and point the DNS `A`
   record at it.
2. Copy `infra/native/` to the server and run, as root:

   ```bash
   ./setup.sh typing.example.com
   ```

   It adds the swap file and `vm.swappiness=20`, installs PostgreSQL 16, Caddy and Node 24 (the
   official tarball, checked against its checksum), applies the low-memory PostgreSQL settings,
   creates the database and role, installs the API service, and writes `/etc/typing-trainer/env`
   with fresh secrets. **Copy `PASSWORD_PEPPER` from that file to somewhere off the server and off the
   backups now** (§7).
3. Deploy a release. Every push to master publishes `typing-trainer-<hash>-linux-x64.tar.gz` (and its
   `.sha256`) as a GitHub release named by the 12-character hash, from
   `.github/workflows/release-tarball.yml`:

   ```bash
   ./deploy.sh <hash>
   ```

   While the repository is private the download fails; download the two files elsewhere, copy them
   to the server, and run `TARBALL=/path/typing-trainer-<hash>-linux-x64.tar.gz ./deploy.sh <hash>`.
   The script extracts the release, runs the migration (explicit, as always), switches
   `/opt/typing-trainer/current`, restarts the API, and waits for `/api/health/ready`; if that never
   comes it switches back and exits non-zero.
4. Check `https://<host>/api/health/ready`, then sign in with a real browser (see "Not yet verified").

Update and roll back are both `./deploy.sh <hash>`: an old release directory is reused as it is
(the newest three are kept). Backups use the same script with the native command:

```cron
15 3 * * * BACKUP_DIR=/var/backups/typing-trainer BACKUP_DB_COMMAND="runuser -u postgres -- pg_dump --no-owner typing_trainer" /srv/typing-trainer/infra/backup.sh
```

(`backup.sh` is not in the tarball; copy it next to `infra/native/`, or adjust the path.) Restore with
`gunzip -c <dump> | runuser -u postgres -- psql typing_trainer` into an empty database.

**Measure after the first deployment**, and write the numbers here:

```bash
free -m; systemctl status typing-trainer-api postgresql@16-main caddy | grep -E 'Memory|Active'
```

If the API is often near its `MemoryHigh=160M`, or swap use keeps growing, move to the $7 plan
(Lightsail can create a larger instance from a snapshot) and the Docker path above. The limits are in
`typing-trainer-api.service`, `postgresql-512mb.conf` and `caddy-drop-in.conf`.

## Raspberry Pi 3 B+ (fallback)

Use 64-bit Raspberry Pi OS Lite (the `linux/arm64` images need it), boot from a USB SSD, add swap or
zram, and start with the tuning override (§9.7):

```bash
docker compose -f compose.yaml -f compose.pi.yaml up -d
```

Pass the same `-f` options to `backup.sh` through `COMPOSE_FILES`. Cloudflare Tunnel in front of
Caddy is the documented exposure (§9.7); its set-up is an outline only and has not been tried.

### Password hashing time on the Pi

Argon2id at the OWASP minimum (19 MiB, 2 passes, 1 lane, §7) is memory-hard, so the Pi's slow
memory and in-order cores matter. The API image carries a benchmark that uses the very same
`PasswordHasher` and parameters as sign-in:

```bash
docker run --rm --entrypoint node ghcr.io/leon0128/typingtrainer-api:<version> dist/argon2-bench.js 20
```

**No Pi was available, so this has not been measured on one.** What was measured is the same image
on an Apple silicon Mac under `--cpus=1 --memory=256m --memory-swap=256m`: hash and verify each
about 9 ms (max 16 ms), four verifies at once 28 ms, and no out-of-memory kill under a 128 MiB cap.
A CPU limit does not slow a core, so this is the arm64 code path and a memory-fit check, not a Pi
timing. A Cortex-A53 at 1.4 GHz is expected to be well over ten times slower per core; that factor is
an assumption (roughly 0.1–0.4 s per hash), not a result.

Decision rule for when someone runs it on the Pi: up to about 0.5 s is fine for a handful of
players (sign-in is limited to 20 attempts per address per 15 minutes, §7); over about 1 s, lower
the cost with one of OWASP's equivalent settings rather than the memory-hungry default, in
`PASSWORD_HASH_OPTIONS` in `apps/api/src/modules/auth/password-hasher.ts`: 12 MiB with 3 passes,
9 MiB with 4, or 7 MiB with 5. Older hashes are upgraded on the next sign-in (`needsRehash`).

## Network and compression

Measured through Caddy over TLS: the 20-block run payload is 119,958 bytes plain and 8,280 bytes
gzip; the JavaScript bundle 382,501 and 120,537. That is inside §9.7's per-run budget (about
30 KB) with room to spare. Caddy's `encode` offers zstd and gzip but not brotli, so §9.7's brotli
figures are gzip figures in practice. Assets are content-hashed and served immutable.

## Local HTTPS check

To exercise the production behaviour on one machine (the `__Host-` cookie needs HTTPS), write an
env file with `APP_VERSION=$(infra/docker/version.sh)`, `APP_DOMAIN=localhost`,
`APP_ORIGIN=https://localhost:8443`, and fresh `POSTGRES_PASSWORD` and `PASSWORD_PEPPER` values, then:

```bash
F="-f infra/compose.yaml -f infra/compose.local-https.yaml --env-file /tmp/tt.env"
docker compose $F up -d --build
docker compose $F run --rm --no-deps api node dist/migrate.js
docker cp typing-trainer-caddy-1:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
curl --cacert /tmp/caddy-root.crt https://localhost:8443/api/health/ready
```

**Verified this way:** the certificate validates against Caddy's local CA over HTTP/2;
`__Host-tt_session` is issued `Secure; HttpOnly; SameSite=Lax; Path=/` with no `Domain`, is stored
and sent back by curl (which enforces the prefix rules), and is expired on logout; a request with a
foreign `Origin` is 403; the API sees the real client address (not Caddy's) and ignores a forged
`X-Forwarded-For`, because `TRUST_PROXY` names only the edge network; a run submitted through the
stack is stored with the image's version as `app_version`.

## Not yet verified

- **A real browser and a public certificate.** The cookie was checked with curl and a local CA, not
  in a browser and not with a Let's Encrypt certificate. Do this on the first real deployment:
  sign in, reload, sign out, and confirm the cookie in the browser's storage panel.
- **GitHub Actions.** `.github/workflows/docker.yml`, the existing `ci.yml` jobs, and publishing to
  GHCR have never run; the first push is their first test.
- **The Raspberry Pi**: password hashing time (above), memory use under the tuning override, and
  Cloudflare Tunnel.
- **Lightsail**: the instance sizing and the transfer allowance are from §9.7's estimate, not from
  a running instance.
- **The native 512 MB deployment**: `setup.sh` and `deploy.sh` have only been syntax-checked, and the
  service unit passed `systemd-analyze verify` on Debian 12; neither has run on a real instance.
  The tarball was assembled and unpacked on the development machine (structure, version file, and
  `dist/main.js` reaching environment validation), but the linux-x64 Argon2 binding comes only from
  the GitHub Actions run, which has never happened. The memory figures are estimates.
