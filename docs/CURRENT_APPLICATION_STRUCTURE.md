# Current Application Structure

**Status:** Authenticated workspace with the accepted RFI Slice 2A
official-issuance backend and UI-7 native detail workspaces. Only the Work
Dashboard and Project Overview remain compatibility-mounted.
**Updated:** 2026-07-28 (UI-7 rebase and Slice 2A contract integration)

## Runtime shape

### RFI Slice 1 — complete, production migrated

PR #36 is merged (`e2bca602b4c867f9dd6ec5d17b5b3f8aea690d06`) and migration
`0014_rfi_document_control_alignment.sql` is applied to production
`base-office-forms-library` (`1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`; ledger
exactly `0001`–`0014`). RFIs now live on the shared Records → Revisions →
Files spine (`records` + `rfi_details`); the standalone `rfi_records`,
`rfi_attachments`, and `rfi_number_sequences` tables are retired. See
`RFI_SLICE_1_ROLLOUT.md` §"Production closeout" for full reconciliation
evidence. Pages preview still binds the isolated combined RFI D1 database
`base-office-forms-rfi-preview` (`5169cd7c-60d8-4dbd-a66c-75155f745216`)
through the root preview binding; retained UI-2 scripts use
`wrangler.ui2.jsonc`, and the remote 0014 rehearsal uses the separate guarded
`wrangler.rfi-rehearsal.jsonc`.

### RFI Slice 2A — accepted official-issuance backend

`POST /api/v2/projects/:projectId/rfis/:rfiId/issue` is a guarded,
server-authoritative operation. It requires `Idempotency-Key`, accepts only
`record_only` delivery, validates the exact ready RFI/current
revision/template and private attachment objects (including mandatory size and
SHA-256), generates a deterministic PDF with the strict
`base-rfi-official-document/v1` compiler, writes and verifies the R2 artifact,
then commits the number, promoted immutable revision, issuance/file snapshots,
render/template/recipient snapshots, activity, and idempotency result in one
guarded D1 batch.

The original shared revision is promoted from `draft` to `published`; its
user-facing label is `Original Issue`. `records.current_revision_id` remains
authoritative. Migration `0015_rfi_official_issuance.sql` advances the schema to
version 13 and adds only official snapshot, idempotency, and reconciliation
state.

The pre-issue lifecycle has a safe correction loop. `POST .../ready` validates
subject, question, an active same-project responsible contact, and the exact
usable published template binding before locking an RFI. `POST
.../return-to-draft` is the separately authorized `ready_to_issue -> draft`
operation. It requires no consumed number or official issue/issuance evidence;
ordinary PATCH editing remains draft-only, and issue infrastructure failures
never reverse the transition automatically.

The workspace exposes `officialIssue` as `RfiOfficialIssueSummary`: immutable
original-issue evidence containing the downloadable artifact file ID,
issuance/revision identities, due-date/file/routing snapshots, and original
request ID. It intentionally excludes issue-time status and capabilities.
Top-level `rfi.status` and top-level `capabilities` are the sole current
lifecycle authority after any later response, clarification, close, reopen, or
void. APIs never return storage keys.

The repository is a Cloudflare Pages application with static browser assets, a
React/Vite application entry, Pages Functions, one D1 database binding, and one
private R2 bucket binding. As of UI-4 the React entry is the application shell:
it owns global composition, routing, session/organization and project context,
navigation, the mobile drawer, project tabs, page containers, focus, and route
announcements. Feature screens that have not yet been migrated to React are
mounted, unchanged, through a compatibility bridge that loads their existing
browser controllers (`public/*-view.js`). As of UI-7 the only screens still on
that bridge are the Work Dashboard and Project Overview; every project register
and every detail workspace is native React. `public/app-shell.js` and its
self-boot are retained only as a rollback path (see the UI-4 shell section
below).

