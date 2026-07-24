# BASE UI Program Status

**Status date:** 2026-07-24
**Current phase:** UI-4 (React application shell and route parity) implemented on branch `claude/ui-4-react-foundation-ywnpm2`, PR #44 (kept as draft), with a parity/resilience correction pass applied. RFI Slice 1, UI-1, UI-2, and UI-3 are complete and merged (UI-3 PR #43 merged as `cb9f191`).
**Active branch/PR:** `claude/ui-4-react-foundation-ywnpm2`, PR #44 (draft, not merged). PR #36, PR #41, and PR #43 are merged to `main`.
**Authority:** This is the living handoff for the UI foundation program. Update it in every UI-related PR.

> **2026-07-24 UI-4 correction pass (PR #44):**
> A product-owner review of PR #44 found three gaps against the legacy shell's
> exact behavior, all fixed on the same branch: (1) `LegacyFeatureMount` did not
> remount an already-mounted compatibility controller when only the query
> string or hash changed through React Router, so legacy controllers that read
> filter/sort state from `window.location.search` inside their own `mount()`
> (`records-view.js`, `rfis-view.js`) never saw the new URL on a same-route
> navigation or browser Back/Forward; (2) `useProject`'s `staleTime: Infinity`
> cached a project's authorization decision indefinitely, so returning to a
> previously visited project (e.g. via Back) could keep showing a stale `ready`
> project instead of re-confirming access with the server; (3) a
> `getApiClient()`/`loadFeatureFactory()` import failure left an empty feature
> area with no way to recover, and `featureRuntime.ts` permanently cached a
> rejected `apiClientPromise`, wedging every future caller after one transient
> failure. All three are fixed — see §"UI-4 correction pass" below for the full
> breakdown. Full `npm run check` passes (Prettier, Cloudflare types,
> TypeScript, ESLint, **395 unit tests**, **119 Worker integration tests**, the
> production build, Pages Functions build, `npm audit --audit-level=high` clean,
> and the secret scan); `npm run lab:build` passes. The correction pass adds 16
> tests across four new suites (6 history-parity + 5 project-revalidation + 4
> resilience + 1 featureRuntime-caching). No merge occurred; PR #44 stays draft.
>
> **Cloudflare Pages preview:** this session has no local Cloudflare
> credentials (`wrangler whoami` reports unauthenticated), but the
> repository's Cloudflare Pages GitHub App integration deployed a preview
> automatically on push, independent of local wrangler auth. For commit
> `74ba530` (this correction pass): preview URL
> `https://ea629704.base-office-forms.pages.dev`, branch preview URL
> `https://claude-ui-4-react-foundation.base-office-forms.pages.dev`, GitHub
> check `Cloudflare Pages` — success. An unauthenticated fetch of the preview
> root returns HTTP 403, the expected, correct Cloudflare Access behavior for
> an unauthenticated visitor; this session has no authenticated Access
> session or browser, so no authenticated smoke test could be performed here.
> See §"UI-4 correction pass" for the product-owner smoke checklist to run
> against that preview.

> **2026-07-24 UI-4 implementation:**
> The React application shell now owns global composition — navigation, the
> mobile drawer, session/organization and project context, React Router, the
> TanStack Query provider, the toast provider, an error boundary, route
> loading/not-found states, project tabs, page containers, focus management, and
> route announcements. Feature screens not yet migrated (Dashboard, Projects,
> Overview, Records, Record/Revision detail, RFIs, RFI workspace) mount unchanged
> through a compatibility bridge that loads their existing `public/*-view.js`
> controllers. Every canonical URL, the `/`→`/dashboard` and
> `/projects/:id`→overview redirects (query/hash preserved), browser
> back/forward, safe 403/404 handling, descendant project-tab selection, the
> drawer focus trap/restoration, session-first loading, and server-derived
> authorization are preserved and proven by tests. Route parity is enforced by a
> test that resolves every canonical URL through both the new typed route map and
> the legacy table. Full `npm run check` passes (Prettier, Cloudflare types,
> TypeScript, ESLint, **379 unit tests**, **119 Worker integration tests**, the
> production build, Pages Functions build, `npm audit --audit-level=high` clean,
> and the secret scan). The UI-4 suites add 43 tests (28 routing-parity + 15
> shell). Desktop, mobile, and mobile-drawer shell captures are
> committed under `docs/evidence/ui-4/`. No merge occurred. See §"UI-4 complete"
> below.

> **2026-07-24 UI-3 foundation-review fixes (PR #43):**
> A foundation review of PR #43 found five issues, all addressed on the same
> branch: (1) `CommandMenu` used fixed, instance-colliding DOM ids and an
> unguarded active index that could point past the end of a shrunk/filtered
> list; (2) `Field`'s label could become disconnected from its control if the
> caller passed an `id` directly to a child control instead of through Field;
> (3) the status vocabulary mixed an invented flat status list (including
> non-authoritative aliases like `responded`/`issued`/`in_review`) with
> calculated due/overdue conditions instead of the real domain status enums;
> (4) `DropdownMenu` wrapped each item in an unnecessary `<div>`. All four are
> fixed — see §"UI-3 complete" below for the full breakdown — plus (5) a
> `DropdownMenu` markup cleanup while touching interactive components. Full
> `npm run check` passes (Prettier, Cloudflare types, TypeScript, ESLint,
> **336 unit tests**, **119 Worker integration tests**, the production build,
> Pages Functions build, `npm audit --audit-level=high` clean, and the secret
> scan); `npm run lab:build` passes. No merge occurred; PR #43 stays draft.

> **2026-07-23 UI-3 implementation:**
> The BASE application component library, a development-only UI Lab, and the
> component/keyboard/accessibility/token test suites are implemented on
> `claude/base-components-ui-lab-5l05ux`. Full `npm run check` passes (Prettier,
> Cloudflare types, TypeScript, ESLint, 301 unit + 119 integration tests, the
> production build, Pages Functions build, `npm audit` clean, and the secret
> scan). Desktop and mobile UI Lab captures are committed under
> `docs/evidence/ui-3/`. The library is present and tested but not yet mounted by
> the legacy shell, so the shipped `public/app/app.js` bundle is unchanged; feature
> adoption happens in UI-4 onward. See §"UI-3 complete" below. No merge occurred.

> **2026-07-23 RFI Slice 1 production closeout:**
> PR #36 (`feature/rfi-slice-1-register-workspace`) was squash-merged to `main`
> as `e2bca602b4c867f9dd6ec5d17b5b3f8aea690d06`. Production Pages deployment
> `a6cccd6b-e893-42fb-854a-96f9a26d41e2` (`https://a6cccd6b.base-office-forms.pages.dev`)
> built from that commit. Migration `0014_rfi_document_control_alignment.sql`
> was applied to production (`base-office-forms-library`,
> `1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`) at `2026-07-23 18:56:28`; `0013` was
> correctly skipped, not rerun. Ledger is exactly `0001`–`0014`. Full evidence,
> reconciliation results, and known limitations are in
> `RFI_SLICE_1_ROLLOUT.md` §"Production closeout". **RFI Slice 1 is complete.**
> UI-3 is now the next active implementation phase; RFI Slice 2A backend
> architecture may begin once `main` is pulled and stable, but Slice 2 issuance
> UI work stays paused until UI-3's shared components exist. Do not begin UI-3
> or Slice 2 work in this task.

## 1. Current direction

- Preserve the document-control domain, D1/R2 model, authorization,
  revision/file identity, immutable issuance architecture, compatible JSON
  definitions, `public/engine.js`, and official document output.
- Introduce React + TypeScript + Vite incrementally for the authenticated
  workspace; preserve canonical routes, `/api/v2`, Cloudflare Pages, Studio,
  and Document Library while feature routes migrate later.
- Keep application CSS separate from controlled-document CSS. Only neutral
  brand tokens may cross the boundary.
- Use Radix behavior with BASE-owned components and Lucide through one icon
  component when components are introduced in UI-3.
- Do not adopt Tabulator for the RFI register. Spike 0 rejected it for a
  documented keyboard regression; reassess it only for a future high-volume
  register, log, or export through `BaseDataGrid`.

## 2. Completed discovery and decisions

### Spike 0 — complete, rejected for the RFI register

The Tabulator RFI prototype proved save, validation, conflict, URL-state, and
mobile-card behavior, but its documented API cannot faithfully preserve BASE's
click-to-select, Enter/type-to-edit, and non-editing arrow-key workflow. The
expected RFI list size also does not justify the lazy-loaded ~102 KB gzip
dependency. Keep the controlled custom table. See
`docs/spikes/TABULATOR_RFI_REGISTER_SPIKE.md` on the spike branch for the
behavior matrix and visual evidence. A later high-volume use needs a new
decision, assistive-technology evidence, and bundle plan.

### UI-1 — complete

The audit covered the required screens and produced the binding contracts in
`APP_UI_FOUNDATION.md`, `UI_IMPLEMENTATION_PLAYBOOK.md`, and the ADR record.

| Surface                      | Current disposition                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Dashboard / Project Overview | Preserve attention-first hierarchy; migrate shared summary/activity patterns in UI-8.               |
| Projects / Records           | Preserve server read models and capability gates; replace local register chrome in UI-6.            |
| Record / Revision workspaces | Preserve document, revision, and file identity; unify workspace chrome in UI-7.                     |
| RFI register / workspace     | Browser route remains outside UI-2; use the controlled table, not Tabulator, in its delivery phase. |
| Create/edit dialogs          | Preserve validation, recovery, and server authority; move to shared dialog patterns in UI-3/UI-8.   |
| Studio / Document Library    | Preserve renderer-compatible operation; migrate application chrome in UI-9.                         |

The audit found that the shell already centralizes project context, route focus,
mobile drawer behavior, API errors/request IDs, and responsive thresholds, but
headers, registers, cards, dialogs, status tones, file rows, and history remain
mostly local markup and CSS. The application heading target is Archivo; UI-2
does not perform the later legacy-Georgia typography migration.

## 3. UI-2 complete — PR #41

### Implemented on the branch

- React/TypeScript/Vite deterministic build emitted to `public/app/` for
  Cloudflare Pages.
- `LegacyApplicationHost` boots the existing `app-shell.js`; no feature route
  or domain behavior has been migrated into React.
- Authenticated `index.html` no longer loads `public/base.css`; neutral brand
  values live in `public/brand-tokens.css`, while `base.css` remains renderer
  and controlled-document CSS.
- The application-owned reset now supplies the authenticated body's margin,
  Archivo/font color, smoothing, paragraph reset, and complete app box sizing.
  `base.css` imports the shared tokens through the relative
  `./brand-tokens.css` path; the renderer remains otherwise independent.
- Controlled renderer-preview adapter, renderer source stability regression,
  dependency/license record, build verification, local-development guidance,
  and rollback notes are present.
- The narrow, previously proven Miniflare `sharp` override resolves the
  development/test audit finding without `npm audit fix --force`.

### Authenticated product-owner closeout (2026-07-23)

The product owner completed the authenticated retest on
`https://b2e8a4ce.base-office-forms.pages.dev`. Dashboard and Project Overview
load without HTTP 500/Cloudflare 1101; `BASE UI Preview` and `UI-2 Smoke Test`
are available; Records shows `Preview Test Document` and its draft revision.
Projects and Records register captions, plus search, filter, and sort labels,
are visually hidden while retaining meaningful accessible names in the browser
accessibility pane. Browser Back/Forward, direct project-route refresh, Studio,
Document Library, controlled-document preview, and mobile navigation also pass.

The UI-2 exit gate is satisfied. PR #41 is ready for review and merge; this
status does not authorize beginning UI-3 before PR #36 reconciliation.

### Automated validation after merge

After the nested Miniflare `sharp` override, `npm install` regenerated
`package-lock.json` with `sharp` 0.35.3. `npm audit --audit-level=high` reports
zero vulnerabilities. The 2026-07-23 `npm run check` gate passes Prettier,
generated Cloudflare types, TypeScript, ESLint, 234 unit tests, 101 Worker
integration tests, the Vite application build, static asset verification, Pages
Functions compilation, dependency audit, and the 245-file secret scan. No
browser screenshots or interactive smoke evidence can be produced here because
no Access-authorized browser is available.

### Product-owner smoke and preview root cause (2026-07-23)

The authenticated smoke passed session/application shell, Projects, Records,
direct navigation plus Back/Forward, Studio, Document Library, controlled
document preview, and mobile navigation. It failed Dashboard and Project
Overview with `Unable to load`; the reported overview request returned HTTP 500
and Cloudflare Error 1101 at 2026-07-23 15:32:46 UTC (Ray ID
`a1fbbd60bbfef3cb`).

The direct Cloudflare D1 reproduction captured the exact underlying exception:
`no such table: rfi_records: SQLITE_ERROR [code: 7500]`. Dashboard reaches that
table in `src/infrastructure/db/d1/dashboard-read-repository.ts` and Project
Overview reaches it in
`src/infrastructure/db/d1/project-overview-read-repository.ts`. Those are the
only failing read models; Projects and Records do not query `rfi_records`.
Cloudflare Pages tailing is live-only and returned no historical entry for the
given Ray ID, but the SQL exception and source query reproduce the reported
Worker failure exactly.

The prior Pages preview database, `base-office-forms-preview`
(`b3b1b9d7-b4ce-4ebd-97c4-67c9f450f3d6`), recorded PR #36 migrations `0013` and
`0014`. Migration `0014` drops `rfi_records`, which explains the failure. UI-2
now binds the new `base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`) through `preview_database_id`. Its
ledger contains only `0001`–`0012`; `rfi_records` has the expected
`title`, `due_date`, `status`, and related legacy columns, and the Dashboard
and Overview count queries both return successfully. Production's D1 binding
and migration ledger were only read; no production migration was applied.

### Preview smoke fixture (2026-07-23)

PR #41 provisions an idempotent, deterministic fixture command for
`base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`). It accepts the product owner's Access
email only from `UI2_FIXTURE_EMAIL`, reads production only to resolve the
existing user identity, then writes a synthetic active `BASE UI Preview`
organization, `UI-2 Smoke Test` (`UI2-001`) project, active `org_admin` and
`project_manager` memberships, and one `Preview Test Document` draft revision.
It seeds no RFIs, files, issuances, or production-derived business data. The
matching cleanup command removes only its deterministic fixture rows. The
command verifies the exact `0001`–`0012` ledger, membership/project access,
Dashboard and Project Overview SQL, and the Records result. Production has no
write path in this workflow.

