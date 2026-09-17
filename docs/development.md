# Local Development

Requirements: Node.js (see `.node-version`), pnpm, and Docker for the development database.

## Database

`infra/compose.dev.yaml` runs PostgreSQL 16 for development only, bound to `127.0.0.1:5432` with a
named volume. The production composition is `infra/compose.yaml`.

```bash
pnpm db:up      # start and wait until healthy
pnpm db:down    # stop; add `-v` to docker compose down to delete the data volume
```

## API

```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter @typing-trainer/api migration:run
pnpm api:dev    # http://127.0.0.1:3000/api/health/ready
```

`apps/api/.env` is git-ignored and loaded by `api:dev` and the `migration:*` scripts; variables set
in the shell take precedence.

`APP_ORIGIN` is the web app's origin (the Vite dev server in development): state-changing requests
from any other origin are refused. `TRUST_PROXY` (unset in development) lists the proxy addresses or
CIDR ranges allowed to set `X-Forwarded-For`, and `REGISTRATION_DAILY_LIMIT` caps accounts created per
24 hours (default 20). Sign-in and registration limits are kept in memory, so restarting the API
resets them.

`CONTENT_DIR` points at the compiled bundles (`content/dist`, run `pnpm content:build` after editing
blocks). At startup the API verifies every bundle's schema and revision and refuses to start when an
enabled language has no bundle or a bundle has no language row; with migrations pending it starts and
leaves that check to `/api/health/ready`.

`PASSWORD_PEPPER` in the example is a development-only value. A deployment needs its own secret of
at least 32 random bytes (for example `openssl rand -base64 32`), kept outside the database and its
backups: it is mixed into every password hash, so losing it invalidates every password. The
`migration:*` scripts read only `DATABASE_URL` and run without it.

## Migrations

`synchronize` is always off, so every schema change is a migration (docs/requirements.md §9.2).

1. Edit or add an entity in `apps/api/src/entities`, and list a new entity in `ENTITIES`.
2. `pnpm --filter @typing-trainer/api migration:generate src/migrations/DescriptiveName`
3. Review the generated file and edit it before committing:
   - change `import { MigrationInterface, QueryRunner }` to `import type`;
   - create any extension it needs and add seed rows by hand;
   - run `pnpm format`.
4. Add the class to `MIGRATIONS` in `apps/api/src/migrations/index.ts`.
5. `migration:run`, then `migration:check`, which must report no changes. `migration:revert`
   undoes the latest migration.

`migration:check` compares CHECK constraints by name only; the schema test compares the full
normalized catalog, so run the database tests below after any constraint change.

## Tests

`pnpm test` runs everything that needs no database. Tests that need PostgreSQL run when
`TEST_DATABASE_URL` points at a server whose user may create databases; each test file creates
and drops its own database.

```bash
TEST_DATABASE_URL=postgres://typing_trainer:typing_trainer@127.0.0.1:5432/typing_trainer pnpm test
```

The CI `api` job runs the same tests against a PostgreSQL service with `REQUIRE_TEST_DATABASE=1`,
which turns a missing `TEST_DATABASE_URL` into a failure instead of skipped tests.