```text
Browser
├── public/index.html                         authenticated app entry
├── public/brand-tokens.css                   neutral brand token bridge
├── public/app/app.js and public/app/app.css  generated React/Vite entry assets
├── src/ui/app/main.tsx                       React entry and root mount
├── src/ui/app/App.tsx                        providers (query, toast) + router + shell routes
├── src/ui/app/AppLayout.tsx                  the application shell (nav, drawer, chrome, focus)
├── src/ui/app/routing.ts                     typed route map (parity-tested vs app-routing.js)
├── src/ui/app/useSession.ts                  session context (TanStack Query)
├── src/ui/app/useProject.ts                  project context (TanStack Query; 403/404→missing;
│                                                revalidates on route-pathname change, never cached
│                                                indefinitely -- see "UI-4 correction pass" below)
├── src/ui/app/LegacyFeatureMount.tsx         compatibility mount for public/*-view.js controllers
│                                                (same-route remount on query/hash change; load-failure
│                                                error + retry surface -- see "UI-4 correction pass")
├── src/ui/app/featureRuntime.ts              default runtime that loads the served feature modules
│                                                (never permanently caches a rejected import promise)
├── src/ui/app/ErrorBoundary.tsx              application error boundary
├── src/ui/app/ShellContext.tsx               bridge context (navigate, announce, getSession)
├── src/ui/app/Navigation.tsx, ProjectChrome.tsx, RouteStates.tsx, AppLink.tsx, ShellIcon.tsx
├── src/ui/app/evidence/                      dev-only shell screenshot harness (never shipped)
├── src/ui/app/LegacyApplicationHost.tsx      retained UI-2 host (rollback path; not mounted)
├── src/ui/app/renderer-preview.ts             controlled renderer preview adapter
├── src/ui/features/rfis/                     (UI-5) native React RFI register feature
│   ├── RfiRegisterFeature.tsx                top-level states, URL filters, mutations, wiring
│   ├── RfiTable.tsx                          compact desktop table + row/action triggers
│   ├── RfiEditorPanel.tsx                    shared responsive Drawer form content
│   ├── RfiCards.tsx                          dedicated mobile cards + action triggers
│   ├── useProjectRfis.ts                     TanStack Query read-model hook (403/404→missing)
│   ├── api.ts                                 typed /api/v2 RFI fetch/mutate calls
│   ├── urlState.ts                            filter/sort URL state + sort/filter logic
│   ├── editableFields.ts                      editor field config + validation
│   ├── format.ts                              date/status presentation helpers
│   ├── types.ts                                read-model types
│   └── rfis.css                                feature-local, token-based layout CSS
├── src/ui/features/projects/                 (UI-6A) native React Projects register
│   ├── ProjectsRegisterFeature.tsx             top-level states, URL filters, capability wiring
│   ├── ProjectsTable.tsx                       four-column semantic desktop table
│   ├── ProjectsCards.tsx                       dedicated mobile project cards
│   ├── CreateProjectDialog.tsx                 shared FormDialog create workflow
│   ├── useProjects.ts                          TanStack Query list hook
│   ├── api.ts                                   typed list/create API client and request errors
│   ├── urlState.ts                              q/status URL state, filtering, deterministic sort
│   ├── format.ts                                location/date presentation helpers
│   ├── types.ts                                 project read-model and create-input types
│   └── projects.css                             composition-only, token-based layout CSS
├── src/ui/features/records/                  (UI-6B) native React Document Register
│   ├── RecordsRegisterFeature.tsx              top-level states, URL filters, capability wiring
│   ├── RecordsTable.tsx                        six-column semantic desktop table
│   ├── RecordsCards.tsx                        dedicated mobile document cards
│   ├── AddDocumentDrawer.tsx                   staged Add Document workflow in Drawer size="detail"
│   ├── useProjectRecords.ts                    TanStack Query hook, key ["project-records", projectId]
│   ├── api.ts                                   typed list/create-record/create-revision/upload calls
│   ├── urlState.ts                              q/type/discipline/revisionStatus/archived/sort/direction
│   ├── format.ts                                controlled type/discipline labels, revision naming, dates
│   ├── types.ts                                 Records read-model and create-input types
│   └── records.css                              composition-only, token-based layout CSS
├── src/ui/features/record-workspace/         (UI-7) native Record and Revision workspaces
│   ├── RecordWorkspaceFeature.tsx              record identity, current work, version history
│   ├── RevisionWorkspaceFeature.tsx            exact revision context, files, publish
│   ├── RevisionFiles.tsx                       shared FileRow list + authenticated downloads
│   ├── RevisionUploadPanel.tsx                 draft upload with server-reconciled retry
│   ├── RecordDialogs.tsx                       edit details / archive / create draft revision
│   ├── PublishRevisionDialog.tsx               confirmed official publish transition
│   ├── useRecordWorkspace.ts                   record + revision TanStack Query hooks
│   ├── api.ts                                   typed workspace/patch/archive/publish/upload calls
│   ├── format.ts                                revision naming, media-type, size, issuance labels
│   ├── types.ts                                 Record/Revision/File workspace read-model types
│   └── record-workspace.css                     composition-only, token-based layout CSS
├── src/ui/features/rfi-workspace/            (UI-7) native RFI workspace
│   ├── RfiWorkspaceFeature.tsx                 identity, transitions, sections, activity
│   ├── RfiContentPanel.tsx                     draft editor / read-only content, lockVersion
│   ├── RfiResponsePanel.tsx                    response editor and recorded response
│   ├── RfiAttachmentsPanel.tsx                 role-explicit attachments + upload
│   ├── RfiTemplatePreview.tsx                  read-only template-bound document view
│   ├── useRfiWorkspace.ts                      TanStack Query hook, key ["rfi-workspace", …]
│   ├── api.ts                                   typed workspace/patch/respond/attachment/transition
│   ├── format.ts                                ported activity/role/field vocabulary + dates
│   ├── types.ts                                 RFI workspace read-model types
│   └── rfi-workspace.css                        composition-only, token-based layout CSS
├── src/ui/theme/tokens.css                    application semantic tokens (single source)
├── src/ui/theme/tokens.ts                     token registry for enforcement tests
├── src/ui/components/index.ts                 BASE component library barrel + CSS import
├── src/ui/components/base-components.css       single application component stylesheet
├── src/ui/components/icons/Icon.tsx            the one Lucide icon component
├── src/ui/components/primitives/*              Button, inputs, Field, Badge, Tooltip, …
├── src/ui/components/interactive/*             Dialog, Menu, Popover, Tabs, Toast, Drawer, …
├── src/ui/components/patterns/*                PageHeader, RegisterPage, EmptyState, …
├── src/ui/lab/UiLab.tsx + catalog.tsx          development-only UI Lab (real components)
├── vite.lab.config.ts                          dev-only UI Lab build/serve (never shipped)
├── public/app-shell.js                        existing authenticated shell
├── public/app-routing.js                      browser route definitions
├── public/app-shell.css                       responsive shell styles
├── public/app-api.js                          shared /api/v2 browser client
├── public/app-format.js                       shared label/date/reason helpers
├── public/dashboard-view.js                   Work Dashboard feature module
├── public/projects-view.js                    (rollback/reference only, UI-6A) legacy Projects register
├── public/project-form.js                     (rollback/reference only, UI-6A) legacy Create dialog
├── public/project-overview-view.js            Project Overview feature module
├── public/records-view.js                     (rollback/reference only, UI-6B) legacy Records register
├── public/add-document-form.js                (rollback/reference only, UI-6B) legacy Add Document dialog
├── public/record-detail-view.js               (rollback/reference only, UI-7) legacy Record workspace
├── public/record-detail-dialogs.js            (rollback/reference only, UI-7) legacy record dialogs
├── public/revision-detail-view.js             (rollback/reference only, UI-7) legacy Revision workspace
├── public/rfis-view.js                        (rollback/reference only, UI-5) legacy RFI register
├── public/rfi-workspace-view.js               (rollback/reference only, UI-7) legacy RFI workspace
├── public/rfi-template-preview.js             (rollback/reference only, UI-7) legacy renderer binding
├── public/record-options.js                    Shared controlled discipline vocabulary
├── public/library.html and public/home.js     preserved shared-library home
├── public/builder.html and public/studio.js  definition editor
├── public/form-generator.html                fillable form surface
├── public/viewer.html                        public definition viewer
├── public/pdf-export.js                      controlled-document PDF export helper
├── public/vendor/pdf-lib.min.js              vendored PDF export runtime
├── public/library-api.js                     legacy /api client
├── public/engine.js                          renderer (preserved)
├── public/base.css                           document/renderer CSS (preserved)
└── vite.config.ts                             deterministic UI asset build

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
│   ├── rfi_details
│   └── app_meta
└── R2 binding FILES (private bucket, no public/signed URLs)
    └── uploaded file binaries, keyed by server-generated storage key
```

The D1 binding also contains immutable `issuances` and `issuance_files`
snapshots plus `project_issuance_sequences` for project-wide issue numbering.

