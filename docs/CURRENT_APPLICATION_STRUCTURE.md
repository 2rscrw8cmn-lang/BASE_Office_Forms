# Current Application Structure

**Status:** Authenticated workspace inventory — application shell plus the
Dashboard, Projects, Project Overview, and project Records register surfaces
**Updated:** 2026-07-21

## Runtime shape

The repository is a Cloudflare Pages application with static browser assets, Pages
Functions, one D1 database binding, and one private R2 bucket binding. It does not
use a client framework or a server framework.

```text
Browser
├── public/index.html and public/app-shell.js  authenticated workspace shell
├── public/app-routing.js                      browser route definitions
├── public/app-shell.css                       responsive shell styles
├── public/app-api.js                          shared /api/v2 browser client
├── public/app-format.js                       shared label/date/reason helpers
├── public/dashboard-view.js                   Work Dashboard feature module
├── public/projects-view.js                    Projects directory feature module
├── public/project-form.js                     Create Project dialog
├── public/project-overview-view.js            Project Overview feature module
├── public/records-view.js                     Project Records register feature module
├── public/add-document-form.js                Guided Add Document workflow
├── public/record-detail-view.js               Document-first Record workspace
├── public/revision-detail-view.js             Revision file/publish workspace
├── public/record-options.js                    Shared controlled discipline vocabulary
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
│   ├── project_record_sequences
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
browser-native ES modules: `app-routing.js` owns route matching and selected
navigation state, while `app-shell.js` owns composition, history navigation,
session/project requests, focus management, mobile drawer behavior, and the
lifecycle of per-route feature modules. No frontend runtime framework or build
pipeline was added.

The shell delegates the data-backed routes to focused feature modules rather
than rendering their data, forms, and state itself:

- `app-api.js` is a shared `/api/v2` client. It centralizes `Accept`/
  `Content-Type` headers, JSON parsing, request-ID extraction,
  `AbortController` support, and a stable `ApiError` (status, code, requestId,
  aborted) so no feature duplicates fetch or error handling. It never stores
  authorization decisions.
- `app-format.js` holds the one consistent layer of human-readable labels:
  dates, issuance purposes, attention reasons (draft revision, "published with
  N files and not yet issued", RFI awaiting response / answered and awaiting
  close, file uploaded, ISS-xxx created), and an activity-action-to-description
  map used by the overview timeline.
- `dashboard-view.js`, `projects-view.js`, and `project-overview-view.js` each
  own one route's data loading, rendering, loading/empty/error/retry states,
  and event wiring. Each is created by the shell with the shared client, a
  `navigate` callback, a live-region `announce` callback, and a `requestRender`
  callback; each guards against stale responses with an `AbortController` and a
  destroyed flag. The shell keys the overview controller by project ID, so a
  route change to a different project tears the old controller down and a late
  response can never replace the newer project's data.
- `project-form.js` renders the Create Project dialog (see below).

The shell renders an empty `.feature-view` container for `/dashboard`,
`/projects`, and `/projects/:projectId/overview`, then mounts (or re-mounts on
its own re-render) the matching controller into it. Feature data is cached in
the controller, so a shell re-render never refetches. The overview feature calls
only the overview read model and never issues a second project-detail request;
the shell's existing project-context request continues to populate the project
header and tabs.

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
- **Cards and panels:** shell placeholders are white panels with thin
  warm-gray borders and minimal shadow/color decoration.
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
Studio, and Document Library as flat, top-level destinations. The selected
destination has text weight, border/edge treatment, and `aria-current` (Studio
and Document Library are plain links to the pre-existing pages outside the
SPA, so they never carry `aria-current`); selection does not depend on color.

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

## Dashboard, Projects, Project Overview, Records, and Record Detail surfaces

`/dashboard`, `/projects`, `/projects/:projectId`,
`/projects/:projectId/overview`, `/projects/:projectId/records`, and
`/projects/:projectId/records/:recordId` are now
real, authenticated, data-backed screens instead of placeholders. The
`/projects/:projectId` → `.../overview` normalization is unchanged, and record
revision, issuance, RFI, Team, and Administration destinations remain
intentional placeholders reached through the same canonical routes.

The **Work Dashboard** answers "what needs my attention today" across every
project the user can access. It shows organization context, a compact summary
strip (accessible projects, draft revisions, ready to issue, active RFIs),
needs-attention groups (draft revisions, ready-to-issue revisions, active RFIs),
recent file uploads and issuances, and a link to the full Projects page. Every
item states why it appears and links to its canonical route (revision detail,
the revision issue route, an RFI, or an issuance). States include loading,
partial-empty (a group is empty while others are not), completely empty ("No
work currently requires your attention." only when items are absent, never
implying no projects unless the project count is zero), API error with retry,
and a request ID when available.

The **Projects** directory renders the authenticated project list as a
professional table on desktop and cards on mobile, using only fields the project
API returns (number, name, status, city/region, updated date). The page header
keeps its eyebrow, left-aligned title, and description together, with the
Create Project action placed on the right on desktop and stacked full width on
mobile; the title is never centered. Search, status filter, result count, and a
restrained clear-filters link form one cohesive toolbar in which search takes the
most width and the status filter stays compact, rather than each control sitting
in its own heavy bordered box. The desktop table has a stronger column hierarchy
with readable (non-tiny) sentence-case header labels, a confident row height, the
project name emphasized in a semantic `th[scope="row"]`, a compact status badge,
and a distinct Open chip affordance; the table and toolbar share the same content
width. Mobile keeps compact, touch-friendly cards. The directory provides text
search across number and name, a status filter built from the statuses present,
a clear-filter action, an announced result count, and a no-results state.
Sorting is deterministic: active first, then project number, name, and ID.
Client-side search and filtering only narrow the already server-authorized list
and are never an authorization mechanism.

The **Create Project** action appears only for roles the backend permits to
create projects (`org_admin` and `document_control_admin`, mirroring
`canCreateProjects`); other roles never see it, and the backend remains
authoritative. The dialog (`project-form.js`) uses a compact grouped layout:
project number and status on the first row, project name full width, city and
state/region on one row, then description. Fields use neutral borders with a
maroon focus ring; red is reserved for validation errors only, so focusing a
valid field never reads as an error. A divider separates the footer actions. The
dialog has dialog semantics, a focus trap, initial focus, Escape-to-close, focus
restoration, labelled title and description, inline validation linked with
`aria-describedby`, a submission loading state, and server error display with the
request ID. Its behavior and payload are unchanged: it sends only fields the
current create schema accepts and never optimistically shows a project before the
server confirms; on success it announces, closes, and navigates to the new
project's Overview.

The **Project Overview** reuses the shell's project header and tabs and presents
its counts (records, draft revisions, published revisions, files, issuances,
active RFIs) as one compact shared summary strip rather than six equal free-
standing boxes. Needs attention is the prominent section; when nothing needs
attention it collapses to a compact empty state rather than a large blank area.
Recent activity reads as a clear activity feed, and workflow shortcuts (Records,
Issuances, RFIs, Team) read as navigation — a label with a subtle count and a
directional affordance — rather than another metric row. Counts and shortcuts
link to canonical routes when one exists. It loads its own read model and reuses
the same project-access authorization as project detail, so a cross-tenant or
unassigned project yields the same generic not-found surface.

The **Records** register (`/projects/:projectId/records`) replaces the records
placeholder with the project document register. It reuses the shell's project
header and tabs and loads a single list-summary read model
(`GET /api/v2/projects/:projectId/records`) — the response is
`{ records: [...], capabilities: { createRecord } }`, and each record carries
`id`, `projectId`, `recordNumber` (nullable), `title`, `recordType`,
`discipline` (nullable), record `status`, the authoritative `currentRevision`
(`{ id, revisionNumber, revisionLabel, status, title }` or `null`),
`hasDraftRevision`, `draftRevisionId` (present only when exactly one draft
exists), `fileCount` (total files across every revision of the record),
`createdAt`, `updatedAt`, and per-record `capabilities` (`update`, `archive`).
`currentRevision` comes from the record's authoritative `current_revision_id`,
never a highest-number or newest-created heuristic, so record identity, revision
identity, and files never blur together. The whole summary is assembled in one
D1 query per project (`D1ProjectRecordsReadRepository`) behind
`ProjectRecordsReadModelService`, so the browser never fans out per record,
revision, or file.

The register renders a semantic desktop table (Record, Type, Discipline,
Revision, Files, Updated) and a mobile card list from
the same data. The record title is the primary text with the record number as
secondary metadata; drafts show a "Draft in progress" badge beside the record
without masquerading as the current revision; the current revision reads as
`Rev <number> · <optional label>` with a separate revision-status label, or "No
revision" when absent; record status and revision status stay distinct. Revision
numbers are always shown even when a human label exists.
Archived records are excluded by default, clearly labelled when shown, and stay
read-only. A cohesive toolbar provides case-insensitive search (title, record
number, type label, discipline), Type / Discipline / Revision-status filters
built only from controlled values present in the authorized response, an archived
visibility control (Active only / Include archived / Archived only), sort (Created
newest [default], Recently updated, Title A–Z, Record number, Type), an announced
result count, and a clear-filters action. List state (`q`, `type`, `discipline`,
`revisionStatus`, `archived`, `sort`, `direction`) is mirrored into the URL query
string so refresh, copied links, and browser back/forward restore the same view;
search, filter, and sort run in the browser over the already-authorized list and
never act as an authorization boundary.

The user-facing register is named **Document Register** and its project tab is
**Documents**; backend Record terminology and API paths remain unchanged. The
capability-gated **Add document** workflow (`add-document-form.js`) starts with
two real choices: upload a document, or reserve an empty document identity. It
creates the Record and initial draft Revision using the existing APIs, then
uploads the selected file through the existing multipart endpoint. Success
navigates directly to the Revision workspace. The staged sequence is explicitly
recoverable: if draft creation fails, the already-created document can be
opened; if upload fails, the dialog reports the request ID and links directly to
the usable empty draft for retry.

Document disciplines use one shared controlled vocabulary from
`public/record-options.js` in both the browser and server validation layer:
General, Civil, Landscape, Structural, Architectural, Interiors, Fire
Protection, Plumbing, Mechanical, Electrical, Technology / Low Voltage,
Equipment, Survey, Contractor, Owner, and Other. Create and edit surfaces use a
select. Unknown legacy values remain readable and may be submitted unchanged,
but replacing one requires a controlled value; new arbitrary values are
rejected.

Record numbers are server-generated, immutable, organization/project-scoped
sequences formatted with a minimum of four digits (`0001`, `0002`, ...). The
create and update contracts reject client-supplied `recordNumber`. Migration
`0012_project_record_sequences.sql` adds the concurrency-safe
`project_record_sequences` table and advances the schema to version 10. A
project's sequence is lazily bootstrapped from its highest all-numeric legacy
record number, ignores nonnumeric legacy identifiers, and never reuses a number
after archive.

The **Record Detail** workspace loads one additive read model from
`GET /api/v2/projects/:projectId/records/:recordId/workspace`; the existing
record-detail GET contract is unchanged. The safe response contains record
metadata, the authoritative current revision, every revision in deterministic
`revision_number DESC, id ASC` order, safe per-file metadata, issuance counts,
per-revision and total file counts, and explicit Record/Revision/File
capabilities. A
single organization/project/record-scoped D1 aggregate query joins revisions
and counts files without browser fan-out or per-revision queries. Both
`currentRevision` and each `isCurrent` flag compare only with the record's
`current_revision_id`; a newer or higher-numbered draft can never masquerade as
current. Storage keys, organization IDs, creator IDs, raw state, and
authorization rationale are not returned.

The full-width workspace presents a compact two-row document header: breadcrumb,
title/status/actions, then number, type, discipline, authoritative revision,
revision status, and factual issuance status. The current work/revision panel
makes files the visual focus. A single draft appears only in Current work and is
excluded from adjacent history; multiple drafts are listed without inventing an
authoritative one. Empty drafts lead with Upload document, drafts with files
lead into their file/publish workflow, and a published document links **View
current revision** to the Revision workspace while each **View file** link uses
the scoped content route. Previous Revisions excludes the current revision and
uses `Created` for `createdAt`; it never relabels that timestamp as Published.
Issuance is factual status only and the workspace does not offer an Issue action.
Metadata is collapsed below the document content. Edit and Archive sit in a
restrained overflow menu. Archived documents retain files and history but expose
no mutation controls.

The canonical Revision route is now a real authenticated workspace backed by
`GET /api/v2/projects/:projectId/records/:recordId/revisions/:revisionId/workspace`.
It shows parent document identity, `Rev <number> · <optional label>`, status, current marker,
change summary, date, issuance count, and every file with a scoped content URL.
Editable drafts expose multipart upload and publish actions only through
server-derived capabilities. Upload failures retain the selected file name and
request ID; success reloads. Publishing reloads into a read-only current state.
Published, superseded, and archived revisions never render upload or publish
controls. The underlying file and publish contracts are unchanged.

Published Library templates remain reusable masters only. The repository has no
project-form-instance entity, no persisted template-version reference on a
Record or Revision, and no application path for saving a project-specific copy
of a renderer definition. Therefore **Use a Library template** is intentionally
absent rather than disabled or fake; the missing domain and renderer integration
is tracked in GitHub issue #30. `public/engine.js` and the controlled renderer
are unchanged.

All document-management surfaces preserve logical reading order and are responsive: summary
tiles wrap, attention groups and recent activity stack, the projects and records
tables become cards, the overview timeline becomes a readable list, and dialogs
become full-width sheets — without horizontal page overflow. Status is never
communicated by color alone (badges carry text labels). After route changes the
shell moves focus to the page heading and announces the new page through the
existing live region.

## Session-first feature loading

The shell resolves the session before it requests any data-backed feature. On
boot, and again after any navigation, `loadSession` runs first through the shared
`app-api.js` client (so session loading shares the same JSON parsing, request-ID
extraction, and stable `ApiError` objects as every other call). While the session
is unresolved the Dashboard, Projects, and Project Overview routes render a
loading state and their feature controllers are not instantiated, so no
`/api/v2/dashboard`, `/api/v2/projects`, or `/api/v2/projects/:id/overview`
request — nor the `/api/v2/projects/:id` project-header request — is issued. If
the session fails, the route shows a session error surface that preserves the
safe API message, error code, and request ID and offers a retry. Retrying the
session, once it succeeds, then loads whatever feature or project the current
route needs. This is a loading-order guarantee only; it introduces no
authentication bypass and hardcodes no users or roles.

## Authentication and authorization-aware navigation

Cloudflare Access and `GET /api/v2/session` remain authoritative. The shell uses
the returned organization and membership role for account context. Administration
is shown only for `org_admin`, the existing role with `members:manage`; document
control administrators, project managers, contributors, viewers, unknown sessions,
and unavailable sessions do not see it. Direct unauthorized `/admin` navigation
uses the generic not-found surface. This is navigation behavior only and does not
replace backend authorization.

## Legacy Studio and Document Library integration

Forms remains at `builder.html`, with `form-generator.html` and `viewer.html`
still available at their direct URLs. The Studio and Document Library are
promoted directly in the global sidebar, at the same level as Dashboard and
Projects, rather than sitting behind a "Tools" hub. Both nav entries are plain
links (no `data-app-link`) to the extensionless `/builder` and `/library`
URLs (Cloudflare Pages serves `builder.html` and `library.html` for them),
since those pages live entirely outside the SPA and its client-side router;
there is no `/tools`, `/tools/forms`, or `/tools/library` route anymore --
navigating to any of those now resolves to the shared not-found surface.

Every legacy page shares one consistent top-bar contract: the BASE brand links
to `/dashboard`, the breadcrumb parent is labelled "Document Library" and
links to `/library`, and a "Back to app" link on the right returns to
`/dashboard`. The pre-authentication "User" placeholder button was removed
from Studio, Fill & Export, and the viewer now that the application has
real Cloudflare Access sessions; the viewer's breadcrumb leaf reads "Shared
document" so the legacy library vocabulary never collides with the project
Records register.

`form-generator.html` (Fill & Export) is intentionally unlinked: no page
navigates to it, and the viewer now carries the same fill, answer
import/export, and PDF-export capabilities. It remains reachable at its
direct URL for existing bookmarks, but it is a candidate for retirement in a
future cleanup rather than a destination to surface in navigation.

The former root shared-library markup is preserved at `library.html`,
continuing to load `engine.js`, `library-api.js`, `global-search.js`, and
`home.js` unchanged; its title, breadcrumb, and heading now consistently read
"Document Library" to match the nav label. The unavoidable legacy limitation
is that `/` now resolves to the required application Dashboard, so bookmarks
that previously relied on the root for the library must use `/library`
(`library.html` remains accepted and redirects to the extensionless canonical
URL). Document records are not merged with project Records.

## Frontend test structure

`tests/unit/app-routing.test.ts` covers route resolution, nested-tab selection,
Administration role policy, unknown paths (including the retired tools hub
routes), and API/static bypass. `tests/unit/app-shell.test.ts` mounts the real
browser modules in Happy DOM and covers navigation content/active state
(including the top-level Studio and Document Library links), authenticated
project tabs, role-aware Administration visibility, the mobile drawer and
Escape behavior, close-on-route selection, not found, and direct nested
routes.
`tests/unit/dashboard-projects-ui.test.ts` mounts the shell against a stubbed
API and covers the dashboard (summary values, each attention reason, canonical
destination links, empty state, error/retry, semantic structure, and stale-
response protection), the projects directory (table and card structure,
canonical overview links, search by name and number, status filter, clear
filters, no-results, create-action visibility by role, create-form validation,
successful creation navigating to overview, failed creation preserving input
with a request ID), and the project overview (counts, attention items, activity,
canonical shortcut routes, a generic not-found, and cross-project stale-response
protection).

`tests/unit/session-first-loading.test.ts` covers the session-first contract:
503 `AUTHENTICATION_UNAVAILABLE`, 401 `AUTHENTICATION_REQUIRED`, and 403
membership/session failures each surface the safe message, code, and request ID
while issuing no Dashboard, Projects, Overview, or project-header request; a
successful session retry then loads the current feature; and no feature request
is issued until the session has resolved. `tests/unit/dashboard-projects-polish.test.ts`
pins the polish DOM contract (projects header hierarchy and create-action
placement, the cohesive toolbar controls, the desktop table structure and Open
affordance, mobile cards, the Create Project field order, focus styling not
reading as a validation error, the compact dashboard summary, and the compact
overview summary with navigation-style shortcuts) without brittle pixel
snapshots. `tests/unit/dashboard-read-repository.test.ts` proves the dashboard
read dispatches its eight reads through a single `database.batch()` and never
launches eight independent concurrent statements.

`tests/unit/records-ui.test.ts` mounts the shell against a stubbed API and
covers the Records register: table and card structure, canonical record-detail
links, the current-revision text, the no-published-revision state, draft
presence, file count, active/archived labels and default archived exclusion,
case-insensitive search across title and record number, Type / Discipline /
Revision-status filters, the announced result count, clear filters, the filtered
empty state, query-string restoration and mirroring, browser-back restoration,
Add-document visibility by capability (shown when `createRecord` is true,
hidden for read-only users who still see the list), guided upload and empty
document choices, record/revision/file sequencing, recoverable upload failure,
validation, canonical Revision navigation, and Escape-to-close.

`tests/unit/record-detail-ui.test.ts` covers the single workspace request,
authoritative current/draft separation without duplicate draft presentation,
file cards and scoped content URLs, one contextual primary action, empty-draft
upload state, historical revision rendering, mutable edit payload, reload after
edit, draft-create payload and navigation, and archived read-only rendering.

`tests/unit/revision-detail-ui.test.ts` covers the real Revision workspace,
canonical file downloads, empty draft upload, successful refresh, upload failure
with retained file context and request ID, publication reload, and immutable
published rendering.

`tests/integration/read-models.test.ts` exercises the dashboard and overview
read models end to end: organization isolation, assigned-project filtering,
org_admin/document_control_admin visibility, the draft/ready-to-issue/active-RFI
definitions (ready-to-issue requires published status and at least one file and
excludes already-issued revisions; archived records are excluded), project-
scoped overview counts and activity, deterministic ordering and limits, and the
absence of storage keys or raw state JSON in responses.
`tests/integration/project-records-read-model.test.ts` proves the records
list-summary read model: the authoritative current revision (a lower-numbered
published revision wins over a higher-numbered draft), a null current revision
when none is set, accurate draft presence with the draft id withheld when the
one-draft invariant is violated, record-scoped file counts that never leak
another project's files, archived exclusion/inclusion with archived records kept
read-only, capabilities derived from the record policy (create/update/archive
for managers, read-only for contributors and viewers), deterministic
newest-first ordering, project and tenant isolation, and unassigned-user
exclusion. `tests/integration/records.test.ts` additionally pins the
list-summary envelope shape alongside the record create/update/archive lifecycle
and the scoped Record Detail workspace envelope, authoritative current-revision
selection, file counts, safe fields, access isolation, and read-only
capabilities.

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

The Dashboard and Projects UI adds two read-only application read models under
`src/application/read-models` with parameterized D1 query layers in
`src/infrastructure/db/d1/dashboard-read-repository.ts` and
`project-overview-read-repository.ts`. `GET /api/v2/dashboard` returns a
cross-project attention model, and `GET /api/v2/projects/:projectId/overview`
returns a single-project overview model; both keep their HTTP handlers thin and
add no tables, migrations, or schema-version change (schema version remains 9).
Accessibility is enforced server-side by reusing existing project authorization
(`ProjectService.list` for the dashboard, `ProjectService.get` for the
overview), so the browser never filters projects or reconstructs authorization:
org_admin and document_control_admin see every project in the active
organization, while assigned project managers, contributors, and viewers see
only their assigned projects, and tenant isolation is absolute. Draft revisions,
ready-to-issue revisions, and active RFIs share one definition across both read
models (a draft revision on a non-archived record; a published revision on a
non-archived record with at least one file and no existing issuance; an RFI that
is issued/awaiting-response or answered/awaiting-close). Results use
deterministic ordering with fixed limits and no pagination. Recent project
activity is attributed to a project by joining each event's object back to the
row it references — never by parsing stored state JSON — and exposes only safe
public fields (id, action, object type/id, actor identity, timestamp), never
`prior_state_json`, `new_state_json`, `metadata_json`, or storage keys.

`D1DashboardReadRepository.load` prepares its eight reads (three counts and five
attention/recent lists) and dispatches them through a single `database.batch()`
instead of eight independent `Promise.all` statements, so the dashboard stays
within Cloudflare's D1 simultaneous-connection limits by using one connection.
`batch()` runs the prepared statements in order and returns their results in the
same order, which the repository maps back into the unchanged dashboard response
(the definitions, limits, ordering, response shape, authorization, and schema
version are all preserved). When the caller has no accessible projects the
repository returns the empty dashboard without touching D1 at all.

## Build and test layout

```text
schemas/                    versioned renderer JSON Schema
src/auth/                   authentication contracts
src/application/read-models/ dashboard and project-overview read-model services
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
