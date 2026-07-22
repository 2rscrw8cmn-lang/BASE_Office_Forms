# Local Development

## Prerequisites

- Node.js 22 or newer
- npm
- Git

The root `.node-version` pins the Cloudflare Pages build and compatible local version
managers to Node.js 22.16.0.

Cloudflare login is not required for local development or validation. It is required
only for remote migrations and deployment.

## Environment and bindings

The identity endpoints require Cloudflare Access configuration in deployed
environments:

```text
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-application-audience-tag
```

These are non-secret environment variables, but the application fails closed for
authenticated `/api/v2` endpoints until both are configured. Local integration tests
inject a verified-identity fixture and do not require Access credentials. PR 1's
health and legacy shared-library behavior still require no application secrets.

The `DB` D1 binding and migrations directory are declared in `wrangler.jsonc`.
Wrangler creates isolated local D1 state under its ignored local state directory.
`.dev.vars` is ignored by Git; `.dev.vars.example` documents the current empty
environment contract. Do not add Cloudflare credentials or production values to it.

## First-time setup

```bash
npm ci
npm run db:migrate:local
npm run dev
```

Wrangler prints the local origin. Verify the new platform route at:

```text
GET /api/v2/health
```

The existing shared-library routes remain under `/api/documents` and `/api/folders`.

## Validation

Run the complete local and CI-equivalent gate with one command:

```bash
npm run check
```

It checks formatting, generated Worker types, TypeScript, lint, unit tests, D1/API
integration tests, the Pages Functions build, dependency vulnerabilities, and
committed-secret patterns.

Focused commands:

```bash
npm run format
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:unit
npm run test:integration
npm run build
npm run functions:build
```

`npm run build` validates the static Pages output. Cloudflare compiles the root
`functions/` directory during Git deployments; `npm run functions:build` performs the
same contract check explicitly for local development and CI.

Tests never use the configured remote D1 database. The Workers test pool supplies a
local isolated D1 binding and applies `migrations/` through the helpers in
`tests/helpers/`.

## Remote-only commands

These commands require an authenticated Wrangler session and must target the intended
Cloudflare account explicitly:

```bash
npm run db:migrate:remote
npm run deploy
```

Do not use production credentials or production data in local, preview, or test
environments.

## Preview / production D1 and applying migrations

This Pages project uses a **single** D1 database (`base-office-forms-library`,
declared in `wrangler.jsonc`). Pages **preview** and **production** deployments
bind that same database — there is no separate preview D1. Therefore migrating
the remote database migrates the database used by both environments:

```bash
# Apply pending migrations to the shared remote database (preview + production).
npm run db:migrate:remote      # or the alias: npm run db:migrate:preview

# Verify which migrations are applied and inspect the live RFI schema.
npm run db:migrations:list:remote
npm run db:schema:remote
```

If a Pages **preview** deployment cannot load authenticated data (for example the
Work Dashboard shows "The dashboard could not be loaded") while older previews
still work, the cause is almost always that a **new migration has not been
applied to the bound database**: the new code queries columns/tables that do not
yet exist. The API now returns `503 DATABASE_SCHEMA_OUTDATED` in that situation
so the failure is legible. Run `db:migrations:list:remote` to confirm the pending
migration, then `db:migrate:remote`.

> A migration that errors is rolled back and **not** recorded as applied, so a
> failed remote apply silently leaves the database on the previous schema. Always
> confirm with `db:migrations:list:remote` after applying.

If a separate preview database is ever configured in the Cloudflare Pages
dashboard, it must be migrated explicitly against its own name or id — a
production migration does **not** reach it automatically:

```bash
wrangler d1 migrations apply <preview-db-name-or-id> --remote
```
