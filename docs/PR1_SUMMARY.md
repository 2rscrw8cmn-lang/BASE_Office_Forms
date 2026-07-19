# PR 1 — Engineering Foundation and Schema Contracts

## Scope

This PR prepares the existing Cloudflare Pages application for incremental
document-control implementation. It adds validation and engineering gates while
preserving the renderer, visual assets, shared-library routes, and D1 tables.

Implemented:

- versioned JSON Schema validation at shared-library write boundaries;
- `/api/v2` routing and `GET|HEAD /api/v2/health`;
- provider-neutral authentication and `AppSession` interfaces;
- unit, Worker-runtime, D1 migration, API, legacy-library, and renderer tests;
- formatting, strict linting, type checking, build, audit, and secret-scan commands;
- GitHub Actions CI;
- current-structure and local-development documentation.

Not implemented:

- organization, membership, project, record, RFI, submittal, file, AI, dashboard,
  email, sharing, or workflow behavior;
- new business tables or migrations;
- authentication provider logic;
- renderer or visual redesign changes.

## Changed-file inventory

| File | Purpose |
|---|---|
| `.dev.vars.example` | Records that PR 1 has no required local environment variables or secrets. |
| `.github/workflows/ci.yml` | Runs install, formatting, type check, lint, tests, build, dependency audit, and secret scan. |
| `README.md` | Links the architecture package and the one-command local validation guide. |
| `SCHEMA.md` | Points human-readable renderer documentation to the versioned JSON Schema and error paths. |
| `docs/API_CONTRACTS.md` | Makes `/api/v2` authoritative for new platform routes while preserving legacy paths. |
| `docs/CURRENT_APPLICATION_STRUCTURE.md` | Documents the current browser, Pages Functions, D1, renderer, and test topology. |
| `docs/LOCAL_DEVELOPMENT.md` | Documents prerequisites, bindings, environment variables, setup, and validation commands. |
| `docs/OPERATIONS_RUNBOOK.md` | Corrects the health smoke test to `/api/v2/health`. |
| `docs/PR1_SUMMARY.md` | Provides the PR scope, exclusions, validation evidence, and changed-file inventory. |
| `docs/README.md` | Adds the implementation inventory and local-development documents to the architecture index. |
| `docs/ROOT_README_UPDATE.md` | Removed after applying its requested root README section. |
| `eslint.config.mjs` | Adds strict type-aware TypeScript linting and floating-Promise enforcement without reformatting legacy browser JavaScript. |
| `functions/api/[[path]].ts` | Validates renderer definitions before legacy shared-library create/update operations and returns structured validation issues. |
| `functions/api/v2/[[path]].ts` | Adds the Pages Function entrypoint for new `/api/v2` routes. |
| `package.json` | Adds the unified validation, test, lint, format, build, and security commands and their dependencies. |
| `package-lock.json` | Locks the new development and JSON Schema validation dependencies. |
| `schemas/renderer-definition.v1.schema.json` | Defines the machine-readable form, document, package, section, block, field, and appearance contract. |
| `scripts/scan-secrets.mjs` | Performs a high-signal committed-secret scan for local and CI gates. |
| `scripts/verify-build.mjs` | Verifies required assets and parses the renderer schema before the Functions build. |
| `src/auth/authentication-adapter.ts` | Defines provider-neutral authentication, session, role, and project-permission contracts only. |
| `src/http/api-response.ts` | Adds standard v2 success/error envelopes and generated request IDs. |
| `src/http/v2/router.ts` | Routes v2 health requests and returns stable 404/405 errors for unimplemented routes. |
| `src/rendering/renderer-definition.ts` | Compiles the JSON Schema with Ajv and maps failures to clear JSON-pointer issues. |
| `tests/helpers/api.ts` | Provides reusable request and Pages Function invocation helpers. |
| `tests/helpers/d1.ts` | Provides isolated D1 access, repeatable migrations, cleanup, and fixture seeding. |
| `tests/helpers/setup-d1.ts` | Applies repository migrations to each Workers test database. |
| `tests/integration/d1-helper.test.ts` | Verifies migrations and D1 repository helper behavior. |
| `tests/integration/legacy-library.test.ts` | Verifies legacy library create/list behavior and invalid-definition errors. |
| `tests/integration/v2-health.test.ts` | Verifies health, request IDs, method handling, and v2 route isolation. |
| `tests/types/cloudflare-test.d.ts` | Types the test-only D1 migration binding. |
| `tests/unit/renderer-definition.test.ts` | Covers current definitions, legacy tuples/packages, unsupported blocks, and nested error paths. |
| `tests/unit/renderer-engine.test.ts` | Locks the unchanged renderer source, verifies form/document/package output, and validates every built-in template. |
| `tsconfig.json` | Extends strict checking to foundation source, tests, JSON imports, and test configs. |
| `vitest.config.ts` | Configures Node unit tests. |
| `vitest.worker.config.mts` | Configures Workers-runtime integration tests with local D1 migrations and Pages assets. |
| `wrangler.jsonc` | Retains the existing binding and compatibility configuration with formatter-normalized JSONC. |

## Validation evidence

`npm run check` passes and includes:

- Prettier check;
- generated Worker types and `tsc --noEmit`;
- ESLint;
- 8 unit tests;
- 7 Workers/D1 integration tests;
- Pages Functions build;
- npm dependency audit;
- tracked/untracked secret scan.

A local Wrangler smoke test also confirmed successful responses from
`/api/v2/health`, the legacy `/api/health`, and `/api/documents`.
