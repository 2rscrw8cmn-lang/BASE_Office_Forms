# Current Application Structure

**Status:** Files Foundation implementation inventory
**Updated:** 2026-07-20

## Runtime shape

The repository is a Cloudflare Pages application with static browser assets, Pages
Functions, one D1 database binding, and one private R2 bucket binding. It does not
use a client framework or a server framework.

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
├── D1 binding DB
│   ├── folders
│   ├── documents
│   ├── records
│   ├── record_revisions
│   ├── record_revision_sequences
│   ├── revision_files
│   └── app_meta
└── R2 binding FILES (private bucket, no public/signed URLs)
    └── uploaded file binaries, keyed by server-generated storage key
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
project RFI list/detail/draft/update and issue/respond/close/reopen routes. PR 5 adds
project record list/create/detail/update/archive routes. PR 6 adds the record
revision list/create/detail/publish routes nested under a record. The Files
Foundation PR adds file list/upload/detail/download routes nested under a
revision. Project IDs are resolved only within the authenticated organization;
cross-organization and unauthorized project access return the same not-found
response.

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
RFI lifecycle mutations append durable activity events. PR 5 adds `src/domain/records`,
`src/application/records`, and a D1 records repository. Records are project-scoped,
use controlled types and active/archived statuses, and atomically append create,
metadata-update, and archive activity events. PR 6 adds `src/domain/revisions`,
`src/application/revisions`, and D1 record-revision and revision-sequence
repositories. A revision is an immutable, record-scoped metadata snapshot with a
server-generated, permanent, per-record revision number; revisions are created as
`draft`, and publishing a revision supersedes any previously published revision for
the same record and atomically updates `records.current_revision_id`. Published
revisions cannot be edited or republished, and draft deletion is out of scope for
this PR. Revision creation and publication both reject archived records.
`records.current_revision_id` is enforced at the database level to reference only a
revision belonging to the same organization and record.

The Files Foundation PR adds `src/domain/files`, `src/application/files`, a D1
`revision_files` repository, and an R2 storage adapter
(`src/infrastructure/storage/r2-file-storage.ts`) behind the private `FILES`
binding. A file is an immutable binary attached to exactly one revision --
files are never attached directly to a record. Uploads use
`multipart/form-data` with a single `file` field, are capped at 50 MB, and are
rejected for zero-byte content, a blank/missing filename, or a missing/invalid
media type; there is no content-type whitelist. The storage key is always
server-generated as
`organizations/{organizationId}/projects/{projectId}/records/{recordId}/revisions/{revisionId}/files/{fileId}`
and never derived from the client-supplied filename or accepted from the
client. SHA-256 is computed server-side from the exact bytes written to R2 and
persisted as lowercase hex; it is never accepted from the client. Because D1
and R2 cannot share one transaction, `FileService.upload` writes the R2 object
first, then persists the file row and its `file.uploaded` activity event in a
single `database.batch()`; if that D1 write fails, the already-written R2
object is deleted to compensate, and the request never reports success unless
both sides succeeded. If the compensating delete itself fails, that is logged
server-side (with the storage key, for operational diagnosis) but never
exposed to the API caller. Reads (list/detail/download) are allowed under
archived records so historical binaries stay reachable; only uploads are
rejected for an archived record's parent. The download route
(`GET .../files/:fileId/content`) streams the object directly from R2 with a
sanitized `Content-Disposition`, `Cache-Control: private, no-store`, and never
redirects to a public or signed URL; if D1 metadata exists but the R2 object
is missing, it returns an internal-consistency error rather than a 404. API
responses never include the storage key, bucket name, or any other R2
implementation detail. Issuance remains out of scope.

## Build and test layout

```text
schemas/                    versioned renderer JSON Schema
src/auth/                   authentication contracts
src/http/                   platform response and routing utilities
src/rendering/               schema validator
src/infrastructure/storage/  R2 file storage adapter
tests/unit/                  schema, renderer, and domain regressions
tests/integration/           Worker-runtime, D1, R2 (local/test binding), and API regressions
tests/helpers/               reusable D1 and route test harnesses
migrations/                  existing D1 migrations (additive, plus one safe table rebuild)
.github/workflows/           pull-request validation
```

The integration suite runs in the Cloudflare Workers runtime with an isolated local
D1 database and applies the repository migrations before tests.