### Preview Project Overview investigation (2026-07-23)

An earlier unauthenticated request to the PR preview returned Cloudflare Access
`302 Found`, which could not test the Pages Function. The subsequent
product-owner authenticated smoke and direct D1 query established the actual
preview-schema mismatch documented above. The new guarded fixture supplies the
minimum Access identity and synthetic project used for the passing browser
retest; it does not alter the source route or its read model.



## 4. UI-2 exit gate

UI-2 is complete only when all of these are true:

- the merged application builds and deploys through the current Cloudflare
  Pages workflow;
- official document output and valid definitions remain compatible;
- the authenticated app does not inherit generic document classes or
  document-level body rules;
- legacy Studio and Document Library routes remain available;
- session, Dashboard, Projects, Project Overview, Records, direct refresh,
  browser history, controlled preview, and mobile navigation pass smoke tests;
- `npm run check` passes after lockfile regeneration;
- the preview overview failure is fixed or evidenced as an environment
  configuration/schema problem and corrected in preview;
- rollback notes, dependency documentation, current structure, ADRs, tracker,
  and PR #41 evidence are current.

**Satisfied 2026-07-23:** the complete local gate, active Pages preview, and
the authenticated product-owner retest above meet every UI-2 exit criterion.

## 5. RFI Slice 1 — production closeout (2026-07-23)

