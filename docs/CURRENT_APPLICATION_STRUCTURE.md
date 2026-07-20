# Current Application Structure

**Status:** PR 4 implementation inventory
**Updated:** 2026-07-20

## Runtime shape

The repository is a Cloudflare Pages application with static browser assets, Pages
Functions, and one D1 database binding. It does not use a client framework or a
server framework.

```text
Browser
├── public/index.html and public/home.js       shared-library home
├── public/builder.html and public/studio.js  definition editor
├── public/form-generator.html                fillable form surface
├── public/viewer.html                        public definition viewer
├── public/library-api.js                     legacy /api client
├── public/engine.js                          renderer (preserved)
└── public/base.css                           shared visual system (preserved)

Cloudflare Pages Functions
├── functions/api/[[path]].ts                 legacy shared-library API
└── functions/api/v2/[[path]].ts              new platform API entrypoint
    └── src/http/v2/router.ts                 v2 route dispatch

Storage
└── D1 binding DB
    ├── folders
    ├── documents
    └── app_meta
```

## Existing shared library

`functions/api/[[path]].ts` owns the existing `/api/documents`, `/api/folders`, and
legacy health behavior. It creates or verifies the legacy schema, stores complete
definition JSON in `documents.definition_json`, protects edits with hashed edit
tokens, and uses `documents.version` as an optimistic save counter.

The legacy route and tables remain in place. The platform's additive identity and
project-directory tables do not change the legacy API or renderer behavior.

## Renderer definition flow

The studio, generated definitions, imported JSON, library records, form filler, and
viewer all converge on `public/engine.js`. The renderer supports `form`, `document`,
and `package` definitions. Packages contain snapshots of form or document
definitions.

The machine-readable contract is
`schemas/renderer-definition.v1.schema.json`. The shared-library create and update
boundaries validate against that contract before storing JSON. Validation does not
modify or normalize a definition, and `public/engine.js` remains unchanged.

## New platform boundary

All new document-control routes use `/api/v2`. The v2 Pages Function delegates to a
small router and does not fall through to the legacy API. Alongside
`GET|HEAD /api/v2/health` and PR 2's authenticated identity routes, PR 3 implements
project list, create, detail, update, and project-contact routes. PR 4 adds the
project RFI list/detail/draft/update and issue/respond/close/reopen routes. Project
IDs are resolved only within the authenticated organization; cross-organization and
unauthorized project access return the same not-found response.

`src/auth/authentication-adapter.ts` defines the provider-neutral `AppSession` and
authentication adapter contracts. `src/auth/cloudflare-access-adapter.ts` validates
Cloudflare Access JWT assertions before resolving application users and memberships.
Identity persistence, membership lookup, tenant-scoped repositories, and organization
authorization live in the new `src/application/identity`, `src/domain/identity`, and
`src/infrastructure/db/d1` modules. PR 3 adds `src/domain/projects`,
`src/application/projects`, D1 project repositories, and explicit role plus
project-membership authorization. PR 4 adds `src/domain/rfis`,
`src/application/rfis`, and D1 RFI record, response, and number-sequence
repositories. RFI numbers are assigned only by the atomic draft-to-issued database
transition, are scoped to a project, and are never changed. Project, contact, and
RFI lifecycle mutations append durable activity events.

## Build and test layout

```text
schemas/                 versioned renderer JSON Schema
src/auth/                authentication contracts
src/http/                platform response and routing utilities
src/rendering/           schema validator
tests/unit/              schema and renderer regressions
tests/integration/       Worker-runtime, D1, and API regressions
tests/helpers/           reusable D1 and route test harnesses
migrations/              existing additive D1 migrations
.github/workflows/       pull-request validation
```

The integration suite runs in the Cloudflare Workers runtime with an isolated local
D1 database and applies the repository migrations before tests.