For UI-2 Pages previews, `DB` is explicitly bound to the isolated
`base-office-forms-ui2-preview` database
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`). It carries only the UI-2/current-main
`0001`–`0012` migration ledger, including the legacy `rfi_records` table used
by Dashboard and Project Overview at the time of that investigation.
Production is bound to `base-office-forms-library`
(`1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`); it was inspected but not modified
during the UI-2 investigation, and has since had migration `0014` applied by
PR #36 (see the RFI Slice 1 note above) — production no longer has
`rfi_records`. The UI-2 preview database intentionally still does not; it
remains pinned to the `0001`–`0012` ledger and is unaffected by the PR #36
migration.

The preview database is supplied with an opt-in, deterministic smoke fixture
through `scripts/ui2-preview-fixture.mjs` and the `db:fixture:preview` /
`db:fixture:preview:cleanup` commands. The script accepts a product owner's
Access email only from `UI2_FIXTURE_EMAIL`, reads production only to resolve
that person's existing identity subject/email/display name, and writes only
the pinned UI-2 preview database. It creates one synthetic organization,
project, memberships, record, and draft revision; it never copies production
business data or creates RFIs, files, or issuances. Cleanup is restricted to
the fixture's deterministic synthetic IDs.

## Frontend architecture and design inventory

`public/index.html` is the single entry point and mounts the generated
React/Vite entry. As of UI-4, `main.tsx` renders `App`, which composes the
TanStack Query provider, the toast provider (`ToastProvider` from the UI-3
library), a React Router browser router, and the application error boundary
around `AppLayout` — the React application shell. A single catch-all route hands
every location to the shell, which resolves it through the typed route map in
`src/ui/app/routing.ts` (a faithful port of `public/app-routing.js`, kept in
lockstep by `tests/unit/react-shell-routing.test.ts`). The shell owns global
composition: global navigation, the mobile drawer, session/organization and
project context, project tabs, page containers, route loading/not-found states,
focus management, and route announcements.

Feature screens that have not yet been migrated to React are mounted, unchanged,
through `LegacyFeatureMount`, which loads the existing browser controller
(`public/*-view.js`) via the injectable shell runtime (`featureRuntime.ts`,
default: `import("/…-view.js")`) and drives it with the same contract the legacy
shell used — `create → reload → mount` into a React-owned container, with
`requestRender` re-mounting and a bridged `navigate`/`announce`/`getSession`. The
component is keyed by a stable per-descriptor key, so a change of route or of
project/record/revision/rfi identity fully tears the old controller down and
creates a new one. A feature controller mounts only after the project context has
resolved, so a project the user cannot access never triggers a feature request.

`LegacyFeatureMount` also takes a `locationKey`
(`${route.pathname}${location.search}${location.hash}`, supplied by
`AppLayout`) so a query/hash-only navigation to the _same_ route — a genuine
React Router navigation, or browser Back/Forward — remounts the _existing_
controller (`controller.mount(container)` again, no new factory call, no new
`reload()`) so a legacy controller that reads filter/sort state from
`window.location.search` inside its own `mount()` (`records-view.js`,
`rfis-view.js`'s `readFiltersFromUrl()`) sees the new URL. A feature's own
internal `history.pushState` calls (bypassing the router) still behave exactly
as before and do not trigger this remount, since they never change
`location`. If `getApiClient()`/`loadFeatureFactory()` rejects (e.g. a
transient failure importing a served module), `LegacyFeatureMount` shows a
shared, accessible error surface (`role="alert"`, a heading, and a "Try
again" button that recreates the controller from scratch) instead of an empty
area; `featureRuntime.ts`'s `loadApiClient()` never permanently caches a
rejected promise, so a retry after a transient failure always attempts a
genuinely fresh import.

`public/app-shell.js` (the UI-2 vanilla shell) and `LegacyApplicationHost.tsx`
(the UI-2 compatibility host) remain in the tree but are no longer mounted; they
are the documented rollback path (revert `main.tsx` to render
`LegacyApplicationHost`). `app-shell.js` keeps its `__BASE_REACT_APP_HOST__`
self-boot guard, and `main.tsx` still sets that flag, so nothing double-boots.

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

The authenticated shell now uses an application/document CSS boundary:

- **CSS and tokens:** `brand-tokens.css` owns only neutral brand values and
  font imports. The authenticated entry does not load `base.css`; its
  generated app CSS and `app-shell.css` own application styling. The generated
  application CSS resets the authenticated body's margin, font, text color,
  smoothing, paragraphs, and complete app box sizing. `base.css` imports the
  neutral bridge with a relative `./brand-tokens.css` path for legacy document
  pages and retains document geometry and renderer selectors. `app-shell.css`
  adds semantic shell aliases and an 8/12/18/24/30 px spacing scale derived
  from existing usage.
- **Typography:** Archivo is the target application heading and control face;
  JetBrains Mono remains the metadata/code face. Existing legacy browser
  headings may still use Georgia until their later UI-phase migration. UI-2
  deliberately establishes the boundary without performing that migration.
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

## UI-3 BASE component library and UI Lab

UI-3 introduces the reusable BASE application component library that later
phases (UI-4 onward) compose into the React shell and feature routes. The
library is present and tested but not yet mounted by the legacy shell, so the
production `public/app/app.js` bundle is unchanged in size; feature adoption
happens in the migration phases.

- **Token source.** `src/ui/theme/tokens.css` is the single source of
  application colour, geometry, typography, spacing, elevation, and motion,
  declared as `--app-*` custom properties on `:root` (so Radix-portalled
  surfaces resolve them) with inline fallbacks to `public/brand-tokens.css`.
  `src/ui/theme/tokens.ts` mirrors the token names for the enforcement test.
  BASE maroon (`--app-accent`) carries primary action, focus, selection, and
  active navigation; danger red is a separate token and is never used for
  ordinary focus or borders.
- **One stylesheet.** `src/ui/components/base-components.css` styles every
  component through those tokens with no raw colour literals and no
  feature-specific selectors. A feature builds a register or workspace by
  composing components; it adds no new global visual CSS.
- **One icon component.** `src/ui/components/icons/Icon.tsx` wraps a curated set
  of Lucide icons. It is the only module that imports `lucide-react`
  (enforced), it is decorative by default, and it takes a `title` to expose an
  accessible name.
- **Primitives** (`src/ui/components/primitives/`): Button, IconButton,
  TextInput, TextArea, Select, Checkbox, RadioGroup, DateInput, Field, Label,
  HelpText, ValidationMessage, Badge, Tooltip, Divider, Spinner, Skeleton.
  `Field` provides a context that wires each control's id, `required`,
  `aria-invalid`, and `aria-describedby` to its label, help, and error.
  `Field` accepts an optional `controlId` prop that is the one authoritative
  id for both the label and the child control; each control resolves
  `field?.controlId ?? id`, so Field's id (generated or explicit) always wins
  over a caller-provided `id` when the control is used inside a Field — the
  label can never become disconnected from the control it actually renders. A
  caller `id` is honoured normally when a control is used standalone, outside
  a Field.
- **Interactive** (`src/ui/components/interactive/`): Dialog, AlertDialog,
  DropdownMenu, Popover, Tabs, Toast, CommandMenu, Collapsible, Drawer. Radix
  primitives supply focus trap, keyboard, and dismissal behaviour; BASE owns the
  rendered styling and component contract. `radix-ui` is imported only inside
  `src/ui/components/` (enforced). `DropdownMenu` renders each item/separator
  pair through a `React.Fragment`, not a wrapping `<div>`. `CommandMenu`
  derives its list/option DOM ids from `useId()` (so multiple instances never
  collide) and re-derives its active index from the current filtered length on
  every render — clamped in range, `-1` for an empty collection — so
  `aria-activedescendant` can never reference an out-of-range item even if
  `items` shrinks or the active item disappears under a filter or capability
  change while the menu is open; its search input takes an explicit `label`
  prop (default `"Search commands"`).
- **Application patterns** (`src/ui/components/patterns/`): AppShell, PageHeader,
  ProjectHeader, ProjectTabs, RegisterPage, RegisterToolbar, FilterChip, Panel,
  MetadataStrip, FileRow, ActivityFeed, EmptyState, ErrorState, PermissionState,
  FormDialog, WorkspaceSection, Breadcrumbs, plus one domain-typed status
  vocabulary per authoritative domain status enum — `RfiStatusBadge`
  (`RFI_STATUS_VOCABULARY: Record<RfiStatus, …>`, sourced from
  `src/domain/rfis/rfi.ts`: `draft`, `ready_to_issue`, `open`,
  `response_received`, `closed`, `returned_for_clarification`, `void`),
  `RecordStatusBadge` (`active`, `archived`, from
  `src/domain/records/record.ts`), and `RevisionStatusBadge` (`draft`,
  `published`, `superseded`, from `src/domain/revisions/revision.ts`) — plus a
  separate `AttentionBadge`/`ATTENTION_VOCABULARY` for the calculated
  `due_soon`/`overdue` conditions, which are never stored statuses and are
  deliberately kept out of the status enums. Each vocabulary's key type is
  imported from `src/domain`, so an incomplete map fails to typecheck the
  moment a domain enum changes; `SaveIndicator` remains
  (Saving/Saved/Failed/Conflict). `RegisterPage` renders exactly one of the
  required loading/populated/first-use-empty/filtered-empty/error states.
- **UI Lab.** `src/ui/lab/` is a development-only route/artifact. `catalog.tsx`
  is the shared component/state matrix that instantiates the real production
  components (no duplicated demo markup); `UiLab.tsx` renders it across the
  required default/hover/focus/selected/disabled/loading/error/long-text/empty
  states with desktop and mobile frames. It is built only through
  `vite.lab.config.ts` (`npm run lab` / `npm run lab:build` → gitignored
  `dist/ui-lab/`) and is never part of the production application bundle.
  Committed desktop and mobile captures live in `docs/evidence/ui-3/`.

## Application shell and routes

As of UI-4 the shell is `AppLayout` (React) rather than `public/app-shell.js`.
It reproduces the legacy shell's DOM structure and class names — `.app-sidebar`,
`.app-navigation`, `.app-main`, `.project-context-header`, `.project-tabs`,
`.mobile-nav-*`, `.route-state`, `.route-placeholder`, and the `#route-announcer`
live region — so the established `public/app-shell.css` styling, the 950/620 px
responsive thresholds, and the heading-focus contract are preserved exactly while
the composition, routing, and data flow now run through React, React Router, and
TanStack Query. UI-4 intentionally keeps this sidebar chrome rather than adopting
the UI-3 `AppShell`/`ProjectTabs` visual primitives (which imply a top-navigation
paradigm), because the feature screens are not yet migrated and that swap would
be a redesign rather than a parity migration; the shared components are composed
where they are additive (`ToastProvider`, the error boundary). Full adoption of
those visual primitives happens as feature screens migrate (UI-6+).

The shell provides one semantic main content region, a skip link, active global
navigation, shared loading/error/not-found surfaces, and page-change focus plus
announcement behavior. React Router owns browser history and back/forward; query
strings and hashes are preserved when the root (`/`) or project-root
(`/projects/:id`) routes are normalized/redirected (the redirect carries the
current `search` and `hash`). Focus moves to the page heading on navigation and
popstate, but not on initial load or during a redirect; for a route whose heading
is rendered asynchronously by a feature mount, the mount re-requests heading focus
once its heading exists. Route matching, redirects, admin gating, project-tab
selection, and the not-found surface are the typed `routing.ts` port of the
legacy route table, enforced identical by `react-shell-routing.test.ts`.

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

Project authorization is never cached indefinitely. `useProject` (TanStack
Query) is keyed by `["project", projectId, epoch]`, where `epoch` increments
whenever the route's normalized pathname changes for a route that has a
project (a query/hash-only change on the same route does not bump it, and
neither does an ordinary rerender) — matching the legacy shell's own
unconditional per-navigate project reload. An epoch bump is a brand-new query,
not a background refetch, so no stale `ready` project is ever shown while the
server re-confirms access; the destination feature (mounted only once
`project.status === "ready"`) cannot begin its own request until that
revalidation resolves. Returning to a project whose access has since changed
to 403/404 replaces any previously cached identity with the same generic
**Project not found** state and mounts no feature.

Overview, Records, Issuances, RFIs, and Team are link-based project tabs.
Record/revision/issue descendants keep Records selected; issuance detail and
success descendants keep Issuances selected. Tabs remain sticky beneath the
project header on desktop and become a horizontally scrollable navigation row on
mobile, with the selected link scrolled into view after route changes.

## Dashboard, Projects, Project Overview, Records, and Record Detail surfaces

`/dashboard`, `/projects`, `/projects/:projectId`,
`/projects/:projectId/overview`, `/projects/:projectId/records`, and
`/projects/:projectId/records/:recordId` are now
real, authenticated, data-backed screens instead of placeholders. `/projects`
is native React as of UI-6A, `/projects/:projectId/records` as of UI-6B, and
`/projects/:projectId/records/:recordId` as of UI-7 (see their sections below);
`/dashboard` and the Project Overview still mount their legacy controllers. The
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

The **Projects** route is native React as of UI-6A. It renders only the
server-authorized `GET /api/v2/projects` array, using project number, name,
authoritative status, city/region, and updated timestamp. Desktop uses a native
semantic table with exactly Project, Status, Location, and Updated columns;
mobile uses dedicated full-card links. Project name links and safe
noninteractive row areas navigate to `/projects/:projectId/overview` without
interfering with native modifier clicks, controls, or text selection. There is
no Actions/Open column, Tabulator, `BaseDataGrid`, or `role="grid"`.

`q` and `status` are React Router URL state. Search replaces history; status and
Clear push history; unrelated hash state is preserved. The status options are
restricted to authoritative values present in the authorized response, and
invalid/unavailable values normalize away. Search and status filtering only
narrow that response. Sorting remains deterministic: active first, then project
number, project name, and project ID. Shared toolbar/filter-chip/result-count
patterns, distinct first-use and filtered-empty states, retry/request-ID
handling, and the UI-5 mobile filter disclosure are reused unchanged.

The **Create Project** action is rendered only when
`meta.capabilities.createProject` is true. The server derives that flag through
the existing `canCreateProjects` policy (currently organization and
document-control administrators); React never infers it from membership role
strings. The native `CreateProjectDialog` uses shared `FormDialog` and field
primitives for project number, name, status, city, region/state, and
description. It preserves initial focus, Escape/close and focus restoration,
inline required-field errors, pending/disabled submission, server error and
request ID display, and sends no optimistic list insertion. After server
confirmation it announces success, closes, and navigates to the new Project
Overview. `public/projects-view.js` and `public/project-form.js` are retained
unchanged as rollback/reference modules.

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

## The project Document Register (UI-6B, native React)

`/projects/:projectId/records` is native React as of UI-6B. `AppLayout.tsx`
special-cases `route.id === "project-records"` to render
`<RecordsRegisterFeature projectId={…}>` (`src/ui/features/records/`) once the
project context is `ready`, so an inaccessible project never triggers a
Records request. The project header and Documents tab stay shell-owned, and the
register's `PageHeader` uses `asHeading={false}` so the shell keeps the only
`<h1>`.

`/projects/:projectId/records/:recordId`,
`.../revisions/:revisionId`, revision publishing, and issuance routes are
**unchanged** and still resolve through `LegacyFeatureMount` →
`public/record-detail-view.js` / `public/revision-detail-view.js`. They migrate
in UI-7. `public/records-view.js` and `public/add-document-form.js` remain in
the repository as rollback/reference modules and are no longer mounted on the
register route.

### Read model and authorization

The feature loads the same single read model as the legacy controller,
`GET /api/v2/projects/:projectId/records?includeArchived=true`, which returns
`{ records, capabilities: { createRecord } }`. No endpoint, response shape, or
read model changed for UI-6B. `useProjectRecords.ts` wraps it in TanStack Query
under the key `["project-records", projectId]` — so navigating between projects
cannot show another project's documents — and collapses a 403/404 into the
generic `missing` state and any other failure into a retryable `error` with the
request ID, mirroring `useProject.ts` and `useProjectRfis.ts`.

Tenant and project authorization stay entirely server-side. The whole
authorized set (archived included) is fetched once, and the browser only
searches, filters, and sorts within it; that is presentation, never an
authorization boundary. The Add document action appears only when the
server-derived `capabilities.createRecord` is true — no role name is
interpreted in the browser.

### Record, Revision, and File identity

The register keeps the domain's concepts distinct and never collapses them:

- the **Record** is the document identity — title (the canonical workspace
  link) plus record number; a legacy record with no server-generated number
  reads "No record number" rather than borrowing a database id;
- the **Revision** column shows only the server's authoritative
  `currentRevision`, resolved through the record's `current_revision_id`. It is
  never inferred from newest date, highest revision number, or draft status.
  The revision number is always represented (`Original`, `Rev 1`, …) even when
  a human revision label is appended, with the revision status as a separate
  badge. Absent, it reads "No revision";
- `hasDraftRevision` drives a separate "Draft in progress" indication. A draft
  never occupies the current-revision value;
- **Files** is the `fileCount` across every revision of the record, shown
  exactly as returned.

### Desktop, mobile, and URL state

Desktop uses a native semantic table with exactly Document, Type, Discipline,
Revision, Files, and Updated columns — no Actions/Open column, Tabulator,
`BaseDataGrid`, `role="grid"`, pinned columns, or cell editing. The title link
and safe noninteractive row area navigate to
`/projects/:projectId/records/:recordId` without interfering with modifier
clicks, middle-click, keyboard link behaviour, text selection, or controls.
Mobile uses dedicated cards at the shared 760px breakpoint, each a single
canonical link containing no nested interactive controls.

`q`, `type`, `discipline`, `revisionStatus`, `archived`, `sort`, and
`direction` are React Router URL state with the legacy controller's exact
names, defaults, and semantics. Search replaces history; filters, sort, chip
removal, and Clear push it. Refresh, copied URLs, query-only navigation, and
Back/Forward reproduce the same view; unrelated query parameters and the hash
are preserved; invalid values normalize away without ever offering an option
the authorized response does not contain. Clear resets search and filters while
keeping the selected sort and direction. Archived visibility keeps Active only
(default), Include archived, and Archived only, and archived records stay
clearly marked.

### Add Document

Add Document is a native React workflow in the shared `Drawer size="detail"`
(500–660px on larger screens, full-screen at the shared mobile breakpoint). It
keeps the two real entry choices — upload a document, or reserve a document
identity — and offers no template/library choice, because no persisted
project-document template relationship exists in the domain. Focus trap,
Escape, scroll lock, and focus restoration come from the shared Drawer (Radix
Dialog); there is no feature-owned modal or focus trap.

It preserves the staged server workflow: create Record → create initial draft
Revision → upload the file (upload mode) → navigate. Nothing is inserted into
the register before the server confirms, and the browser never supplies a
Record number. Completed stages are tracked, so a retry resumes at the failed
stage and never creates a duplicate Record or Revision; a partial failure shows
the server message, the request ID, what does already exist, and a link to open
it. On success the workflow invalidates the Records query so it refetches
confirmed server data, then navigates to
`/projects/:projectId/records/:recordId/revisions/:revisionId`.

## The project RFI register (UI-5, native React)

`/projects/:projectId/rfis` is the first canonical route the shell renders
natively instead of through `LegacyFeatureMount`: `AppLayout.tsx` special-cases
`route.id === "project-rfis"` to render `<RfiRegisterFeature projectId={…}>`
(`src/ui/features/rfis/`) once the project context is `ready`, exactly like
every other project route. `/projects/:projectId/rfis/:rfiId` (the RFI
workspace) became native in UI-7 — see "The detail workspaces" below.

The feature loads the same single read model as the legacy controller,
`GET /api/v2/projects/:projectId/rfis` (`{ project, rfis, responsibleContacts,
capabilities }`), through a TanStack Query hook (`useProjectRfis.ts`) that
collapses a 403/404 into a `missing` state and any other failure into a
retryable `error`, mirroring `useProject.ts`. No response shape changed.

The compact desktop table renders RFI, Subject, Status, Assigned to, Due,
Updated, and an accessible visually unlabeled Actions column. Drafts show the
shared `Draft` badge, never "Unnumbered"; issued rows show their authoritative
number and canonical workspace link. The row primary area opens an editable
draft (`capabilities.updateDraft === true`) in the shared Drawer or navigates a
locked/issued RFI. Editable-draft action menus order `Edit details` then
`Open RFI`; locked/issued menus contain only `Open RFI`. Column-header sorting (`SORT_HEADERS`/`SORT_KEYS` in
`urlState.ts`) and `aria-sort` retain the approved URL-backed behavior,
including default number ascending and tie-break-by-id.

Exactly one responsive Drawer is open at a time. `RfiRegisterFeature.tsx` owns
its open id and return-focus target; `RfiEditorPanel.tsx` provides the shared
form content using `Drawer`, `Collapsible`, `Field`, `TextInput`, `TextArea`,
`Select`, `DateInput`, `ValidationMessage`, `SaveIndicator`, and `Button`.
Fields are Subject, Assigned to (project-contact id), Response due, Question,
Contractor recommendation, and Drawing/Specification references under
Additional information. Each control keeps local uncommitted state; text and
date controls commit on blur, Assigned to commits on selection, Enter commits
a non-textarea control by blurring it, Enter inserts a newline in a textarea,
and an unchanged value never calls the API. Escape blurs the active field
through the same commit path, closes the Drawer, and returns focus to its row
trigger; Close uses the same focus-return contract. The footer's secondary
`Open` action blurs an active control, waits for the tracked changed-only
commit, and navigates only on unchanged/success; validation, 403, failed-save,
and 409 states keep the Drawer open with their field feedback.
Per-field Saving/Saved/Failed/Conflict feedback comes from
`RfiRegisterFeature.tsx`'s own commit logic (not a generic form library): a
`403` shows "You no longer have permission to edit this draft." at the
affected field; a `409 RFI_VERSION_CONFLICT` refetches the register, shows
"Changed elsewhere. Latest values loaded; review and retry.", and resets the
editor's displayed values from the fresh data through a `resetSignal` counter
that re-renders in place rather than remounting the editor (so focus and any
other field's in-progress edit are not disturbed) while the current URL
filters and sort are untouched (they live in the URL, not component state).

The capability-gated Add RFI action (`capabilities.createRfi`) creates one
draft with placeholder Subject/Question through the existing
create endpoint, appends it to the cached register data, clears incompatible
search/status filtering (replacing, not pushing, the URL entry), opens its
`New RFI` Drawer, and focuses Subject. No number is ever assigned in the
browser.

Search, Status, Party, and Due remain the only toolbar controls (`q`,
`status`, `responsible`, `due`, `sort`, `direction` in the URL via
`useSearchParams`); typing in Search replaces the current history entry while
Status/Party/Due changes, header-sort clicks, and Clear All each push a new
entry, so browser Back/Forward restores prior search/filter/sort state.
Filtering and sorting run in the browser over the single already-authorized
list, matching the legacy controller and the binding architecture rule that
client-side filtering is never an authorization boundary.

Mobile renders a dedicated two-line card list (`RfiCards.tsx`) — draft badge
or official number, relative Updated time, Subject, question summary, status,
Assigned to, Due, and the same action menu/Drawer triggers. It replaces the
desktop table at `max-width: 760px`. The shared Drawer defaults to navigation
sizing; the RFI editor uses `size="detail"`, which is full-screen at that
breakpoint and `clamp(500px, 45vw, 660px)` above it. It stacks paired fields
below 460px, uses an internal scroll region, and keeps a safe-area-aware sticky
footer. `RegisterToolbar` keeps desktop filters inline and uses its shared 44px
mobile filter disclosure, active count, and reachable Clear control below the
same breakpoint.

`rfis.css` is feature-local, token-based CSS (no raw colour literals; every
colour is a registered `--app-*` token, enforced by
`tests/unit/rfi-register-tokens.test.ts`) covering only layout the shared
component library does not already provide — the table/Drawer/card structure
and density. Buttons, badges, menus, icons, save indicators, toolbar chrome,
and empty/error/
permission states come from the UI-3 component library, never recreated
locally.

The shared z-index tokens now place shell chrome below overlays, Drawers above
their overlays, and toasts above Drawers (`--app-z-header: 20`,
`--app-z-overlay: 240`, `--app-z-drawer: 250`, `--app-z-toast: 300`). The UI
Lab Drawer section includes both left- and right-side examples; the token suite
guards the layer order so a full-screen mobile Drawer cannot fall beneath the
shell header or its own scrim.

The RFI composition is the accepted reference-register pattern: focused
feature components compose shared `Drawer` and `RegisterToolbar` primitives;
later registers must reuse that pattern rather than introduce a broad generic
`BaseRegister`. Routing imports use `react-router` 8.3.0 (not the retired DOM
package); `.node-version`, package engines, and CI require Node 22.22.0.

`public/rfis-view.js` and its existing test coverage
(`tests/unit/rfi-ui.test.ts`) are retained unchanged as rollback/reference
coverage; removing them is a later cleanup-phase decision.

## The detail workspaces (UI-7, native React)

`/projects/:projectId/records/:recordId`,
`/projects/:projectId/records/:recordId/revisions/:revisionId`, and
`/projects/:projectId/rfis/:rfiId` are native React as of UI-7. `AppLayout.tsx`
special-cases `route.id === "record-detail" | "revision-detail" |
"rfi-workspace"` and renders `<RecordWorkspaceFeature>`,
`<RevisionWorkspaceFeature>`, or `<RfiWorkspaceFeature>` once the project
context is `ready`, keyed by the full identity in the path so navigating
between two records, revisions, or RFIs never reuses the previous one's
component state. No route, API, capability, or read model changed.

### The shared Record Workspace pattern

`WorkspacePage` (`src/ui/components/patterns/WorkspacePage.tsx`) is the
detail-route counterpart to `RegisterPage` and owns the binding hierarchy from
`APP_UI_FOUNDATION.md` §5.2 exactly once: breadcrumbs, an identity header with
one primary current action plus an overflow menu, an optional lifecycle
`WorkspaceNotice`, the `MetadataStrip`, the current-work/content body, and
secondary history/activity. It renders exactly one of `loading`, `ready`,
`missing`, or `error`. `WorkspaceSection` gained an optional `headingLevel`, so
sections inside a workspace are `h3` under the identity `h2` and the outline
stays honest — the shell still owns the only `h1`. `ButtonLink` was added to the
primitives so a download or workspace destination keeps real anchor semantics
instead of a button wearing a link's job, and `useReturnFocus` centralises focus
restoration for overlays opened programmatically rather than from a Radix
trigger.

### Record workspace

Record facts (discipline, total files, source, created, updated) live in the
metadata strip; revision facts (change summary, created, files, issuance) live
in the revision panels, so record and revision metadata never share one
unlabeled list. A draft never impersonates the authoritative current revision:
when both exist the draft is shown as **Current work** and the published version
keeps its own **Current version** panel, with older published/superseded
revisions in the secondary **Version history**. Multiple drafts are listed
rather than silently reduced to one. Edit details, Archive, and Create draft
revision run through the shared `FormDialog`/`AlertDialog`; archiving and
publishing are explicit confirmations, never ordinary saves. An archived record
states the lifecycle reason instead of quietly dropping its actions.

### Revision workspace

The identity header names the exact version, its status, and whether it is the
document's current version; the breadcrumb keeps the owning document one click
away. Published and superseded versions state that they are immutable, and an
archived document's notice takes precedence over the revision's own. Upload
appears only when the server returns `revision.capabilities.uploadFile`, and
Publish only when `publishRevision` is true *and* the draft has at least one
file — otherwise the workspace explains the requirement rather than offering a
disabled control. A failed upload refetches the workspace *before* offering a
retry, so the file list on screen is confirmed server truth and a repeat attempt
cannot silently attach a second copy; this is the UI-6B staged-work rule applied
to a single-stage sequence.

### RFI workspace

The RFI is a structured record, so its "current work" is its authoritative
content rather than a file list. Response content is a separate section from the
question and is never merged into it. Attachments carry an explicit role
(supporting attachment / reference drawing) and their exact draft revision.
Draft editing is one form gated on `capabilities.updateDraft`, carries the
server's `lockVersion`, and on `409 RFI_VERSION_CONFLICT` reloads the
authoritative values and asks for a deliberate retry; a 403 says permission was
lost rather than retrying. While the draft is editable, Assigned to and Response
due live in the editor and are omitted from the metadata strip, so each fact has
exactly one authoritative location. Close, Reopen, Void, and the intentional
pre-issue **Return to draft** correction are confirmed transitions from
top-level server capabilities. The full issuance dialog remains out of scope.
After reload, `officialIssue` renders its immutable Original Issue evidence and
authorized official-PDF download; it never supplies current status or actions,
which remain top-level `rfi.status` and `capabilities`. A legacy RFI that
consumed a number without a complete issuance is labelled "Needs issue repair"
with the reconciliation notice instead of being presented as issued. The
template-bound document view is read-only, rendered on demand inside a
`Collapsible` through `createRendererPreviewAdapter`, and states plainly that
the controlled renderer is not loaded in the authenticated workspace when
`globalThis.BASE` is absent (unchanged from the legacy workspace — see "Known
limitations" in `UI_PROGRAM_STATUS.md` §5G).

### Rollback

`public/record-detail-view.js`, `public/record-detail-dialogs.js`,
`public/revision-detail-view.js`, `public/rfi-workspace-view.js`, and
`public/rfi-template-preview.js` remain in the tree with their existing test
coverage (`tests/unit/record-detail-ui.test.ts`,
`tests/unit/revision-detail-ui.test.ts`, `tests/unit/rfi-ui.test.ts`), and their
`featureDescriptor` entries are unchanged. Removing the three `route.id`
branches in `AppLayout.tsx` returns each route to its legacy controller with no
data migration and no API change.

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

`pdf-export.js` and the vendored `pdf-lib` runtime preserve the current
controlled-document PDF export path. They remain outside the React/Vite host;
the UI-2 merge retains this current-main capability rather than moving document
rendering or PDF generation into React.

The former root shared-library markup is preserved at `library.html`,
continuing to load `engine.js`, `library-api.js`, `global-search.js`, and
`home.js` unchanged; its title, breadcrumb, and heading now consistently read
"Document Library" to match the nav label. The unavoidable legacy limitation
is that `/` now resolves to the required application Dashboard, so bookmarks
that previously relied on the root for the library must use `/library`
(`library.html` remains accepted and redirects to the extensionless canonical
URL). Document records are not merged with project Records.

## Frontend test structure

`tests/unit/react-shell-routing.test.ts` proves the React route map
(`src/ui/app/routing.ts`) resolves every canonical URL identically to the legacy
`public/app-routing.js` table (redirects, normalization, admin gating,
descendant project-tab selection, non-application API/asset paths, and the
feature-mount descriptor map), so the two cannot drift.
`tests/unit/react-shell.test.tsx` mounts the real React shell in Happy DOM with a
stub runtime and mocked session/project fetches and covers: the `/`→`/dashboard`
and `/projects/:id`→overview redirects preserving query and hash; active global
section and role-gated Administration visibility; a generic not-found for
unauthorized `/admin` and for 403/404 projects; real project identity with the
parent tab selected for descendant routes; a retryable project error with request
id; session-first loading (no feature or project request before the session
resolves) and session-error recovery on retry; the unknown-route not-found
surface; heading focus and the route announcement after navigation; and the
mobile drawer (open with focus in the drawer, Escape close with focus
restoration, body scroll lock, and close-and-navigate on a drawer link).

Four suites added in the UI-4 correction pass exercise the React shell through
a real `<BrowserRouter>` harness (`tests/helpers/react-shell-harness.tsx` —
deliberately not `<MemoryRouter>`, since the legacy controllers under test read
`window.location` directly, which only a router driving the real
`window.history` can keep in sync with in a test; Back/Forward are driven
through `useNavigate()`'s `navigate(-1)`/`navigate(1)`):

- `tests/unit/react-shell-history-parity.test.tsx` (6 tests) — same-route
  URL-history parity: status=open → status=draft → Back remounts the same
  controller (no new factory call, no new `reload()`); sort/filter query state
  round-trips through Back; a hash-only navigation remounts; the factory and
  `reload()` are each called exactly once across several query-only
  navigations; a genuine path navigation still destroys the old controller;
  browser Back/Forward across two different feature routes still works.
- `tests/unit/react-shell-project-revalidation.test.tsx` (5 tests) — project
  authorization is revalidated on a route-to-route navigation within the same
  project, not on a query-only navigation; a project that has become 403 since
  it was last visited shows the generic not-found state and mounts no feature;
  a failed revalidation recovers via retry; and no feature request begins
  before a pending revalidation resolves.
- `tests/unit/react-shell-resilience.test.tsx` (4 tests) — a feature-factory or
  API-client import rejection shows the shared error+retry surface and
  recovers on retry; navigating away while a feature is loading never mounts
  the abandoned controller; the error/retry surface has accessible
  labels/status (`role="alert"`, an accessible "Try again" button).
- `tests/unit/feature-runtime-resilience.test.ts` (1 test) — proves
  `featureRuntime.ts`'s `apiClientPromise` is never permanently cached after a
  rejection (two sequential calls to `defaultShellRuntime.getApiClient()`
  after the first rejects return different promise objects), deterministically
  and without mocking, since an absolute `"/app-api.js"` import specifier
  reliably fails to resolve under Node/Vitest.

The UI-2 vanilla shell modules retain their own coverage as the rollback path:
`tests/unit/app-routing.test.ts` covers legacy route resolution, nested-tab
selection, Administration role policy, unknown paths (including the retired tools
hub routes), and API/static bypass. `tests/unit/app-shell.test.ts` mounts the
real browser modules in Happy DOM and covers navigation content/active state
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

### UI-5 native RFI register tests

`tests/unit/rfi-register-react.test.tsx` (33 tests, harness in
`tests/helpers/rfi-register-harness.tsx` — a real `<BrowserRouter>` +
`QueryClientProvider` + `ShellProvider` around `RfiRegisterFeature` with a
fetch mock for the `/api/v2/projects/:id/rfis` read/write endpoints) covers:
the compact seven-column hierarchy and accessible action menus; draft badges;
row-primary-area editing vs. canonical issued navigation; one shared Drawer
open at a time; focus entering at Subject and returning to the row or Add RFI
trigger on Close/Escape; every editable field and the Additional information
collapsible;
changed-only commits with no per-keystroke PATCH; select-commits-on-change
with the contact id; date-commits-on-blur; textarea Enter-inserts-newline vs.
non-textarea Enter-commits; required-field validation blocking the save;
Saving→Saved; 403 permission-loss; 409 conflict reload with the updated row
and message; Add RFI creating a draft and opening New RFI focused at Subject;
Escape committing an active field before Drawer close; column-header
sort with `aria-sort` and direction toggle; the exact four toolbar controls
with no sort dropdown; search-replaces/filter-pushes history-length deltas;
an in-progress edit preserving URL filters; filtered-empty vs.
first-use-empty with Clear All; browser Back restoring a prior filter;
loading/permission-denied/retryable-error-with-retry states; and mobile cards
rendered alongside the table.

`tests/unit/rfi-register-route-integration.test.tsx` (2 tests) proves
`project-rfis` mounts the native `.rfi-register-page` feature and never
invokes the legacy `rfis` feature factory, while `rfi-workspace` still mounts
through `LegacyFeatureMount`. `tests/unit/rfi-register-tokens.test.ts`
(2 tests) proves `rfis.css` has no raw colour literals and references only
registered `--app-*` tokens, mirroring the UI-3 enforcement pattern.
`tests/unit/base-component-tokens.test.ts`'s existing single-source
Lucide/Radix import check already walks all of `src/ui`, so it also covers
the new `src/ui/features/rfis/*` files.

`tests/unit/react-shell-history-parity.test.tsx` no longer uses "rfis" as an
example compatibility-mounted controller (the RFI register does not mount
through `LegacyFeatureMount` anymore); its same-route URL-history-parity
proof now runs entirely through `records`, the other legacy controller that
reads filter/sort state from `window.location.search`. `tests/unit/rfi-ui.test.ts`
(the legacy `rfis-view.js`/`rfi-workspace-view.js` suite) is unchanged and
retained as rollback coverage.

### UI-3 component library tests

The UI-3 library has six focused suites, run under Happy DOM with Testing
Library (opted in per file with a `// @vitest-environment happy-dom` docblock;
`tests/helpers/setup-component-dom.ts` registers jest-dom, auto-cleanup, and the
Radix pointer/observer polyfills):

- `tests/unit/base-components-behavior.test.tsx` — component behaviour and
  explicit states: Button click/`type=button`/loading-blocks-interaction,
  keyboard checkbox toggle, Field wiring (`required`, `aria-invalid`, the
  two-id `aria-describedby`, and the linked error alert), and a "Field control
  id consistency" section covering generated ids, an explicit `controlId`, a
  caller `id` on the child control that must not disconnect the label, and
  standalone (outside-Field) usage — for TextInput, TextArea, Select, and
  DateInput.
- `tests/unit/base-components-keyboard.test.tsx` — keyboard and focus for the
  overlay/navigation components: Dialog labelling + focus-into-subtree + Escape,
  Drawer open/Escape/focus-restoration, Tabs arrow-key selection and
  tab/tabpanel roles, DropdownMenu open-on-Enter + item activation, CommandMenu
  filter + arrow/Enter selection, and a "CommandMenu robustness" section
  covering two simultaneously mounted instances (id collision safety), items
  shrinking while the menu stays open, the active item disappearing after
  filtering, an empty items collection, and the search input's default and
  overridden accessible name.
- `tests/unit/base-components-accessibility.test.tsx` — accessible names for
  icon-only controls, decorative-vs-meaningful icon exposure, status conveyed as
  text, labelled radio groups and breadcrumbs, the filter-chip remove name, and
  the error/save live regions.
- `tests/unit/base-component-tokens.test.ts` — token enforcement: no raw colour
  literals in the component or lab CSS, every referenced `--app-*` token is
  registered and declared, brand tokens are only read through documented
  fallbacks, and `lucide-react`/`radix-ui` are imported only from their single
  allowed locations.
- `tests/unit/base-status-badges.test.tsx` — domain-status vocabulary
  exhaustiveness: `RFI_STATUS_VOCABULARY`/`RECORD_STATUS_VOCABULARY`/
  `REVISION_STATUS_VOCABULARY` keys exactly match their domain constants
  (`RFI_STATUSES`/`RECORD_STATUSES`/`REVISION_STATUSES`), no non-authoritative
  alias (`responded`/`issued`/`in_review`) remains, `due_soon`/`overdue` do not
  overlap the stored RFI status enum, and every authoritative status/condition
  renders a readable label (`it.each` over all domain values).
- `tests/unit/ui-lab-catalog.test.tsx` — the UI Lab renders the real production
  components: every required state is covered across the catalog, all three
  component groups are present, every example mounts without throwing, and the
  lab shell renders with viewport controls.

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
`src/application/rfis`, and RFI-specific repositories over the shared
Records → Revisions → Files spine. Each RFI uses a stable `records` identity, a
one-to-one `rfi_details` extension, a current draft revision, and revision-scoped
files. Slice 2A now supplies the guarded immutable-revision and official-artifact
transaction; Slice 1's former fail-closed issuance boundary remains historical,
not current behavior. Project, contact, and RFI lifecycle mutations
append durable activity events. PR 5 adds `src/domain/records`,
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
src/ui/theme/                application semantic tokens (single source)
src/ui/components/            BASE component library (primitives/interactive/patterns)
src/ui/app/                   UI-4 React application shell, routing, query hooks, feature mount
src/ui/app/evidence/          dev-only shell + UI-5/UI-6A/UI-6B scenario screenshot harness (never shipped)
src/ui/features/rfis/         (UI-5) native React RFI register feature
src/ui/features/projects/     (UI-6A) native React Projects register + Create workflow
src/ui/features/records/      (UI-6B) native React Document Register + Add Document workflow
src/ui/lab/                   development-only UI Lab (real components, dev-only build)
tests/unit/                  schema, renderer, domain, shared component, shell, RFI, Projects, and Records regressions
tests/integration/           Worker-runtime, D1, R2 (local/test binding), and API regressions
tests/helpers/               reusable D1, route, component-DOM, RFI, Projects, and Records test harnesses
migrations/                  existing D1 migrations (additive, plus one safe table rebuild)
scripts/capture-ui4-evidence.mjs  dev-only Playwright/Chromium screenshot capture for the UI-4 shell
scripts/capture-ui5-evidence.mjs  dev-only Chrome DevTools Protocol evidence capture with exact mobile CSS viewports
scripts/capture-ui6a-evidence.mjs deterministic native Projects evidence capture at exact viewports
scripts/capture-ui6b-evidence.mjs deterministic Document Register evidence capture; waits on state selectors
docs/evidence/ui-3/          committed UI Lab desktop/mobile captures
docs/evidence/ui-4/          committed React shell desktop/mobile/drawer captures
docs/evidence/ui-5/          committed native RFI register desktop/mobile/tablet and Drawer-state captures
docs/evidence/ui-6a/         committed native Projects desktop/mobile/register-state captures
.github/workflows/           pull-request validation
```

The integration suite runs in the Cloudflare Workers runtime with an isolated local
D1 database and applies the repository migrations before tests. The UI-3 component
suites run in the default unit project under Happy DOM.

Application scripts: `npm run build`/`build:ui` emit the production application
bundle to `public/app/` (unchanged by UI-3, which ships no mounted feature yet);
`npm run lab` serves the UI Lab and `npm run lab:build` emits the dev-only
`dist/ui-lab/` artifact. Neither lab script touches `public/`.