PR #36 is merged and its production migration/reconciliation/smoke sequence
is complete. Full evidence lives in `RFI_SLICE_1_ROLLOUT.md`; the key facts:

- **Merged main commit:** `e2bca602b4c867f9dd6ec5d17b5b3f8aea690d06`.
- **Production deployment:** `a6cccd6b-e893-42fb-854a-96f9a26d41e2`
  (`https://a6cccd6b.base-office-forms.pages.dev`), built from that commit.
- **Migration:** `0014_rfi_document_control_alignment.sql` applied to
  `base-office-forms-library` (`1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`) at
  `2026-07-23 18:56:28`. `0013` was already applied and was correctly skipped,
  not rerun. Resulting ledger is exactly `0001`–`0014`.
- **Reconciliation (all passed):** one stable Record, one `rfi_details` row,
  and one correct current draft revision for the single migrated RFI; a
  complete `rfi_0014_reconciliation` map entry; zero orphan details,
  revisions, responses, or files; zero duplicate records; the RFI's
  unresolved Party value (`fvf`) preserved as `responsible_party_legacy_text`
  rather than dropped or force-matched; sequence state preserved
  (`project_record_type_sequences.last_number = 1`, matching the pre-migration
  `rfi_number_sequences`); legacy tables `rfi_records`, `rfi_attachments`,
  `rfi_number_sequences` retired and absent.
