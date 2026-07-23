Exit code: 0
Wall time: 0.2 seconds
Output:
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

`npm run dev` builds the React/Vite compatibility assets first, then starts
Cloudflare Pages locally from `public/`. During UI work, use a second terminal
with `npm run dev:ui` to rebuild `public/app/` on source changes; refresh the
Pages origin after each rebuild. The Pages runtime remains the deployment
truth, not the standalone Vite server.

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
npm run build:ui
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

## UI-2 preview D1

UI-2 uses its own preview-only D1 database, `base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`). The root `DB` binding declares that
ID as `preview_database_id`; production remains
`base-office-forms-library` (`1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`). Do not
run production migration commands to prepare a Pages preview.

```bash
# Apply and verify only the UI-2/current-main migration set (0001–0012).
npm run db:migrate:preview
npm run db:migrations:list:preview

# Production inspection/migration remains explicit and separate.
npm run db:migrations:list:remote
npm run db:migrate:remote
```

`db:migrate:preview` intentionally pins the UI-2 migration list and applies it
through D1's file importer before recording the migration ledger. Wrangler
4.113's normal migration runner splits the historical trigger bodies in
`0003_identity_and_organizations.sql` and returns `incomplete input`; the
preview helper avoids that parser path. It never includes PR #36 migrations
`0013` or `0014`. The database begins as a schema-only baseline; use the
guarded fixture below before an authenticated route smoke test.

### UI-2 authenticated smoke fixture

The UI-2 fixture command seeds only `base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`). It has no database-name argument and
refuses to run unless `wrangler.jsonc` still pins that exact name and ID. The
seed command reads the production `users` row for the supplied Access email
only to obtain the existing identity subject, email, and display name; it does
not write to production or copy business data. Those values are accepted only
through the environment and are never logged or stored in the repository.

```powershell
$env:UI2_FIXTURE_EMAIL = "your-access-email@example.com"
npm run db:fixture:preview
Remove-Item Env:UI2_FIXTURE_EMAIL

# Removes only the deterministic synthetic fixture rows from the UI-2 preview.
npm run db:fixture:preview:cleanup
```

The fixture creates one active user and `org_admin` membership, the synthetic
`BASE UI Preview` organization, the `UI-2 Smoke Test` / `UI2-001` project with
an active `project_manager` membership, plus `Preview Test Document` and its
draft revision. It never creates RFIs, files, issuances, or production-derived
business content. The command verifies memberships, project access, Dashboard
and Project Overview SQL, the Records row, and the exact `0001`–`0012`
migration ledger before reporting success.

