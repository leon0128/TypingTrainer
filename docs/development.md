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