- **Schema marker:** `app_meta.schema_version` reached `12` immediately after
  migration and **remained `12`** after authenticated Dashboard and Project
  Overview requests — confirms the legacy-bootstrap fix (`INSERT OR IGNORE`,
  commit `5366208`) holds under real production traffic.
- **Production smoke passed:** Dashboard, Projects, Project Overview, Records,
  direct-route refresh, browser Back/Forward, Studio, Document Library,
  controlled document preview, mobile navigation; the migrated RFI appears
  exactly once with subject/question preserved and the unresolved Party value
  intact; expandable draft editor (single-open, normal text selection,
  field save/refresh persistence), Details/Preview, RFI workspace load,
  metadata/breadcrumbs, and controlled renderer preview all pass; issuance
  remains fail-closed as designed.
- **Known limitations:** only one legacy RFI existed in production at
  migration time and it had zero responses/attachments, so response and
  R2-file/attachment-preservation logic were exercised structurally and via
  the disposable 0014 rehearsal's populated fixture, not against real
  production attachment data. The unresolved Party value stays unlinked to a
  `project_contacts` row until someone edits it by hand — expected behavior,
  not a defect. RFI issuance remains incomplete and fail-closed (pre-existing,
  unchanged by this migration).

**RFI Slice 1 is complete.**

## 5A. UI-3 complete — component library and UI Lab

Branch `claude/base-components-ui-lab-5l05ux`, PR #43 (draft). Not merged.

### Foundation review fixes (2026-07-24)

1. **CommandMenu robustness and accessibility.** `listId`/option ids were
   fixed strings (`base-command-list`, `base-command-{itemId}`), so two
   mounted instances collided. The active index was only reset on query
   change, so it could point past the end of the list if `items` shrank or
   the active item disappeared under a filter/capability change while the
   menu stayed open. Fixed: ids are now derived per instance from `useId()`;
   the active index is re-derived from the *current* filtered length on every
   render (clamped in range, `-1` for an empty collection) in addition to a
   reset-on-filter-change effect, so `aria-activedescendant` can never
   dereference an out-of-range item; `aria-controls` is omitted when there is
   no list to control; the search input now takes an explicit `label` prop
   (default `"Search commands"`). New tests in
   `tests/unit/base-components-keyboard.test.tsx` (§"CommandMenu robustness")
   cover two simultaneous instances, items shrinking while open, the active
   item disappearing after filtering, an empty collection, and the combobox's
   accessible name (default and overridden).
