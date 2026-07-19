# Local Development

## Prerequisites

- Node.js 22 or newer
- npm
- Git

Cloudflare login is not required for local development or validation. It is required
only for remote migrations and deployment.

## Environment and bindings

PR 1 requires no application environment variables or local secrets.

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
```

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
