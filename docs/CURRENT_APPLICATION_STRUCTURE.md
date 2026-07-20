# Current Application Structure

**Status:** Application Shell implementation inventory
**Updated:** 2026-07-20

## Runtime shape

The repository is a Cloudflare Pages application with static browser assets, Pages
Functions, one D1 database binding, and one private R2 bucket binding. It does not
use a client framework or a server framework.

```text
Browser
├── public/index.html and public/app-shell.js  authenticated workspace shell
├── public/app-routing.js                      browser route definitions
├── public/app-shell.css                       responsive shell styles
├── public/library.html and public/home.js     preserved shared-library home
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

The D1 binding also contains immutable `issuances` and `issuance_files`
snapshots plus `project_issuance_sequences` for project-wide issue numbering.

## Frontend architecture and design inventory

The browser application remains framework-free static HTML, CSS, and JavaScript.
`public/index.html` is the single entry point for new application routes and loads
two browser-native ES modules: `app-routing.js` owns route matching and selected
navigation state, while `app-shell.js` owns composition, history navigation,
session/project requests, focus management, and mobile drawer behavior. No
frontend runtime framework or build pipeline was added.

The shell extends rather than replaces the existing `base.css` visual system:

- **CSS and tokens:** `base.css` remains the source of `--ink`, `--accent`,
  `--accent-dk`, `--mono`, `--field`, `--divider`, `--row`, `--page-bg`,
  `--hover`, and `--paper`. `app-shell.css` adds semantic shell aliases and an
  8/12/18/24/30 px spacing scale derived from existing usage.
- **Typography:** Archivo remains the application and control face, JetBrains
  Mono remains the metadata/code face, and Georgia is reserved for page and
  section headings.
- **Color:** the shell uses BASE maroon, ink, paper, and the existing warm-gray
  direction. It does not add a separate application palette or gradients.
- **Controls:** quiet white bordered controls, the existing maroon primary
  treatment, 3-5 px radii, and the established subtle maroon focus ring continue.
- **Cards and panels:** shell placeholders and Tools adapters are white panels
  with thin warm-gray borders and minimal shadow/color decoration.
- **Icons:** navigation uses one small inline SVG line-icon family with
  `currentColor`, rounded lines, and decorative icons hidden from assistive
  technology.
- **Responsive behavior:** the existing shared 950 px and 620 px thresholds are
  retained. Desktop has a 244 px persistent sidebar, tablet uses a 204 px compact
  sidebar without removing labels, and phones replace it with a 64 px header and
  off-canvas navigation. Studio's separate 1050 px and 760 px rules are unchanged.
- **Previous navigation:** the legacy library used a sticky white top bar with a
  logo, breadcrumbs, search, and account placeholder. The shell translates that
  quiet hierarchy into the global sidebar and project header without changing
  the Studio navigation.

## Application shell and routes

The shell provides one semantic main content region, a skip link, active global
navigation, shared loading/error/not-found surfaces, and page-change focus plus
announcement behavior. Browser history uses `pushState`, `replaceState`, and
`popstate`; query strings and hashes are preserved when the root or project-root
routes are normalized.

New route handling covers:

```text
/ → /dashboard
/dashboard
/projects
/tools
/tools/forms
/tools/library
/tools/document-library                   compatibility alias
/admin                                    organization administrators only
/projects/:projectId → .../overview
/projects/:projectId/overview
/projects/:projectId/records
/projects/:projectId/records/:recordId
/projects/:projectId/records/:recordId/revisions/:revisionId
/projects/:projectId/records/:recordId/revisions/:revisionId/issue
/projects/:projectId/issuances
/projects/:projectId/issuances/:issuanceId
/projects/:projectId/issuances/:issuanceId/created
/projects/:projectId/rfis
/projects/:projectId/rfis/:rfiId
/projects/:projectId/team
```

Unknown application routes render the shared not-found surface. API and static
asset paths are never claimed by the client router. The obsolete top-level static
`404.html` was removed so Cloudflare Pages applies its documented SPA fallback to
`index.html` for direct navigation and refresh. File-based Pages Functions still
take precedence for `/api/*`, so the legacy API and `/api/v2` remain independent.

## Global and mobile navigation

Desktop and tablet show persistent global navigation with Dashboard, Projects,
Tools, Forms, and Document Library. The selected destination has text weight,
border/edge treatment, and `aria-current`, so selection does not depend on color.

At 620 px and below a compact BASE header opens an off-canvas drawer. Opening the
drawer moves focus inside it, makes the main/sidebar inert, and prevents document
scrolling. Tab and Shift+Tab cycle within the drawer. Escape, the close button,
or the backdrop closes it and restores trigger focus; selecting an application
link closes it and moves focus to the new page heading. Drawer animation respects
`prefers-reduced-motion`.

## Project shell and project tabs

Every project route attempts the existing authenticated
`GET /api/v2/projects/:projectId` request. While it is pending, the header shows
only a factual project-ID loading context. A successful response supplies the
real project number, name, and status. A 403 or 404 becomes the same generic
**Project not found** surface; other failures use the shared retryable error state
and include the API request ID when available. No project values are invented.

Overview, Records, Issuances, RFIs, and Team are link-based project tabs.
Record/revision/issue descendants keep Records selected; issuance detail and
success descendants keep Issuances selected. Tabs remain sticky beneath the
project header on desktop and become a horizontally scrollable navigation row on
mobile, with the selected link scrolled into view after route changes.

## Authentication and authorization-aware navigation

Cloudflare Access and `GET /api/v2/session` remain authoritative. The shell uses
the returned organization and membership role for account context. Administration
is shown only for `org_admin`, the existing role with `members:manage`; document
control administrators, project managers, contributors, viewers, unknown sessions,
and unavailable sessions do not see it. Direct unauthorized `/admin` navigation
uses the generic not-found surface. This is navigation behavior only and does not
replace backend authorization.

## Legacy Tools integration

Forms remains at `builder.html`, with `form-generator.html` and `viewer.html`
still available at their direct URLs. `/tools/forms` is a shell adapter that links
to the unchanged Document Studio.

The former root shared-library markup is preserved at `library.html`, continuing
to load `engine.js`, `library-api.js`, `global-search.js`, and `home.js` unchanged.
`/tools/library` is the stable shell adapter; `/tools/document-library` is also
accepted for compatibility with the product-spec route name. The unavoidable
legacy limitation is that `/` now resolves to the required application Dashboard,
so bookmarks that previously relied on the root for the library must use
`/library` (`library.html` remains accepted and redirects to the extensionless
canonical URL). Document records are not merged with project Records.

## Frontend test structure

`tests/unit/app-routing.test.ts` covers route resolution, nested-tab selection,
Administration role policy, unknown paths, tool adapters, and API/static bypass.
`tests/unit/app-shell.test.ts` mounts the real browser modules in Happy DOM and
covers navigation content/active state, authenticated project tabs, role-aware
Administration visibility, the mobile drawer and Escape behavior, close-on-route
selection, not found, direct nested routes, and legacy Forms/Library links.

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
revision. The Issuance Foundation adds project-scoped issuance list/detail
routes and a create route nested under an exact record revision. Project IDs
are resolved only within the authenticated organization;
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
client. SHA-256 is computed server-side from the exact bytes written to R2,
passed to R2 so it verifies the received bytes, and persisted as lowercase
hex; it is never accepted from the client. The R2 write is create-only
(`If-None-Match: *`): if an object already exists at the key R2 returns null
and the write is treated as a failure, so an uploaded binary can never be
silently overwritten. Because D1 and R2 cannot share one transaction,
`FileService.upload` writes the R2 object first, then persists the file row
and its `file.uploaded` activity event in a single `database.batch()`; if that
D1 write fails, the already-written R2 object is deleted to compensate, and the
request never reports success unless both sides succeeded. If the compensating
delete itself fails, that is logged server-side (with the storage key, for
operational diagnosis) but never exposed to the API caller. Reads
(list/detail/download) are allowed under archived records so historical
binaries stay reachable; only uploads are rejected for an archived record's
parent. The download route (`GET .../files/:fileId/content`) streams the object
directly from R2, setting `Content-Type` from the authoritative persisted
`media_type` (never from R2's stored metadata), with a sanitized
`Content-Disposition`, `Cache-Control: private, no-store`, and never redirects
to a public or signed URL. D1 metadata is authoritative: if the stored object
is missing, or is present but its size disagrees with the recorded byte size,
the route returns a stable internal-consistency error rather than a 404 or a
stream of untrusted bytes. The `revision_files` row also carries a four-column
composite foreign key `(record_id, organization_id, project_id, revision_id)`
into `record_revisions`, so a file's `project_id` must match the project that
actually owns its revision and record. API responses never include the storage
key, bucket name, or any other R2 implementation detail.

The Issuance Foundation adds `src/domain/issuances`,
`src/application/issuances`, D1 issuance and project-sequence repositories,
and migration `0010_issuance_foundation.sql` (schema version 9). An issuance
is an immutable audit snapshot of one published revision and an explicitly
selected, nonempty ordered set of that revision's files. The caller supplies
only a controlled purpose, optional notes, and file IDs; the server allocates
the permanent project-wide number (`ISS-001`, `ISS-002`, and so on) from
`project_issuance_sequences`. Contributors and viewers with active project
assignments may list and read issuances, while issue authority is limited to
organization administrators, document-control administrators, and assigned
project managers.

`issuances.revision_snapshot_json` records the complete issuance-relevant
revision fields that actually exist in the current revision domain, plus the
issuer's non-authoritative display name when available. `issuance_files`
copies filename, media type, byte size, SHA-256, storage key, file ID, and
display order so later joins or mutable user/project metadata cannot change
the historical meaning of the issuance. Composite foreign keys enforce the
organization/project/record/revision/issuance/file hierarchy, and D1 triggers
reject updates or deletes to both snapshot tables.

Before D1 persistence begins, `IssuanceService` uses only private R2 `head()`
calls to verify every selected source object exists and matches the D1 byte
size. It does not download bodies, copy objects, or create R2 data. Only after
all preflight checks pass does one `database.batch()` ensure the project
sequence row, insert the issuance with its generated number, advance the
sequence, insert every ordered file snapshot, and append the
`issuance.created` activity event. Any statement failure rolls back the entire
batch, so a failed preflight consumes no number and a failed D1 write leaves
no partial issuance. List/detail reads depend only on normal project access,
not current record or revision lifecycle state, so historical issuances remain
readable after record archival, revision supersession, newer publications, or
project-membership changes (subject to the reader still having current project
authorization). API responses never expose snapshotted storage keys, bucket
details, R2 URLs, or raw snapshot JSON.

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