2. **Field/control id consistency.** A caller-provided `id` on a child control
   (`TextInput`/`TextArea`/`Select`/`DateInput`) used to win over Field's own
   id, silently disconnecting the label's `htmlFor`. Fixed: `Field` gained an
   optional `controlId` prop that is the one authoritative id for both the
   label and the child control; each control now resolves
   `field?.controlId ?? id`, so Field's id (generated or explicit) always wins
   when a control is used inside a Field, while an `id` prop passed to a
   standalone control (outside Field) is unaffected. New tests in
   `tests/unit/base-components-behavior.test.tsx` (§"Field control id
   consistency") cover generated ids, explicit `controlId`, a caller `id`
   attempting to disconnect the label, and standalone usage for all four
   controls.
3. **Status vocabulary.** The prior single `STATUS_VOCABULARY`/`StatusBadge`
   mixed an invented flat list — including non-authoritative aliases
   (`responded`, `issued`, `in_review`) — with calculated `due_soon`/`overdue`
   conditions that are never stored statuses
   (`src/domain/rfis/rfi.ts` — "Overdue and due-soon are calculated
   conditions, never stored statuses"). Fixed: `StatusBadge.tsx` now exports
   one domain-typed vocabulary per authoritative status enum —
   `RFI_STATUS_VOCABULARY: Record<RfiStatus, …>` (all seven statuses: `draft`,
   `ready_to_issue`, `open`, `response_received`, `closed`,
   `returned_for_clarification`, `void`), `RECORD_STATUS_VOCABULARY:
   Record<RecordStatus, …>` (`active`, `archived`), and
   `REVISION_STATUS_VOCABULARY: Record<RevisionStatus, …>` (`draft`,
   `published`, `superseded`) — plus a separate `AttentionBadge`/
   `ATTENTION_VOCABULARY` for the calculated `due_soon`/`overdue` conditions,
   kept out of the stored-status enums. Each map's key type is imported
   directly from `src/domain/{rfis,records,revisions}` so TypeScript rejects
   an incomplete map the moment a domain enum changes.
   `tests/unit/base-status-badges.test.tsx` additionally asserts at runtime
   that each vocabulary's keys exactly match its domain constant, that no
   non-authoritative alias remains, and that every authoritative status
   renders a readable label (19 tests, `it.each` over all domain statuses).
4. **DropdownMenu markup.** Replaced the unnecessary `<div>` wrapper around
   each `RadixMenu.Item`/`RadixMenu.Separator` pair with a `React.Fragment`.

### Scope delivered

- **Application token source.** `src/ui/theme/tokens.css` is the single source
  of application colour, geometry, typography, spacing, elevation, and motion as
  `--app-*` custom properties (on `:root` so Radix-portalled surfaces resolve
  them; inline fallbacks to `public/brand-tokens.css`). `src/ui/theme/tokens.ts`
  mirrors the names for enforcement. BASE maroon carries primary action, focus,
  selection, and active navigation; danger red is a separate token.
- **Primitives.** Button, IconButton, TextInput, TextArea, Select, Checkbox,
  RadioGroup, DateInput, Field, Label, HelpText, ValidationMessage, Badge,
  Tooltip, Divider, Spinner, Skeleton. `Field` wires each control's id,
  `required`, `aria-invalid`, and `aria-describedby` to its label/help/error.
- **Interactive.** Dialog, AlertDialog, DropdownMenu, Popover, Tabs, Toast,
  CommandMenu, Collapsible, Drawer — Radix behaviour with BASE-owned styling.
- **Application patterns.** AppShell, PageHeader, ProjectHeader, ProjectTabs,
  RegisterPage, RegisterToolbar, FilterChip, Panel, MetadataStrip, FileRow,
  ActivityFeed, EmptyState (first-use vs filtered), ErrorState, PermissionState,
  FormDialog, WorkspaceSection, Breadcrumbs, plus `RfiStatusBadge`/
  `RecordStatusBadge`/`RevisionStatusBadge` (one domain-typed status
  vocabulary per authoritative domain enum — see the foundation-review fixes
  above), `AttentionBadge` (calculated due-soon/overdue, never a stored
  status), and `SaveIndicator` (Saving/Saved/Failed/Conflict).
- **One icon component.** `src/ui/components/icons/Icon.tsx` wraps Lucide; it is
  the only module importing `lucide-react` (enforced).
- **One stylesheet, no raw colours.** `src/ui/components/base-components.css`
  styles everything through tokens with no raw colour literals and no
  feature-specific selectors, so a feature can build a register or workspace
  without new global CSS.
- **Development-only UI Lab.** `src/ui/lab/` renders the real production
  components (shared `catalog.tsx`, no duplicated demo markup) across default,
  hover, focus, selected, disabled, loading, error, long-text, empty, and
  desktop/mobile states. Built only via `vite.lab.config.ts`
  (`npm run lab`/`lab:build` → gitignored `dist/ui-lab/`); never in the
  production bundle.

### Tests and checks

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **336 unit tests**, **119 Worker integration tests**, the Vite
production build, static-asset verification, Pages Functions compilation,
`npm audit --audit-level=high` (0 vulnerabilities), and the secret scan.
`npm run lab:build` passes. UI-3 suites: `base-components-behavior` (incl.
Field control-id consistency), `base-components-keyboard` (Dialog, Drawer,
Tabs, DropdownMenu, CommandMenu keyboard/focus, plus the CommandMenu
robustness cases from the review), `base-components-accessibility`,
`base-component-tokens` (token enforcement + single-source Radix/Lucide
imports), `base-status-badges` (domain-status vocabulary exhaustiveness — new),
and `ui-lab-catalog` (real components across every required state). Component
suites run under Happy DOM via `tests/helpers/setup-component-dom.ts`.

### Evidence

Desktop (1280px) and mobile (390px) UI Lab captures are committed at
`docs/evidence/ui-3/ui-lab-desktop.png` and `ui-lab-mobile.png`, generated from
the built lab with the pre-installed Chromium.
`docs/evidence/ui-3/ui-lab-desktop-primitives-r2.jpg` (2026-07-24) recaptures
the Primitives group after the status-vocabulary rework, showing all seven RFI
statuses, both Record statuses, all three Revision statuses, and the two
calculated attention conditions rendering with distinct tones.

### Known limitations

- The library is not yet mounted by the legacy shell, so `public/app/app.js` is
  unchanged in size; feature routes adopt the components in UI-4 onward. This is
  intentional for UI-3 (build the library; do not migrate screens).
- Screenshots are static full-page captures; live hover/focus pseudo-states are
  demonstrated interactively in the lab and asserted structurally in tests. No
  automated pixel-baseline visual-regression harness is added yet — that is
  UI-10's scope.
- Google Fonts (Archivo) load over the network; in the offline capture the lab
  falls back to `system-ui`, which does not affect layout or component contracts.
- Issuance-domain statuses (`src/domain/issuances/issuance.ts`) have no stored
  status enum today (issuances are immutable point-in-time records), so no
  `IssuanceStatusBadge` exists yet; add one only if/when the domain introduces
  a real issuance status field.

### Next recommended action

UI-3 is complete and merged (PR #43 → `cb9f191`). UI-4 is implemented (see
below); UI-5 is next.

## 5B. UI-4 complete — React application shell and route parity

Branch `claude/ui-4-react-foundation-ywnpm2`. Not merged.

### Scope delivered

- **React composition root.** `src/ui/app/App.tsx` composes the TanStack Query
  provider, the UI-3 `ToastProvider`, a React Router `BrowserRouter`, and the
  application `ErrorBoundary` around `AppLayout`. A single catch-all route hands
  every location to the shell.
- **Typed route map.** `src/ui/app/routing.ts` is a faithful port of
  `public/app-routing.js` (route table, `resolveRoute`, `normalizePathname`,
  `isApplicationPath`, `canViewAdministration`, `PROJECT_TABS`, `projectTabHref`,
  and a `featureDescriptor` map). `tests/unit/react-shell-routing.test.ts`
  resolves every canonical URL through both modules and asserts identical
  results, so the React map cannot drift from the legacy source of truth.
- **The shell (`AppLayout`).** Global sidebar navigation, the mobile off-canvas
  drawer (focus trap, background `inert`, body scroll lock, Escape/backdrop/close
  dismissal, focus restoration, close-on-viewport-change and close-on-navigate),
  the project context header and tabs (descendant routes keep their parent tab
  selected), route loading/session-error/generic-error/not-found/placeholder
  surfaces, page-heading focus management, and the `#route-announcer` live
  region. It reproduces the legacy DOM structure and class names so
  `public/app-shell.css` styles it unchanged.
- **Session and project context on TanStack Query.** `useSession` and
  `useProject` re-check the server per request and never cache an authorization
  decision. A 403 or 404 project collapses to the same generic **Project not
  found** surface; other failures are retryable and carry the API request id.
  Session-first is preserved: no feature or project request is issued before the
  session resolves, and a feature controller mounts only after the project
  context is `ready`.
- **Compatibility mount.** `LegacyFeatureMount` + `featureRuntime.ts` load and
  drive the existing `public/*-view.js` controllers unchanged (create → reload →
  mount into a React-owned container, with `requestRender`, `navigate`,
  `announce`, and `getSession` bridged). No feature workflow is redesigned.
- **Rollback path retained.** `public/app-shell.js` and
  `LegacyApplicationHost.tsx` remain in the tree but are not mounted; reverting
  `main.tsx` to render `LegacyApplicationHost` restores the UI-2 vanilla shell.

### Scope decision (documented)

UI-4 keeps the established sidebar chrome via `app-shell.css` rather than
adopting the UI-3 `AppShell`/`ProjectTabs` *visual* primitives, which imply a
top-navigation paradigm shift. Because the feature screens are not yet migrated,
that swap would be a redesign that risks the not-yet-migrated feature layout,
not a parity migration. The shared components are composed where additive
(`ToastProvider`, error boundary). The visual primitives are adopted as feature
screens migrate (UI-6+). This is a deliberate deviation from the earlier
"compose `AppShell`/`ProjectTabs`" phrasing, made in service of the binding
route/visual-parity requirement.

### Tests and checks

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **379 unit tests**, **119 Worker integration tests**, the Vite
production build, static-asset verification, Pages Functions compilation,
`npm audit --audit-level=high` (0 vulnerabilities), and the secret scan. New
suites: `react-shell-routing` (28 parity/normalization/admin/tab/descriptor
cases) and `react-shell` (15 cases: redirects preserving query/hash, active
nav + admin gating, unauthorized `/admin` and 403/404 project not-found, real
project identity + descendant tab, retryable project error, session-first
loading + session-error recovery, unknown-route not-found, heading focus +
announcement, and the mobile drawer focus trap/restoration/close-and-navigate).
The UI-2 legacy-shell suites (`app-routing`, `app-shell`, `records-ui`, etc.)
remain green as rollback coverage.

### Evidence

Committed captures under `docs/evidence/ui-4/`, generated from the real shell
(mocked runtime) with the pre-installed Chromium via
`scripts/capture-ui4-evidence.mjs`: `shell-desktop.png` (sidebar nav, account
summary, project header, Documents tab active, compatibility mount),
`shell-mobile.png`, `shell-mobile-drawer.png` (open drawer with focus on the
close button and dimmed backdrop), and `shell-dashboard-desktop.png`.

### Known limitations

- Feature screens still run through their existing `public/*-view.js`
  controllers (the compatibility path). Migrating them to React is UI-5+.
- The shipped `public/app/app.js` grows to ~338 kB (~106 kB gzip) and
  `app.css` to ~30 kB (~5 kB gzip) because UI-4 mounts the React shell, router,
  query client, and the UI-3 component stylesheet that UI-3 built but did not
  ship. Expected one-time foundation cost; a bundle/perf budget is UI-10 scope.
- Screenshots are captured against a mocked session/project (no authenticated
  Cloudflare Access session is available in this environment). The chrome is
  real React output; the feature content area shows a representative placeholder.
- No pixel-baseline visual-regression harness yet — that remains UI-10.
- `AppShell`/`ProjectTabs` visual primitives are intentionally not yet adopted
  (see the scope decision above).

### Next recommended action

UI-5 (RFI register on the controlled custom table — no Tabulator) is next. The
exact UI-5 prompt is in the final handoff. Do not merge UI-4 without explicit
approval.

## 5C. UI-4 correction pass — parity and resilience fixes (PR #44)

Branch `claude/ui-4-react-foundation-ywnpm2`, PR #44 (kept as draft). Not
merged.

### 1. Same-route URL-history parity for compatibility-mounted controllers

Some legacy controllers (`records-view.js`, `rfis-view.js`) store filter/sort
state through `window.history.pushState`/`replaceState` issued directly
(bypassing the router) and reread it from `window.location.search` inside
their own `mount()` — see `rfis-view.js`'s `readFiltersFromUrl()`. Because
`LegacyFeatureMount`'s creation effect only ran when the feature descriptor's
key changed, a query/hash-only navigation to the *same* route (a genuine React
Router navigation, or browser Back/Forward — the only two things that actually
move `window.location` when a `<BrowserRouter>` is in use, since raw
`pushState` calls made directly by a feature bypass the router entirely and
never fire `popstate`) never told the existing controller to reread the URL.

Fixed: `LegacyFeatureMount` now accepts a `locationKey` prop (`AppLayout`
supplies `${route.pathname}${location.search}${location.hash}`). A second
effect, independent of the creation effect, remounts the *existing* controller
(`controller.mount(container)`) whenever `locationKey` changes while the
descriptor stays the same — no new factory call, no new `reload()`. A ref
tracks the location a freshly created controller "started" at, so the first
location a new controller sees is never treated as a change requiring an extra
remount. `tests/unit/react-shell-history-parity.test.tsx` (6 tests, using a
`<BrowserRouter>`-based harness — see below) proves: status=open →
status=draft → Back restores status=open by remounting the same controller;
sort/filter query state round-trips through Back; a hash-only navigation
remounts; the controller factory and `reload()` are each called exactly once
across several query-only navigations; a genuine path navigation still
destroys the old controller; and browser Back/Forward across two different
feature routes still works.

**Test harness note:** `tests/helpers/react-shell-harness.tsx` renders the real
shell inside a `<BrowserRouter>` (not `<MemoryRouter>`), seeding
`window.history` before each render. A `MemoryRouter` keeps its location
entirely decoupled from `window.location`, which the legacy controllers under
test read directly — only a router that actually drives `window.history`, as
`BrowserRouter` does and as happy-dom's `history`/`popstate` support, lets
those reads observe the harness's navigations. Back/Forward are exercised
through `useNavigate()`'s `navigate(-1)`/`navigate(1)`, the standard way to
drive a router's own history stack in tests.

### 2. Project-context authorization is no longer cached indefinitely

`useProject` used `staleTime: Infinity` keyed only by `["project", projectId]`,
so once a project was fetched successfully, TanStack Query never asked the
server again for that decision — returning to a previously visited project
(e.g. via Back) could keep presenting a stale `ready` result instead of
re-confirming access.

Fixed: `useProject` now accepts a `revalidationKey` (the route's normalized
pathname, supplied by `AppLayout`). Using React's documented "adjust state
during render in response to a changed prop" pattern, an `epoch` counter is
bumped exactly when `revalidationKey` changes for a route that has a
`projectId` — deliberately *not* on query/hash-only changes on the same route,
and not on ordinary rerenders, since neither is a route transition worth
distrusting existing authorization over. The epoch is part of the query key
(`["project", projectId, epoch]`), so a bump is a *brand-new* query — no stale
`ready` data lingers while the fresh answer is pending — and `AppLayout`
already only mounts the destination feature once `project.status === "ready"`,
so no feature request can begin before the revalidated project confirms
access. `tests/unit/react-shell-project-revalidation.test.tsx` (5 tests)
proves: navigating between two routes in the same project issues a fresh
project request each time (matching the legacy shell's unconditional
per-navigate reload); a query-only navigation on the same route does not;
returning to a project that has since become 403 shows the generic **Project
not found** state and mounts no feature (only one "overview" factory call
total, from the original successful visit); a failed revalidation recovers via
retry; and the destination feature's factory is not invoked until a deferred
revalidation resolves.

### 3. Compatibility-module loading failures are now handled

If `shell.runtime.getApiClient()` or `loadFeatureFactory()` rejected (e.g. a
transient failure serving a `public/*-view.js` module), `LegacyFeatureMount`
left an empty `.feature-view` with no error and no way to recover, and
`featureRuntime.ts`'s `loadApiClient()` permanently cached the rejected
`apiClientPromise` — every future call, for the rest of the page's lifetime,
awaited that same rejection.

Fixed: `LegacyFeatureMount` now catches the `Promise.all([getApiClient(),
loadFeatureFactory()])` rejection and renders a shared, accessible error
surface (`role="alert"`, a heading, and a "Try again" button) instead of an
empty area; clicking Try again bumps a nonce that reruns the creation effect
from scratch. `featureRuntime.ts`'s `loadApiClient()` now resets
`apiClientPromise` to `null` in its catch handler, so a rejection is never
permanently cached — the next call always starts a genuinely fresh import.
The effect's existing `active` guard already ensured no controller is created
after the component unmounts (navigating away while loading); this pass adds a
test proving it explicitly. Every current legacy controller catches its own
load errors internally and never rejects `reload()` (see e.g. `rfis-view.js`'s
try/catch), so the `.catch()` on `controller.reload()` is a documented,
deliberate defensive guard against an unhandled rejection, not a UI path of its
own. `tests/unit/react-shell-resilience.test.tsx` (4 tests) proves: a feature
factory rejection shows the error surface and recovers on retry; an API-client
rejection does the same; navigating away during loading never mounts the
abandoned feature; and the error/retry surface has accessible labels/status.
`tests/unit/feature-runtime-resilience.test.ts` (1 test) proves
`apiClientPromise` specifically is never permanently cached: two sequential
calls to `defaultShellRuntime.getApiClient()` after the first rejects return
genuinely different promise objects (this test is deterministic without any
mocking, since an absolute `"/app-api.js"` specifier reliably fails to resolve
under Node/Vitest, giving a guaranteed rejection to test the cache-reset
behavior against).

### Tests and checks

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **395 unit tests** (+16 over the UI-4 baseline of 379: 6
history-parity + 5 project-revalidation + 4 resilience + 1
featureRuntime-caching), **119 Worker integration tests**, the Vite production
build, static-asset verification, Pages Functions compilation, `npm audit
--audit-level=high` (0 vulnerabilities), and the secret scan. `npm run
lab:build` passes.

### Cloudflare Pages preview

This session has no local Cloudflare credentials (`wrangler whoami` reports
unauthenticated; no `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in the
environment, and `.github/workflows/ci.yml` itself has no deploy step), but
the repository's **Cloudflare Pages GitHub App integration** deploys a
preview automatically on every push, independent of local wrangler auth —
confirmed via the PR's `Cloudflare Pages` check run and the
`cloudflare-workers-and-pages[bot]` comment on PR #44:

- **Commit:** `74ba530f63e6847f107e8f9dee7f87dedce586c2` (this correction pass)
- **Preview URL:** `https://ea629704.base-office-forms.pages.dev`
- **Branch preview URL:** `https://claude-ui-4-react-foundation.base-office-forms.pages.dev`
- **Deploy status:** success (GitHub check `Cloudflare Pages`, completed)

An unauthenticated fetch of the preview root (`WebFetch`) returned HTTP 403 —
the expected, correct Cloudflare Access behavior for a visitor without a
session, not a deploy defect. This session has no authenticated Cloudflare
Access session or interactive browser, so no authenticated smoke test could
be performed here; the checklist below is prepared for whoever has one.

### Product-owner authenticated smoke checklist (against the preview above)

- Session/shell: sidebar navigation, account summary, Dashboard loads.
- Project context: open a project, confirm Overview → Documents → Issuances →
  RFIs → Team tabs each load and keep the correct tab highlighted, including
  from a record/revision detail descendant route.
- **Same-route URL-history parity:** on the RFI register or Documents
  register, change a filter (e.g. status), use the browser Back button, and
  confirm the previous filter's rows reappear without a full page reload.
- **Project revalidation:** open a project, navigate to a different project
  route (e.g. Overview → Documents), and confirm no visible regression (a
  brief "Loading project…" header flash is expected and correct — it reflects
  the project access being re-confirmed with the server on every route
  change).
- **Resilience:** with dev tools open, throttle/block network briefly while
  navigating to a not-yet-loaded route to confirm the "This section could not
  be loaded" / "Try again" surface appears and recovers once the network
  returns (rather than a blank area).
- Mobile drawer: open/close, Escape, and link selection all behave as before.
- Browser Back/Forward across at least two different feature routes.
- Direct URL refresh on a nested project route.

### Known limitations (unchanged from UI-4, still applicable)

- Feature screens still run through their existing `public/*-view.js`
  controllers; migrating them to React is UI-5+.
- No pixel-baseline visual-regression harness yet — that remains UI-10.
- No authenticated browser smoke was performed in this session (no Cloudflare
  Access session or interactive browser available in this environment, though
  a live preview exists — see above); the checklist above is prepared for
  whoever has an authenticated Access session.

### Next recommended action

PR #44 is kept as a draft pending product-owner review of this correction
pass, ideally against a real Cloudflare Pages preview. UI-5 remains the next
phase after UI-4 is reviewed and merged.

## 6. Phase status

| Phase                        | Status                     | Next gate                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------ |
| Spike 0 — Tabulator          | Complete; rejected for RFI | Future high-volume proposal only                 |
| UI-1 — Audit and decisions   | Complete                   | Binding documents and ADRs recorded              |
| UI-2 — CSS + React/Vite      | Complete; merged (`a1ade6d`) | none                                            |
| RFI Slice 1                  | Complete; merged and closed out in production | none                            |
| UI-3 — Components + UI Lab   | Complete; merged (`cb9f191`, PR #43) | none                                   |
| UI-4 — React shell           | **Implemented, correction pass applied; PR #44 kept as draft** (`claude/ui-4-react-foundation-ywnpm2`, not merged) | Product-owner review against a deployed preview, then merge |
| UI-5 — RFI register          | **Now unblocked**          | Controlled-table parity; no Tabulator dependency |
| UI-6 — Projects + Records    | Not started                | Shared register contract                         |
| UI-7 — Detail workspaces     | Not started                | Shared workspace contract                        |
| UI-8 — Dashboard/forms/admin | Not started                | Shared shell/forms/registers stable              |
| UI-9 — Library + Studio      | Not started                | Application foundation stable                    |
| UI-10 — Enforcement/cleanup  | Not started                | Route parity and visual baselines                |
| RFI Slice 2A — backend architecture | Not started; may begin after `main` is pulled and stable | Independent of UI-3 |
| RFI Slice 2 — issuance UI     | Unblocked for components; still gated on review/merge | UI-3 shared components now exist  |

## 7. Current constraints and risks

- Official RFI issuance remains incomplete and must fail closed.
- Existing renderer output and valid definitions remain compatible.
- Browser capability presentation never replaces server authorization.
- The existing Cloudflare development/test dependency audit findings must be
  resolved or formally accepted before a production release; do not use
  `npm audit fix --force` without a review.
- The migrated RFI's Party value remains unresolved (legacy text only) until
  manually reconciled to a project contact.

## 8. Next action

UI-4 (React application shell and route parity) is implemented on
`claude/ui-4-react-foundation-ywnpm2`, PR #44, and has completed a
product-owner-requested correction pass (§5C): same-route URL-history parity
for compatibility-mounted controllers, project-context revalidation on
meaningful navigation instead of an indefinite cache, and handled
compatibility-module loading failures with a shared error/retry surface. PR
#44 is kept as a **draft**; it is not merged. Its exit gate — the shell is
stable enough that feature migrations no longer need to modify global
navigation or invent page containers — remains met, now with the additional
parity/resilience guarantees proven by tests (§5C). The Cloudflare Pages
GitHub App integration auto-deployed a live preview for this commit
(`https://ea629704.base-office-forms.pages.dev`, §5C); the product-owner smoke
checklist in §5C is ready to run against it.

UI-5 (RFI register on the controlled custom table — no Tabulator, per Spike 0)
is the next active phase; its exact prompt is in the handoff. Do not begin UI-5
before UI-4 is reviewed/merged, and do not merge UI-4 without explicit approval.
RFI Slice 2A backend architecture may proceed independently once `main` is
pulled and stable.
