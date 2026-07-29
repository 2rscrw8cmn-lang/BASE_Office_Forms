# BASE UI Program Status

**Status date:** 2026-07-28
**Current phase:** **RFI Slice 2B — Mark ready, official issuance, and
issued-evidence UI.** UI-7 is complete and merged (PR #48, `509d5bb`); the RFI
Slice 2A backend is complete in code and merged (PR #49, `f6b9462`). Only the
Work Dashboard and Project Overview remain compatibility-mounted.
**Active branch/PR:** `feature/rfi-slice-2b-issuance-ui`, draft PR — the
browser-operable record-only issue workflow built on the accepted Slice 2A
contract. See §5I. The UI-6A squash/UI-6B rebase episode recorded in §5F is
closed history, not an active condition.
**Authority:** This is the living handoff for the **UI foundation program (UI-1 … UI-10)**. Update it in every UI-related PR.
**Scope boundary:** This document tracks UI-program phases only. Product delivery phases (RFI Slice 1/2, submittals, templates, sharing, AI, productization) are tracked in `IMPLEMENTATION_ROADMAP.md`; they appear here only as context in §6.2, and their status there is a pointer, not a second source of truth.

> **2026-07-28 Slice 2B issuance UI (this branch):** the RFI workspace now
> completes the browser path `draft → save → mark ready → review issue details →
issue once → server-assigned number → immutable Original Issue evidence`.
> Delivery is `record_only` only; email, share links, and an external portal
> remain deferred. One deliberate issue attempt carries exactly one
> `Idempotency-Key`, reused for every retry of the same canonical payload, and a
> failed request is never treated as proof that nothing committed. See §5I.
>
> **2026-07-28 Slice 2A contract integration (UI-7, merged):** `officialIssue` is
> an immutable `RfiOfficialIssueSummary` for original-issue evidence, not a
> current-state object. The workspace uses top-level `rfi.status` and top-level
> `capabilities` as current authority, including the separately authorized
> `returnToDraft` capability. That rule is unchanged by Slice 2B.

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
  metadata/breadcrumbs, and controlled renderer preview all pass. This is the
  historical Slice 1 result; Slice 2A later added the guarded issue contract.
- **Known limitations:** only one legacy RFI existed in production at
  migration time and it had zero responses/attachments, so response and
  R2-file/attachment-preservation logic were exercised structurally and via
  the disposable 0014 rehearsal's populated fixture, not against real
  production attachment data. The unresolved Party value stays unlinked to a
  `project_contacts` row until someone edits it by hand — expected behavior,
  not a defect. Slice 1 did not include official issuance; that later contract
  is now supplied by accepted Slice 2A.

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
   the active index is re-derived from the _current_ filtered length on every
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

**Current final evidence (2026-07-24):** `scripts/capture-ui5-evidence.mjs`
builds the real shell/evidence harness and records desktop, tablet, and true
390×844/430×932 emulated mobile states. It includes the editable-draft
overflow menu, detail Drawer with Open/Close, validation, saving, conflict,
empty states, mobile cards, and the expanded filter disclosure. The files under
`docs/evidence/ui-5/` are regenerated from the final interaction model;
obsolete inline-editor and cropped-viewport captures have been removed. The
historical capture notes that follow are superseded by this paragraph.

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
adopting the UI-3 `AppShell`/`ProjectTabs` _visual_ primitives, which imply a
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
key changed, a query/hash-only navigation to the _same_ route (a genuine React
Router navigation, or browser Back/Forward — the only two things that actually
move `window.location` when a `<BrowserRouter>` is in use, since raw
`pushState` calls made directly by a feature bypass the router entirely and
never fire `popstate`) never told the existing controller to reread the URL.

Fixed: `LegacyFeatureMount` now accepts a `locationKey` prop (`AppLayout`
supplies `${route.pathname}${location.search}${location.hash}`). A second
effect, independent of the creation effect, remounts the _existing_ controller
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
`projectId` — deliberately _not_ on query/hash-only changes on the same route,
and not on ordinary rerenders, since neither is a route transition worth
distrusting existing authorization over. The epoch is part of the query key
(`["project", projectId, epoch]`), so a bump is a _brand-new_ query — no stale
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

**Update 2026-07-24: UI-4 (PR #44) is merged to `main` as `6976f16`.** UI-5
starts from that commit — see §5D below.

## 5D. UI-5 complete — native React RFI register

### Authoritative mockup refinement — 2026-07-24

This update supersedes the initial inline-editor and five-column descriptions
later in this historical section wherever they conflict. The server/API,
capability, URL-query, changed-only commit, validation, permission-loss, and
optimistic-concurrency contracts remain unchanged.

- Desktop now uses a compact semantic table with RFI, Subject, Status,
  Assigned to, Due, Updated, and an accessible visually unlabeled Actions
  column. Drafts use the shared `Draft` badge and never display "Unnumbered".
- Mobile uses purpose-built two-line cards with relative Updated time, Subject
  and question summary, status, Assigned to, Due, and the same action menu.
- Add RFI and every editable draft use one shared right-side `Drawer`; it is
  full-screen at 760px and below, stacks paired fields below 460px, scrolls
  internally, and retains a safe-area-aware sticky footer with secondary
  `Open` (`file-text`) and `Close`. `Open` first resolves the normal
  changed-only commit path and only then navigates to the workspace; validation,
  403, failed saves, and conflicts retain the Drawer and field feedback.
- `RfiEditorPanel.tsx` is Drawer form content, not an inline row. Field order
  is Subject; Assigned to + Response due; Question; optional Contractor
  recommendation; collapsed Additional information for Drawing and
  Specification references.
- Row primary areas open editable drafts or navigate issued/locked RFIs.
  Draft menus order `Edit details` then `Open RFI`; locked/issued menus expose
  only `Open RFI`. Escape first
  blurs the active control through the existing commit path, then closes and
  restores focus to the opener.
- Shared UI-3 `Drawer`, `Collapsible`, fields/inputs, menus, icons, badges,
  `SaveIndicator`, and state components are reused. Feature code has no direct
  Radix/Lucide imports and no feature-owned SVG, button, badge, or dialog
  system.
- UI Lab now demonstrates navigation and detail Drawer sizes and the shared
  mobile `RegisterToolbar` disclosure. Detail Drawers are
  `clamp(500px, 45vw, 660px)` above 760px and full-width at or below it;
  desktop filters stay inline while mobile keeps Search visible and reveals
  full-width filters with a 44px filter button, active count, and Clear access.
- Evidence capture now uses Chrome DevTools Protocol emulation and asserts the
  requested 390×844 and 430×932 CSS viewports with no horizontal overflow.
  Desktop populated/actions-menu/new/edit/validation/saving/conflict/empty
  states, mobile cards/filter-disclosure/full-screen Drawer/collapsible states,
  and 768/820 tablet Drawers are committed under `docs/evidence/ui-5/`.
- React Router is deliberately migrated to `react-router` 8.3.0 and the retired
  DOM package is removed. `.node-version`, package engines, and CI are pinned
  to Node 22.22.0; `npm audit --audit-level=high` passes with zero
  vulnerabilities. Verification also covers the interaction, shared-component,
  and router-migration regressions.

The remainder of §5D records the initial implementation and review history. It
is retained for auditability; this refinement and the current contracts in
`docs/UX_RFI_SPEC.md`, `docs/UI_IMPLEMENTATION_PLAYBOOK.md`, and
`docs/CURRENT_APPLICATION_STRUCTURE.md` are authoritative.

**Continuation 2026-07-24:** this native RFI composition is the accepted
reference-register pattern. Later registers must compose the shared
`RegisterToolbar` and Drawer primitives through focused feature components;
do not introduce a broad generic `BaseRegister` abstraction. This was the
pre-merge UI-5 handoff; PR #45 subsequently merged to `main` as
`86b11e1bf0a3f1ef9f255d1e5cc872b41516c36d`.

Branch `claude/ui-5-rfi-register-react`, based on merged UI-4 (`6976f16`).
Historical branch record: PR #45 subsequently merged to `main` as
`86b11e1bf0a3f1ef9f255d1e5cc872b41516c36d`.

### Branch stacking and the post-squash rebase (2026-07-24, update)

UI-6A (PR #46) merged into `main` as `0b5ec89` **as a single squash commit**
(GitHub's "Squash and merge"), not a merge commit. That distinction mattered:
this branch had been stacked on UI-6A's pre-merge tip (`6dc61ec`), and a squash
commit has no ancestry relationship to the commits it was squashed from — from
git's point of view, `0b5ec89` is an unrelated commit that happens to touch the
same files. A regular 3-way merge of this branch against the new `main` was
therefore genuinely conflicted (confirmed via `git merge --no-commit`; GitHub
reported `mergeable_state: dirty`), even though the two sets of changes do not
overlap in intent.

The fix was `git rebase --onto origin/main 6dc61ec claude/ui-6b-document-register-evonty`:
replaying only the 5 commits unique to this branch (the diff between `6dc61ec`
and this branch's tip) onto the new `main`, rather than trying to 3-way-merge
full history. That rebase applied with zero conflicts, confirming the two
branches' changes were disjoint all along — the conflict was structural
(squash-vs-merge ancestry), not a real content collision. Verified with
`git merge-base --is-ancestor origin/main <rebased-branch>` (true) before
pushing.

Rebasing also picked up a freshly-flagged high-severity `brace-expansion`
advisory (transitive via `eslint -> minimatch`, devDependency-only, no
production exposure) that postdated this branch's last audit run. Resolved
with the non-breaking `npm audit fix` (not `--force`); one `package-lock.json`
line changed. Full `npm run check` re-run clean after the rebase: 569 unit +
120 Worker integration tests, build, Functions build, 0 vulnerabilities,
secret scan.

`claude/ui-6b-document-register-evonty` was then force-pushed (with
`--force-with-lease`, after confirming no one else had pushed to it) to this
new, rebased history. PR #47 now shows 53 changed files (down from 94) and no
longer carries UI-6A's diff.

### Confirmed starting point

`main` at the start of this phase was `6976f16` ("UI-4: React application
shell and route parity (#44)"), with a clean working tree. No parallel
application shell was created; this phase builds entirely inside the existing
UI-4 `AppLayout`/`routing.ts`/`LegacyFeatureMount` shell.

### Scope delivered

- **Native feature module**, `src/ui/features/rfis/`, separated per the UI-5
  boundary: `types.ts` (read-model types mirroring the unchanged
  `GET /api/v2/projects/:projectId/rfis` envelope), `format.ts` (date/status
  presentation, ported from `public/app-format.js`), `api.ts` (typed
  fetch/mutate calls, no response-shape changes), `useProjectRfis.ts`
  (TanStack Query hook mirroring `useProject.ts`'s 403/404→`missing`,
  retryable-`error` pattern), `urlState.ts` (filter/sort parsing, URL
  serialization, and the exact sort/filter comparison logic ported from
  `public/rfis-view.js`), `editableFields.ts` (the seven-field editor
  configuration and validation), `RfiTable.tsx` (desktop table),
  `RfiEditorPanel.tsx` (expandable editor), `RfiCards.tsx` (mobile cards),
  `RfiRegisterFeature.tsx` (top-level states and wiring), and `rfis.css`
  (feature-local, token-based layout CSS).
- **Route wiring.** `src/ui/app/AppLayout.tsx` now special-cases
  `route.id === "project-rfis"` to render `<RfiRegisterFeature>` directly
  (gated on `project.status === "ready"`, exactly like every other project
  route) instead of `LegacyFeatureMount`. `rfi-workspace`
  (`/projects/:projectId/rfis/:rfiId`) is untouched and still resolves through
  `LegacyFeatureMount` → `public/rfi-workspace-view.js`. `routing.ts`,
  `featureDescriptor`, and the legacy route table are unchanged — this is the
  first canonical route whose content the shell renders natively instead of
  through the compatibility bridge.
- **Preserved five-column desktop hierarchy**: RFI (official
  number/"Unnumbered", status as secondary text, legacy reference,
  issue-repair attention state), Subject (editable-draft button vs.
  locked-row link, question summary, drawing/spec references), Party, Due
  (server-computed overdue/due-soon urgency text), Updated. No Action column,
  no standalone sort dropdown, no RFI-number filter, no whole-row navigation.
  Column-header sorting matches `SORT_KEYS`/`SORT_HEADERS` from
  `rfis-view.js` exactly, including the tie-break-by-id and the
  `~`-sorts-last-for-unnumbered convention.
- **One expandable draft editor**, keyed by row id so only one is ever open,
  built from the shared `Field`/`TextInput`/`TextArea`/`Select`/`DateInput`/
  `ValidationMessage`/`SaveIndicator`/`Button` components: Subject, Party
  (project-contact `<select>`, value = contact id), Requested Response Date,
  Question, Contractor Suggestion, Drawing References, Specification
  References. Local per-field state means no PATCH is issued until a field
  commits; text/date fields commit on blur, the Party select commits
  immediately on selection, Enter blurs (and thus commits) a non-textarea
  control, Enter inserts a newline in a textarea, and an unchanged value never
  calls the API. Escape blurs the focused control (committing any pending
  change through the same path) and then closes the editor, returning focus to
  the Subject trigger button; the Done button does the same. Opening the
  editor always focuses the Subject field (the editor panel only ever mounts
  while open, so a mount-effect focus is exactly "just opened"); a 409
  conflict reloads the row through a `resetSignal` counter that re-derives the
  panel's displayed values from fresh server data **without** remounting (so
  focus/composition in an unrelated field is not disturbed) — matching
  "keep the editor context where practical."
- **Field-level Saving/Saved/Failed/Conflict states**, keyed per
  `rfiId:field`. A 403 during a save shows "You no longer have permission to
  edit this draft." at the affected field. A 409 refetches the register (via
  `queryClient.refetchQueries`), shows "Changed elsewhere. Latest values
  loaded; review and retry." at the affected field, and preserves the current
  URL filters/sort (they live in the URL, untouched by the refetch).
- **Add RFI** (`capabilities.createRfi`-gated) creates one unnumbered draft
  with placeholder Subject/Question via the existing create endpoint, appends
  it to the cached register data, clears incompatible search/status filtering
  (replacing the URL entry, matching the legacy `syncUrl(false)`), opens its
  editor, focuses Subject, and announces the new draft is ready to edit. No
  number is assigned in the browser.
- **URL-backed search/filter/sort** (`q`, `status`, `responsible`, `due`,
  `sort`, `direction`) through `useSearchParams`: typing in Search replaces
  the current history entry; Status/Party/Due changes, header-sort clicks,
  and Clear All each push a new entry — verified by asserting
  `window.history.length` deltas in tests, and restoration via browser Back is
  covered directly.
- **Mobile cards**, rendered unconditionally alongside the desktop table and
  toggled by a `max-width: 640px` media query in `rfis.css` (both exist in the
  DOM simultaneously, exactly like the legacy controller): number/unnumbered
  identity, `RfiStatusBadge`/`AttentionBadge` (or a plain "Needs issue repair"
  badge for the legacy-reconciliation state), Subject, question summary,
  Party, Response Due, Updated, and canonical workspace navigation via
  `AppLink`.
- **Required states**: initial loading (`Skeleton`), populated, first-use
  empty (`EmptyState` variant="first-use", with its own gated Add RFI action),
  filtered empty (`EmptyState` variant="filtered", with Clear All),
  permission/missing (`PermissionState`, for a 403/404 on the RFI list itself
  — distinct from and in addition to the generic project-missing state the
  UI-4 shell already owns), retryable error (`ErrorState`, with the API
  request id when available), creating, saving, saved, validation failure,
  permission loss, and optimistic-concurrency conflict.
- **Shared BASE component adoption**: `PageHeader` (parented under the
  shell's `ProjectHeader` `<h1>`, so `asHeading={false}` — the shell already
  focuses the project-name heading on route change, matching how every other
  project route behaves today), `RegisterToolbar`, `Field`/`Select` (visually
  hidden labels for Status/Party/Due), `Button`, `EmptyState`, `ErrorState`,
  `PermissionState`, `Skeleton`, `SaveIndicator`, `ValidationMessage`,
  `RfiStatusBadge`, `AttentionBadge`, `Badge` (for the legacy-reconciliation
  "Needs issue repair" case, which falls outside the stored-status enum). No
  `FilterChip` was added: the four toolbar controls plus the result count and
  Clear All already communicate active filtering clearly, and the current
  register never had a chips row, so adding one was judged to change the
  established compact layout rather than merely clarify it (`RegisterToolbar`
  and `FilterChip` remain available if a future phase judges otherwise).
- **No Tabulator, no `BaseDataGrid`, no `role="grid"`, no cell/row selection
  state, no arrow-key cell navigation, no Tab save-and-move** — the desktop
  surface is a native semantic `<table>` per the binding UI-5 decision.

### Tests and checks

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **439 unit tests** (+44 over the UI-4 baseline of 395: 33
`rfi-register-react` + 7 `rfi-register-css-parity` + 2
`rfi-register-route-integration` + 2 `rfi-register-tokens`), **119 Worker
integration tests**, the Vite production build (`public/app/app.js` grows
from ~338 kB to ~370 kB, ~114 kB gzip, for the new feature — expected
one-time cost, no further bundle budget work is in this phase's scope),
Pages Functions compilation, `npm audit --audit-level=high` (0
vulnerabilities), and the secret scan (394 tracked files). `npm run
lab:build` passes (no shared component was modified; only consumed).

New/changed suites:

- `tests/unit/rfi-register-react.test.tsx` (33 tests, harness in
  `tests/helpers/rfi-register-harness.tsx`) — five-column hierarchy and no
  Action column; editable-Subject-button vs. locked-Subject-link; explicit
  RFI-identity navigation; ordinary cells never navigate; one editor open at a
  time; focus entering the editor (Subject) and leaving it (Done → trigger,
  Escape → trigger); every editable field present; changed-only commits with
  no per-keystroke PATCH; select-commits-on-change with the contact id;
  date-commits-on-blur; textarea Enter-inserts-newline vs. non-textarea
  Enter-commits; required-field validation blocking the save, with
  `aria-invalid`/linked `aria-describedby` asserted on the field; Saving→Saved
  transition; 403 permission-loss message wired to the field's error slot;
  409 conflict reload + message + updated row, also wired to the field's
  error slot; Add RFI creating a draft, opening its editor, and focusing
  Subject; column-header sort + `aria-sort` + direction toggle; the inactive
  "Updated"/"Subject" headers announcing their correct default next
  direction (descending/ascending respectively); the exact four toolbar
  controls with no sort dropdown; search-replaces/filter-pushes
  history-length deltas; an existing URL hash surviving search, filter, sort,
  and Clear All; an in-progress edit preserving URL filters; filtered-empty
  vs. first-use-empty distinction with Clear All; browser Back restoring a
  prior filter; loading/first-use-empty/permission-denied/
  retryable-error-with-retry states; mobile cards rendered alongside the
  table.
- `tests/unit/rfi-register-css-parity.test.ts` (7 tests) — asserts
  `rfis.css`'s source matches the approved desktop/mobile behavior on `main`:
  the 760px table/cards breakpoint and 900px editor-collapse breakpoint;
  Subject's ink-by-default/accent-on-hover-or-expand color; single-line
  clamp on Subject and the Question summary; ellipsis truncation on
  drawing/spec references; established 168/118/90px widths for Party/Due/
  Updated; and the non-italic, sans-serif "Unnumbered" draft treatment.
- `tests/unit/rfi-register-route-integration.test.tsx` (2 tests) — proves
  `project-rfis` mounts `.rfi-register-page` (the native feature) and never
  invokes the legacy `rfis` feature factory, while `rfi-workspace` still
  mounts through `LegacyFeatureMount` (`[data-feature="rfi-workspace"]`,
  factory called).
- `tests/unit/rfi-register-tokens.test.ts` (2 tests) — `rfis.css` has no raw
  colour literals and references only tokens registered in
  `src/ui/theme/tokens.ts`, mirroring the UI-3 enforcement pattern.
- `tests/unit/base-component-tokens.test.ts`'s existing
  "single-source icon and behavior imports" check already covers the new
  `src/ui/features/rfis/*` files (it walks all of `src/ui`), and continues to
  pass: no direct `lucide-react` or `radix-ui` import outside their one
  allowed location.
- `tests/unit/react-shell-history-parity.test.tsx` — updated, not weakened.
  Its same-route URL-history-parity proof used "rfis" as one of two example
  compatibility-mounted controllers; since the RFI register no longer mounts
  through `LegacyFeatureMount`, every subtest that exercised that path now
  exercises it through `records` (the other, still-legacy controller that
  reads filter/sort state from `window.location.search`) instead, and the
  "destroys the old controller on a genuine path navigation" subtest now
  transitions `records`→`overview`. The proof itself (remount not recreate,
  factory/reload called exactly once across query-only navigations, hash-only
  remounts, destroy on a real path change, Back/Forward across two routes) is
  unchanged and still fully covered.
- `tests/unit/rfi-ui.test.ts` (the legacy `rfis-view.js`/
  `rfi-workspace-view.js` suite) is untouched and still passes — the required
  rollback coverage.

### Evidence

Desktop (1280×900), tablet-gap (700×900 and 820×900), and mobile (500×900,
see capture-tooling note) captures generated from the real shell
(`AppLayout`/`RfiRegisterFeature`, mocked session/project/RFI fetch) via a
dev-only evidence harness (`src/ui/app/evidence/harness.tsx` +
`vite.evidence.config.ts`, extended for UI-5 with RFI fixtures/fetch mocking
and a `rfiScenario` query param that scripts interactive states — open
editor, saving, validation error, conflict — through real DOM events, so a
single deterministic screenshot suffices) and a capture script,
`scripts/capture-ui5-evidence.mjs`, committed at `docs/evidence/ui-5/`:

- `rfi-register-desktop-populated.png` — table with an unnumbered due-soon
  draft, a locked/issued overdue row, a locked/closed row, and a
  deliberately long-text row (long Subject, Question summary, combined
  drawing/spec references, and Party/company name) demonstrating the
  single-line clamp and ellipsis truncation together.
- `rfi-register-desktop-editor-open.png` — the expandable editor open with
  every field, focus ring on Subject, two-column layout at desktop width.
- `rfi-register-desktop-validation-error.png` — empty Subject blurred,
  "Subject is required." shown inline via the field's own error slot
  (`aria-invalid`/`aria-describedby` wired through `Field`), no save issued.
- `rfi-register-desktop-saving.png` — an in-flight "Saving…" indicator
  (PATCH held open by the harness's `rfiPatchMode=slow`).
- `rfi-register-desktop-conflict.png` — "Changed elsewhere. Latest values
  loaded; review and retry." with the row already showing the reloaded
  server value.
- `rfi-register-desktop-filtered-empty.png` — a status filter with zero
  matches, "No RFIs match these filters." plus Clear All.
- `rfi-register-desktop-first-use-empty.png` — zero RFIs at all, "No RFIs
  yet."
- `rfi-register-mobile-cards.png` — dedicated cards, not a compressed table.
- `rfi-register-tablet-700-table.png` — the 641–760px gap: cards already
  active at 700px (below the 760px table/cards breakpoint), matching current
  `main` rather than the desktop table this range regressed to before the
  PR #45 review correction pass (see below).
- `rfi-register-tablet-820-editor-open.png` — the 761–900px gap: the desktop
  table still active at 820px (above 760px) with the expandable editor
  collapsed to one column (at/under the 900px editor breakpoint) — the
  specific combination the review flagged as untested.

**Capture-tooling note:** this environment has no `playwright-core` install
and no pre-installed Chromium (unlike the Linux sandbox UI-3/UI-4 evidence was
captured in); the local Windows Chrome install is driven directly through its
headless CLI (`--headless=new --virtual-time-budget=…`) via `execFile`
(async — `execFileSync` would block the same process's own local static
server, a same-process deadlock discovered and fixed during this phase).
Chrome's `--window-size` does not honor widths requested below roughly 500 CSS
px on this machine regardless of headless mode: an `innerWidth`/`scrollWidth`
readout injected during debugging confirmed `window.innerWidth` reports 500 at
requested widths from 280–390px alike, and — importantly — that
`scrollWidth === innerWidth === 500` at that floor, i.e. the page has no
horizontal overflow at its real rendered width. Requesting a narrower
screenshot canvas than that floor (e.g. 390px) does not produce a narrower
layout; it produces a **cropped** capture of the 500px layout, which looked
like truncated/cut-off content but was a capture artifact, not a product bug.
The mobile capture above is therefore taken at 500px (matching the real
floor) rather than a misleadingly cropped 390px. A true sub-500px capture
could not be produced in this environment and should be spot-checked on a
real device or a browser-automation tool with reliable small-viewport
support.

### PR #45 review correction pass (2026-07-24)

The first round of review on PR #45 found five issues, all fixed on the same
branch:

1. **URL hash loss.** `updateFilters` used `useSearchParams`'s setter, which
   calls `navigate("?" + params)` internally and drops any existing hash.
   Fixed by reading `useLocation`/`useNavigate` directly and passing an
   explicit `{ pathname, search, hash }` location object, preserving
   `location.hash` through search, filter, sort, and Clear All changes. New
   test: "preserves an existing URL hash through search, filter, sort, and
   Clear all".
2. **Field errors not wired to `Field.error`.** `RfiEditorPanel` rendered a
   standalone `ValidationMessage` instead of passing the failure message to
   `Field`'s `error` prop, so controls never got `aria-invalid`/
   `aria-describedby`. Fixed by passing `error={failure?.message}` to `Field`
   and keeping only `SaveIndicator` in the separate save-state slot. New
   assertions on the validation/403/409 tests confirm `aria-invalid="true"`
   and a linked, populated `aria-describedby` target.
3. **Responsive breakpoints diverged from `main`.** The table/cards switch
   was at 640px and the editor stayed two-column until 640px, instead of
   matching `public/app-shell.css`'s approved 760px (table/cards) and 900px
   (editor collapse). Fixed by changing both breakpoints in `rfis.css` to
   760px/900px; added `rfi-register-tablet-700-table.png` and
   `rfi-register-tablet-820-editor-open.png` evidence for the previously
   untested 641–900px gap.
4. **Table hierarchy didn't match `main`.** Subject rendered in accent color
   by default instead of ink-until-hover/expanded, had no single-line clamp
   (Subject/Question) or ellipsis truncation (references), Party/Due/Updated
   had no established fixed widths, and "Unnumbered" rendered
   italic/monospace instead of the plain sans treatment. Fixed by porting
   the corresponding rules from `public/app-shell.css`'s `.rfi-*` block into
   `rfis.css` (`table-layout: fixed` with 128/168/118/90px columns,
   `-webkit-line-clamp: 1` on Subject/Question, `text-overflow: ellipsis` on
   references, ink-colored Subject with accent only on
   hover/`aria-expanded`, sans/medium-weight "Unnumbered"). Added
   `tests/unit/rfi-register-css-parity.test.ts` asserting these rules by
   reading the CSS source, plus a long-text fixture row in both the unit
   fixtures and the evidence harness to make the truncation visible in
   captures.
5. **Inactive "Updated" header announced the wrong next direction.** Every
   inactive header always said "ascending" was next, but `Updated`'s default
   direction is descending. Fixed by deriving the inactive label from
   `SORT_KEYS[sortKey].defaultDir` in `RfiTable.tsx`. New test asserts the
   inactive `Updated` header's `aria-label` is
   `"Sort by Updated, descending"` and the inactive `Subject` header's is
   `"Sort by Subject, ascending"`.

All five fixes are covered by new or extended tests (see "Testing" above);
`npm run check` was re-run clean afterward.

### Known limitations

- The RFI workspace route is unchanged and stays compatibility-mounted
  through UI-7, per binding scope.
- No `FilterChip` row was added (see "Shared BASE component adoption" above);
  revisit only if a later product decision wants active-filter chips.
- Mobile evidence was captured at ~500px, not a true ~390px phone width, due
  to a local Chrome headless-CLI limitation in this environment (see the
  capture-tooling note above) — confirmed to be a capture-tooling floor, not
  a product overflow bug, via an `innerWidth`/`scrollWidth` readout showing
  zero horizontal overflow at that width. The responsive CSS is written to be
  robust at narrower widths, but this was not independently confirmed by a
  real capture below 500px in this session.
- No live Cloudflare Pages preview was checked directly from this session
  beyond the review round's own report that it deployed successfully.
- `public/rfis-view.js`, `public/rfi-workspace-view.js`, and
  `tests/unit/rfi-ui.test.ts` are retained unchanged as rollback/reference
  coverage, per binding scope; their removal remains a later cleanup-phase
  decision, not this phase's.

### UI-5 closeout recommendation (historical)

UI-5 was reviewed and merged as PR #45. Its former combined UI-6 follow-up has
now been split into UI-6A Projects and UI-6B Document Register below.

## 5E. UI-6A complete — native React Projects register

UI-5 and PR #45 are merged to `main` as
`86b11e1bf0a3f1ef9f255d1e5cc872b41516c36d`. UI-6A replaces the
`/projects` compatibility mount with `ProjectsRegisterFeature`; the legacy
`public/projects-view.js` and `public/project-form.js` modules and their tests
remain intact as the rollback path.

The native feature uses the shared `RegisterPage`, `PageHeader`,
`RegisterToolbar`, `FilterChip`, `FormDialog`, field primitives, async states,
tokens, and responsive breakpoint. It provides a four-column semantic desktop
table and dedicated mobile cards, canonical Overview links, safe row
navigation, deterministic active/number/name/ID ordering, URL-backed `q` and
`status` state, mobile filter disclosure, distinct first-use/filtered empty
states, retry/request-ID handling, and the native Create Project workflow. It
does not use Tabulator, `BaseDataGrid`, `role="grid"`, a redundant Actions/Open
column, or role-name authorization inference.

`GET /api/v2/projects` keeps its existing `data` array unchanged and adds
`meta.capabilities.createProject`, derived on the server from
`canCreateProjects`. This is backwards-compatible for existing consumers while
making the current create policy authoritative for React presentation.

Focused UI, route, contract, API integration, status-vocabulary, create,
history, accessibility, and rollback coverage was added. Deterministic evidence
for populated, filtered, Create dialog, mobile cards, collapsed/expanded mobile
filters, first-use empty, filtered empty, and error states is committed under
`docs/evidence/ui-6a/`.

### Next recommended action

Complete. UI-6A merged to `main` as `0b5ec89` (PR #46, squash), followed by
UI-6B as `315de55` (PR #47). The stacking instructions previously recorded here
are closed history.

## 5F. UI-6B complete — native React Document Register

**Merged 2026-07-24: PR #47 squash-merged to `main` as `315de55`.** Everything
below about branch stacking, the still-open UI-6A PR, and the post-squash
rebase is retained as the phase's audit record; none of it is an active
condition.

### Branch stacking (historical — resolved by the UI-6A and UI-6B merges)

UI-6B was specified to start from a `main` containing UI-6A. When this phase
began, `main` was at `86b11e1` (UI-5) and **UI-6A's PR #46 was open, not
merged**. UI-6B therefore branches from `agent/ui-6a-projects-register-react`,
not from `main`.

Why: UI-6A modifies ten files UI-6B must also modify — `AppLayout.tsx`,
`src/ui/app/evidence/harness.tsx`, `src/http/api-response.ts`,
`src/ui/components/index.ts`, `icons/Icon.tsx`,
`tests/helpers/react-shell-harness.tsx`, and four tracker/structure documents.
Branching from `main` would have produced guaranteed conflicts with PR #46 and
forced UI-6B to re-derive UI-6A work that is explicitly out of its scope.

Consequences for review: until PR #46 merges, this PR's diff against `main`
contains UI-6A's commits as well as UI-6B's. Review and merge UI-6A first, then
UI-6B. UI-6B changes no Projects code.

### Confirmed starting point

`main` contains the native UI-5 RFI register, the shared mobile
`RegisterToolbar` filter disclosure, and the shared `Drawer size="detail"`
contract. The native UI-6A Projects register, the native Create Project
workflow, the server-derived Projects create capability, and UI-6A's review
fixes are present on the branch UI-6B builds on, not yet on `main`.

### Scope delivered

Only `/projects/:projectId/records` and the Add Document workflow launched from
it move to native React. `/projects/:projectId/records/:recordId`,
`.../revisions/:revisionId`, revision publishing and issuance routes, and every
detail workspace stay compatibility-mounted until UI-7.

- **Route ownership.** `AppLayout` renders `RecordsRegisterFeature` for route id
  `project-records`, after the shell has confirmed project access. The project
  header and Documents tab remain shell-owned, and the register adds no second
  `<h1>` (`PageHeader asHeading={false}`, the UI-5 hierarchy).
- **Terminology.** The route heading is **Document Register** and the project
  tab stays **Documents**. Backend domain terminology is unchanged: no API
  route, database entity, domain type, service, or repository was renamed. The
  UI keeps Record (document identity), Revision (version), File (uploaded
  content), and Issuance (distribution) visibly distinct.
- **Desktop table.** A native semantic `<table>` with exactly six columns —
  Document, Type, Discipline, Revision, Files, Updated. No Tabulator,
  `BaseDataGrid`, `role="grid"`, spreadsheet selection or keyboard model,
  pinned columns, cell editing, or redundant Actions/Open column.
- **Identity correctness.** Only the server's authoritative `currentRevision`
  is presented as current; `hasDraftRevision` drives a separate "Draft in
  progress" indication and a draft never occupies the Revision value. The
  revision number is always represented (`Original`, `Rev 1`, …) even when a
  human revision label exists. Absent current revision reads "No revision".
  `fileCount` is shown exactly as returned. A legacy Record with no
  server-generated number reads "No record number" rather than borrowing an id.
  Database UUIDs are never user-facing identity.
- **Mobile.** Dedicated cards (not a compressed table) at the shared 760px
  breakpoint, each a single canonical Record-workspace link containing no
  nested interactive controls. Search stays visible; the remaining controls sit
  behind the shared filter-icon disclosure, whose count reflects active filters
  only, never the search query.
- **URL state.** `q`, `type`, `discipline`, `revisionStatus`, `archived`,
  `sort`, `direction` are preserved with their existing names, defaults, and
  semantics: search replaces history, filters and sort push, Back/Forward and
  copied URLs restore the same view, unrelated query state and the hash
  survive, and invalid values normalize without inventing an option.
- **Filters and sort.** Type, discipline, and revision-status options are
  derived only from values present in the authorized response, plus the factual
  "No revision" condition. Archived visibility keeps Active only (default),
  Include archived, and Archived only. Sort keeps Newest, Recently updated,
  Title A–Z, Record number, and Type with their existing default directions and
  the deterministic id tie-break. Clear resets search and filters, keeps the
  selected sort/direction, pushes history, and announces.
- **States.** Initial loading, background refreshing, populated, first-use
  empty, filtered empty, no-active-Records-while-archived-exist (offered as a
  distinct path to include archived, never as first use), missing/permission,
  retryable error with request ID, and create-capability-absent.
- **Add Document.** Native React in the shared `Drawer size="detail"`, keeping
  the two real entry choices (upload a document, reserve a document identity).
  No template/library choice is offered, because no persisted project-document
  template relationship exists in the current domain.

### Add Document staged creation and recovery

The existing staged server workflow is preserved exactly:

1. `POST .../records` — create the Record;
2. `POST .../records/:recordId/revisions` — create the initial draft Revision;
3. `POST .../revisions/:revisionId/files` — upload the file (upload mode only);
4. navigate only after every required stage is confirmed.

Nothing is inserted into the register optimistically, and the browser never
supplies a Record number — the server generates it.

Completed stages are held in the workflow's `progress` state, so a retry
resumes at the failed stage and never creates a duplicate Record or Revision:

- **Record create fails** — the server message and request ID are shown; the
  workflow does not claim partial success and nothing was created.
- **Draft Revision fails after the Record succeeded** — the message states the
  document identity exists (naming it when the server returned a number), shows
  the request ID, and offers a link to open the usable Record. The primary
  action becomes _Retry draft revision_ and re-attempts only that stage.
- **Upload fails after Record and Revision succeeded** — the message states
  both exist, preserves the selected file name, shows the request ID, and links
  to the draft Revision workspace. The primary action becomes _Retry upload_.

On success the workflow announces creation, invalidates the Records query so it
refetches confirmed server data (browser Back cannot then omit the new
document), closes the Drawer, and navigates to
`/projects/:projectId/records/:recordId/revisions/:revisionId`.

### API and capability decisions

`GET /api/v2/projects/:projectId/records` is **unchanged**. It already returns
`{ records, capabilities: { createRecord } }` inside `data`, with per-record
capabilities and the authoritative `currentRevision` relationship, so UI-6B
needed no endpoint, response-shape, or read-model change. The register requests
the whole authorized set once with `includeArchived=true` — exactly as
`public/records-view.js` did — and the browser only searches, filters, and
sorts within that already-authorized response. Tenant and project authorization
remain entirely server-side; the Add document action is gated solely on the
server-derived `createRecord` capability, never on a role name.

### Data and query architecture

`src/ui/features/records/` holds `RecordsRegisterFeature.tsx`,
`RecordsTable.tsx`, `RecordsCards.tsx`, `AddDocumentDrawer.tsx`, `api.ts`,
`types.ts`, `urlState.ts`, `format.ts`, `useProjectRecords.ts`, and
`records.css`. Server state uses TanStack Query with the key
`["project-records", projectId]`, so a route change never shows another
project's documents. The feature-local typed request pattern matches UI-5 and
UI-6A; no third API architecture was introduced, and no configurable
`BaseRegister` abstraction was added.

### Shared component changes

- `Drawer` gained `initialFocusRef` and `closeLabel`. Both are additive with
  unchanged defaults, so navigation Drawers and the UI-5 RFI Drawer behave
  exactly as before. They exist because a staged workflow must focus its first
  choice/field rather than the close button, and must name its close control.
  Demonstrated in the UI Lab and covered by shared component tests.
- The shared mobile filter disclosure now wraps when a register has more filter
  controls than fit one phone row. UI-5 (three filters) and UI-6A (one) already
  fit and are visually unchanged.

Feature CSS owns composition and layout only. It defines no focus rings, no
button/input/badge appearance, no Drawer or dialog geometry, no global table
styles, and no raw colour literals; every custom property it references is in
the registered application token set.

### Legacy rollback modules

`public/records-view.js` and `public/add-document-form.js` remain in the
repository with their tests intact. They are no longer mounted on the migrated
register route. Record and Revision detail routes continue to use the
compatibility bridge, so `LegacyFeatureMount` is still live.

### Tests and checks

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **569 unit tests**, **120 Worker integration tests**, the Vite
production build, static asset verification, Pages Functions compilation,
`npm audit --audit-level=high` (0 vulnerabilities, `--force` not used), and the
secret scan (461 tracked files). `npm run lab:build` passes.

UI-6B adds 72 unit tests across three suites — 51 `records-register-react`,
4 `records-register-route-integration`, and 17 `records-register-contract` —
plus 2 shared `Drawer` tests. UI-5 RFI and UI-6A Projects suites continue to
pass unchanged after the shared component edits.

Three UI-4 shell suites previously used `/projects/p1/records` as their example
compatibility-mounted route. Because that route is now native, they were
repointed at routes that are still compatibility-mounted — `record-detail` for
URL-history parity and project revalidation, `overview` for module-load
resilience. This is the same adjustment UI-6A made when `/projects` went
native; no assertion was weakened.

### Evidence

Sixteen deterministic captures are committed under `docs/evidence/ui-6b/`,
produced by `npm run evidence:ui6b` through the shared evidence harness using
production components and an authorized fixture — no static mock markup.
Desktop populated, multi-filter, archived included, Add Document choice, Add
Document upload mode, and partial-success recovery; first-use empty,
no-active-but-archived, filtered empty, and error; tablet 834px; mobile 390px
cards, search with filters collapsed, filter panel expanded with active
filters, full-screen Add Document, and 360px cards. Every capture asserts its
CSS viewport and fails if the page overflows horizontally.

Each capture waits for a selector that only exists once the documented state
has rendered, rather than sleeping for a fixed budget, so a slow machine
produces the same screenshot instead of a loading skeleton.

### Bundle impact

`public/app/app.js` grows from ~460 kB (~141 kB gzip) to ~485 kB (~147 kB
gzip) and `app.css` from ~45 kB (~7.0 kB gzip) to ~52 kB (~7.6 kB gzip),
measured against the UI-6A branch this one is stacked on. Expected cost for a
new native feature; a bundle budget remains UI-10 scope.

### Known limitations

- Record and Revision detail routes are **not** native. They remain
  compatibility-mounted until UI-7, and this PR must not be read as migrating
  them.
- UI-6A is not merged, so this branch is stacked (see above).
- Evidence is captured against a mocked session/project fixture; this session
  had no authenticated Cloudflare Access session, so no authenticated smoke
  test was performed here.
- Sorting is chosen through the toolbar control, matching the legacy Records
  register. Column-header sorting (as UI-5 uses) was deliberately not
  introduced, since the existing Records URL state has no header-sort contract.
- An unknown legacy discipline or record type stored before the controlled
  vocabularies still renders verbatim, by the existing compatibility contract.

### Rollback procedure

1. Revert this PR's merge commit. The compatibility bridge, the legacy Records
   route mount, `public/records-view.js`, `public/add-document-form.js`, and
   their tests are all still present, so `/projects/:projectId/records` returns
   to the legacy controller with no data migration and no API change.
2. If only the native register must be disabled without a full revert, remove
   the `route.id === "project-records"` branch in `src/ui/app/AppLayout.tsx`;
   the route then falls through to `featureDescriptor` and mounts the legacy
   `records` controller exactly as before UI-6B.
3. No database, storage, `/api/v2` contract, renderer, or controlled-document
   definition change is involved in either path.

### Next recommended action

Complete. UI-6B merged to `main` as `315de55` (PR #47). UI-7 followed and is
also merged (`509d5bb`, PR #48) — see §5G. The active work is **RFI Slice 2B**;
see §5I and §8.

## 5G. UI-7 complete — native React detail workspaces

**Merged to `main` as `509d5bb` (PR #48).** The section below is the closed-out
record of that phase; it is history, not active work.

### Confirmed starting point

`main` contained every register phase — the native RFI register (UI-5,
`86b11e1`), the native Projects register and Create Project workflow (UI-6A,
`0b5ec89`), and the native Document Register and Add Document workflow (UI-6B,
`315de55`) — plus the shared `Drawer size="detail"`
(`initialFocusRef`/`closeLabel`), the shared mobile `RegisterToolbar` filter
disclosure, and the retained legacy rollback modules. The working tree was
clean, no pull requests were open, and the first commit on this branch is the
documentation correction that recorded UI-6B as merged.

### Scope delivered

Only the three detail routes move to native React:

- `/projects/:projectId/records/:recordId` → `RecordWorkspaceFeature`
- `/projects/:projectId/records/:recordId/revisions/:revisionId` →
  `RevisionWorkspaceFeature`
- `/projects/:projectId/rfis/:rfiId` → `RfiWorkspaceFeature`

`AppLayout.tsx` gained three `route.id` branches, each keyed by the full
identity in the path. `routing.ts`, the route table, and every
`featureDescriptor` entry are unchanged, so the rollback path is intact. No
endpoint, response shape, capability, numbering rule, lifecycle rule, D1/R2
ownership, or renderer behaviour changed.

**One shared workspace pattern.** `WorkspacePage` +`WorkspaceNotice`
(`src/ui/components/patterns/WorkspacePage.tsx`) is the detail-route
counterpart to `RegisterPage`, owning the binding hierarchy from
`APP_UI_FOUNDATION.md` §5.2 exactly once — breadcrumbs, identity header with one
primary action plus overflow, lifecycle notice, metadata strip, current-work
body, and secondary history/activity — and rendering exactly one of
loading/ready/missing/error. Three supporting shared-component changes came with
it: `WorkspaceSection` gained an optional `headingLevel` (so workspace sections
are `h3` under the identity `h2` and the shell keeps the only `h1`),
`ButtonLink` was added so a download or destination keeps real anchor semantics,
and `useReturnFocus` centralises focus restoration for overlays opened
programmatically rather than from a Radix trigger. Following the UI-5
precedent, no broad generic abstraction was introduced: each workspace is a
focused feature composing shared primitives.

**Domain differences preserved.**

- _Record_: record facts in the metadata strip, revision facts in the revision
  panels — never one unlabeled list. A draft is **Current work**; the
  authoritative published version keeps its own **Current version** panel
  alongside it, so a draft can never be the only version on screen. Multiple
  drafts are listed rather than reduced to one.
- _Revision_: the exact version, its status, and whether it is current are all
  stated; published and superseded versions say they are immutable; an archived
  document's notice takes precedence over the revision's own.
- _RFI_: the authoritative structured content is the current work, the response
  is its own section and is never merged into the question, attachments carry an
  explicit role and their exact draft revision, and the template-bound document
  view is read-only and rendered on demand.

**Official actions are not saves.** Publish, Archive, Close, Reopen, and Void
all go through an explicit confirmation (`AlertDialog`, `official`/`danger`
treatment), send nothing before confirmation, and claim success only after the
server confirms. Publish is offered only when the server says
`publishRevision` _and_ the draft has a file; otherwise the requirement is
explained rather than presented as a disabled control.

**Slice 2A contract integration.** UI-7 retains no full issuance dialog or
mark-ready surface. It reads `officialIssue` only as the immutable
`RfiOfficialIssueSummary` for original-issue evidence, including the authorized
official-PDF download after reload. Current state and actions always come from
top-level `rfi.status` and top-level `capabilities`; `returnToDraft` therefore
offers a confirmed **Return to draft** action only for an authorized unnumbered
ready RFI. A legacy RFI that consumed a number without complete issuance is
still labelled "Needs issue repair" and is not presented as officially issued.

**Concurrency and staged work.** RFI draft saves carry the server's
`lockVersion`; a `409` reloads the authoritative values, re-seeds the editor,
and asks for a deliberate retry rather than overwriting. Both upload paths (a
revision file and an RFI attachment) refetch their workspace _before_ offering a
retry, so the list on screen is confirmed server truth and a repeat attempt
cannot silently attach a second copy — the UI-6B staged-confirmation rule
applied to a single-stage sequence.

### API and capability decisions

No API change was required or made. Every action is gated on an existing
server-derived capability: `updateRecord`, `archiveRecord`, `createRevision`,
per-revision `uploadFile`/`publishRevision`, and the RFI `updateDraft`,
`uploadAttachment`, `returnToDraft`, `recordResponse`, `close`, `reopen`,
`void`. Nothing is
inferred from a role string. `returnForClarification` is implemented and
returned by the server but had no browser surface before UI-7 and deliberately
still has none — enabling a previously unreachable transition is a product
decision for the RFI Slice 3 phase that owns response/close/clarification, not a
migration phase.

### Shared component changes

- **New:** `WorkspacePage`, `WorkspaceNotice`, `ButtonLink`, `useReturnFocus`.
- **Changed:** `WorkspaceSection` (optional `headingLevel`/`headingId`, default
  unchanged); `createRendererPreviewAdapter` (optional `fill`, default `false`,
  so the existing contract and its test are unchanged).
- No new global button, badge, dialog, field, or focus system; no raw colour
  literals; no direct Radix or Lucide imports in feature code — all enforced by
  the existing token suite.

### Tests and checks

UI-7 adds **151 unit tests** across six suites:

- `record-workspace-react` (21) — hierarchy, identity discipline, files,
  capabilities, archived lifecycle, publish confirmation and failure, the three
  record workflows, and every async state;
- `revision-workspace-react` (17) — exact revision context, immutability
  notices, upload including the server-reconciled failure path, publish gating
  and conflict, async states;
- `rfi-workspace-react` (33) — hierarchy, numbering honesty, lockVersion
  concurrency and 403/409 handling, read-only content, role-explicit
  attachments, response separation, lifecycle transitions, immutable original
  issue/PDF evidence, Return to draft confirmation, document view, activity
  safety, async states;
- `workspace-route-integration` (9) — native mount for all three routes, no
  legacy factory load, one shell-owned `h1`, correct descendant tab,
  project-readiness gating, generic project not-found, and the retained rollback
  descriptors;
- `workspace-accessibility` (12) — heading outline, breadcrumb labelling, named
  icon-only controls, textual status, field/error association, keyboard menu and
  dialog operation with focus restoration, and live announcements;
- `workspace-format-parity` (66) — every ported label (media type, activity,
  RFI field, attachment role, number label, actor, activity detail) and the file
  size formatter compared against `public/app-format.js` and the legacy detail
  views, so the ported vocabulary cannot drift.

Four existing shell suites were updated because their fixture route
(`record-detail`) is no longer compatibility-mounted; they now exercise the same
behaviour through `project-overview`/`dashboard`, or assert the native
workspace. The legacy rollback suites (`record-detail-ui`, `revision-detail-ui`,
`rfi-ui`) are unchanged and still green.

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **720 unit tests**, **120 Worker integration tests**, the Vite
production build, static-asset verification, Pages Functions compilation,
`npm audit --audit-level=high` (0 vulnerabilities), and the secret scan.

### Evidence

`scripts/capture-ui7-evidence.mjs` (`npm run evidence:ui7`) drives the real
workspaces through the shared evidence harness — production components only, no
static mock markup — and captures 30 deterministic states across 1280, 834,
430, and 390 px CSS viewports: current version, draft-plus-current, no original,
archived read-only, edit/create/archive dialogs, record error; draft upload,
publish confirmation, upload-failure recovery, published read-only, empty draft,
mobile; RFI draft editor, issued original-issue evidence/PDF, Return to draft
confirmation, recorded response, legacy reconciliation, void confirmation,
validation error, document view, error, tablet and mobile. Each capture
asserts its CSS viewport and fails on horizontal overflow.

**No screenshots were produced in this session.** This machine has no
Chrome/Chromium binary (`CHROME_PATH` unset and none of the candidate paths
exist), so the capture script cannot run here; the evidence bundle itself builds
successfully (`vite build --config vite.evidence.config.ts`). Run
`npm run evidence:ui7` on a machine with Chrome to populate
`docs/evidence/ui-7/`.

### Bundle impact

`public/app/app.js` grows from ~485 kB (~147 kB gzip) to ~543 kB (~159 kB
gzip) and `app.css` from ~52 kB (~7.6 kB gzip) to ~61 kB (~8.5 kB gzip): three
feature modules, their dialogs, and the shared workspace pattern. The three
legacy controllers they replace are no longer fetched at runtime on these
routes, but they remain served for rollback, so this is a net application-bundle
increase. A bundle/performance budget and route-level code splitting remain
UI-10 scope.

### Known limitations

- **No screenshots yet** (above). `docs/evidence/ui-7/` is empty until the
  capture runs on a machine with a browser.
- **The controlled renderer is not loaded in the authenticated application**, so
  the RFI document view reports itself unavailable. This is unchanged from the
  legacy workspace — `public/index.html` has never loaded `engine.js`, by the
  deliberate UI-2 CSS boundary — and loading a scoped renderer bundle is a later
  decision, not UI-7 scope.
- **`returnForClarification` remains without a browser surface** (see above).
- **No full issuance dialog is included.** Slice 2A's server contract and its
  persisted official evidence are integrated; the multi-field issue workflow is
  a later dedicated UI slice.
- **`revision-issue`, `issuance-detail`, `issuance-created`, and
  `project-team`** still resolve to the shell's placeholder route; they are
  UI-8 scope.
- **No authenticated browser smoke** was possible in this session (no Cloudflare
  Access session available); the product-owner checklist below is prepared for
  whoever has one.
- **No pixel-baseline visual-regression harness** yet — still UI-10.

### Product-owner authenticated smoke checklist

- Open a document with a published current version: confirm the identity header,
  metadata strip, current-version panel with its file, and version history.
- Open a document that also has a draft: confirm the draft appears as **Current
  work** _and_ the published version keeps its own panel.
- Edit document details, create a draft revision, and archive a document:
  confirm each dialog's focus behaviour and that the register reflects the
  change after returning.
- On a draft revision: upload a file, then publish it through the confirmation;
  confirm the register and record workspace both show the new current version.
- On an RFI draft: edit and save, then reproduce a conflict by editing the same
  RFI in a second tab; confirm the "Changed elsewhere" recovery reloads the
  latest values.
- On an issued RFI: confirm content is read-only, the response section is
  separate from the question, the immutable Original Issue evidence and PDF
  download persist after reload, and current status/actions follow top-level
  state rather than that evidence.
- On an authorized ready RFI: confirm Return to draft requires confirmation,
  returns to editable draft only after server confirmation, and is absent when
  the capability is absent.
- Mobile (390 px): confirm each workspace reflows without horizontal scrolling
  and primary actions stay reachable.
- Keyboard: operate the overflow menus and confirmations end to end and confirm
  focus returns to the control that opened them.

### Rollback procedure

1. Revert this branch's merge commit. `public/record-detail-view.js`,
   `public/record-detail-dialogs.js`, `public/revision-detail-view.js`,
   `public/rfi-workspace-view.js`, `public/rfi-template-preview.js`, their tests,
   and their `featureDescriptor` entries are all still present, so the three
   routes return to their legacy controllers with no data migration and no API
   change.
2. To disable one workspace without a full revert, remove its `route.id` branch
   in `src/ui/app/AppLayout.tsx`; the route then falls through to
   `featureDescriptor` and mounts the legacy controller exactly as before UI-7.
3. No database, storage, `/api/v2` contract, renderer, or controlled-document
   definition change is involved in either path.

### Next recommended action

Review UI-7 and run `npm run evidence:ui7` plus the authenticated smoke
checklist above. Do not merge without explicit approval. **UI-8 — Dashboard,
Project Overview, remaining forms, Team, and Administration** is the next phase;
its prompt is in `UI_AGENT_PROMPTS.md`.

## 5H. UI-7 correction — RFI workspace layout (rail pattern)

Same branch (`claude/ui-7-detail-workspaces`), same draft PR #48. This is a
visual-review correction to §5G's delivery, not a new phase: no route, API,
capability, or lifecycle rule changed.

### What was wrong

The native RFI workspace rendered as one full-width vertical form under a
sparse full-width metadata strip — technically the §5G pattern, but a
regression in information architecture against the legacy workspace's
constrained main column plus compact context rail. On a wide desktop the
overflow-actions button also sat detached at the far edge of the page, and an
expandable "Document view" control could be opened only to reveal that the
document view is unavailable — a dead end, not a feature.

### What changed

**`WorkspacePage` gained an opt-in `layout="rail"` mode**
(`src/ui/components/patterns/WorkspacePage.tsx`), used only by the RFI
workspace. `layout="stacked"` (the default) is byte-for-byte what §5G shipped,
so the Record and Revision workspaces are unchanged. In rail mode:

- breadcrumbs and the identity header stay full width, but the whole
  workspace container is now width-capped (`.base-workspace--rail`), which is
  what keeps the overflow-actions button near the title instead of stranded at
  the edge of a wide viewport;
- below the header, `notice` and `metadata` — the same props Record/Revision
  already pass — move into a `.base-workspace__rail-top` column instead of a
  full-width strip, sized to roughly 300–360px;
- `children` (RFI content, files, response) sit in a `.base-workspace__body`
  column capped at 720px, so text inputs and textareas no longer stretch
  across the full desktop;
- `secondary` (activity) stays in the same rail column, below rail-top, but
  deliberately **not** sticky — only the compact facts+notice block is sticky
  on desktop (`min-width:961px`), so a long activity feed can never be pinned
  partly off-screen;
- at ≤960px the grid collapses to one column in the same DOM order used at
  every width — notice, metadata, content, files, response, then activity —
  so mobile reading order never had to change, only which facts sit beside
  the work on a wide screen.

No new props were added to the Record or Revision workspace call sites, and no
existing `WorkspacePage` prop changed meaning.

**Document view no longer offers a dead-end control.**
`RfiTemplatePreview.tsx` exports `templatePreviewAvailable(data)`; when the
controlled renderer runtime is not present (unchanged from §5G — the
authenticated app has never loaded it), `RfiWorkspaceFeature` renders the
restrained "unavailable" sentence directly, with no "Show document view"
toggle to click through to the same sentence. The interactive `Collapsible` +
`RfiTemplatePreview` pair still renders exactly as before whenever a renderer
runtime **is** present.

**Fact-location rule, unchanged in substance, now proven against the rail.**
While the RFI is an editable draft, Assigned to and Response due stay only in
the editor; once read-only, they move into `.base-workspace__rail-top` — the
same rule §5G shipped, now asserted against the rail's own container rather
than only against `.base-workspace__metadata` in isolation.

**`ButtonLink` modifier-click correction.** Four in-app navigation call sites
in `RecordWorkspaceFeature.tsx` (`Open draft revision` / `View current
version` / `Open revision` / the empty-state upload CTA) called
`event.preventDefault()` unconditionally before routing through
`shell.navigate`, which broke ctrl/cmd/shift/alt-click and middle-click —
those must open a new tab, not be hijacked into the current one. Fixed with a
shared `isPlainLeftClick(event)` guard
(`src/ui/components/util/isPlainLeftClick.ts`, also adopted by `AppLink`,
which already had the correct guard inline): the four sites now call
`preventDefault`/`navigate` only for an unmodified left click, matching
`AppLink`'s existing contract. `ButtonLink` itself (the primitive) was already
a real anchor with no `onClick` of its own — the bug was only in how these
four call sites used it, not in the primitive.

### Evidence and tests added

`scripts/capture-ui7-evidence.mjs` grew from 27 to 30 captures: a new
`rfiWorkspaceFixture=long` fixture (a multi-line subject, a three-paragraph
question, and an eight-event activity list) captured at 1280px and 390px to
stress-test the constrained main column and the non-sticky activity rail
under worst-case content, and the `document-view` capture was renamed to
`rfi-workspace-desktop-document-view-unavailable.png` with its scenario
updated to assert no toggle is rendered at all (previously it clicked a
toggle that no longer exists in the unavailable state). Slice 2A integration
adds the thirtieth capture: an authorized ready RFI with the Return to draft
confirmation open; the issued capture now waits for official-PDF evidence.

Unit tests grew from 151 to **161** across the same six suites (net +10, all
in four files):

- `rfi-workspace-react` (26 → 33): a new "RFI workspace — rail layout"
  block (rail/grid structure present; editable-draft facts absent from the
  rail; read-only facts present in the rail; activity confined to
  `.base-workspace__secondary`, never `.base-workspace__body`), plus
  replacing the old single document-view test with one proving the
  no-renderer state has no `Show document view` button and one proving the
  interactive Collapsible still works once a `globalThis.BASE` runtime is
  mocked;
- `rfi-workspace-react` also proves the Slice 2A model: a `published` current
  version, immutable `RfiOfficialIssueSummary`/official-PDF evidence after
  reload, top-level status authority, and a confirmed capability-gated Return
  to draft request;
- `record-workspace-react` (21 → 23): a new "Record workspace — navigation
  safety" block proving a plain click on the primary action navigates through
  the shell, and a ctrl-clicked primary action leaves `defaultPrevented`
  `false` and never calls `shell.navigate`;
- `workspace-accessibility` (12 → 13): the existing keyboard-operable
  Collapsible test now mocks a renderer runtime (since that state requires
  one to exist at all), and a new test asserts the unavailable-state note has
  no interactive descendant (`button, a, [tabindex]`).

No test for horizontal overflow at rail breakpoints was added to the unit
suite: `happy-dom` has no real layout engine, so `scrollWidth` assertions
there would be meaningless. The enforceable check is
`scripts/capture-ui7-evidence.mjs`'s existing per-capture assertion that
`document.documentElement.scrollWidth` never exceeds the claimed CSS viewport,
which now also runs against the new long-content fixture at 390px.

Full `npm run check` passes: Prettier, generated Cloudflare types, TypeScript,
ESLint, **735 unit tests**, **154 Worker integration tests**, the Vite
production build, static-asset verification, Pages Functions compilation,
`npm audit --audit-level=high` (0 vulnerabilities), and the 506-file secret
scan.

### Known limitation, unchanged

Screenshots still cannot be produced in this environment — no Chrome/Chromium
binary is present, exactly as in §5G. The evidence bundle continues to build
successfully; `npm run evidence:ui7` must be run on a machine with Chrome to
populate `docs/evidence/ui-7/`, including the two new long-content captures.

### Next recommended action

Complete. Merged with §5G as `509d5bb` (PR #48). `npm run evidence:ui7` still
needs one run on a machine with Chrome to populate `docs/evidence/ui-7/`; that
is a closeout task for the merged phase, not a blocker on current work.

## 5I. RFI Slice 2B — mark ready, official issuance, and issued evidence

Branch `feature/rfi-slice-2b-issuance-ui`, started from `main` at
`509d5bb2ed48a9f9416a6874eb3bd3675e884c21`. **Draft PR; not merged.**

### Confirmed starting point

Both dependencies are merged: UI-7 native detail workspaces (`509d5bb`, PR #48)
and the RFI Slice 2A official issuance backend (`f6b9462`, PR #49). No
production deployment, migration, remote D1 SQL, R2 write, or real official
issue was performed by this task.

**Continuation audit (2026-07-28).** The incomplete handoff at `c2400df` was
audited requirement-by-requirement. The workflow implementation was complete;
the correction added independent shared-component regressions and the matching
UI Lab state. Four durable documents that the WIP commit had converted wholesale
from repository-standard LF to CRLF were normalized back to LF while preserving
only their intentional Slice 2B edits, reducing those files' final comparison
with `origin/main` to a narrow semantic diff. The full gate and all 26 evidence
captures were rerun after the correction.

**Preview artifact correction (2026-07-28).** A captured authenticated preview
issue returned `503 RFI_ARTIFACT_RENDER_FAILED` because the retained preview
fixture had published a stale RFI definition. This branch adds a reviewed,
idempotent preview-only canonical-template reconciliation and safe structured
renderer-failure logging. It preserves the stale version for audit and never
touches production; product-owner preview verification remains required before
this draft PR can merge.

**Product-owner smoke correction (2026-07-28, draft PR #50).** The authenticated
preview smoke issued RFI-001 and its original PDF, then exposed three
merge-blockers: free-text responder attribution was incorrectly bound into a
user foreign key; the shared desktop workspace sticky rail could paint beneath
Activity; and the PDF sliced a UTC timestamp instead of using the project
calendar date. The correction keeps external responder text solely in response
history, uses the authenticated recording actor for the detail user FK, and
maps unexpected response-batch failures to safe `503
RFI_RESPONSE_COMMIT_FAILED` logs without response or identity content. The
shared rail now has token-surface backing, stacking, and trailing spacing only
at the desktop sticky breakpoint; the deterministic capture asserts no metadata /
Activity intersection after scroll and non-sticky single-column tablet/mobile.
Workspace evidence and the strict PDF adapter both format issue dates in the
project timezone. The current strict adapter remains accepted for Slice 2A/2B;
RFI-02.10 defers convergence with the reusable Library/Studio renderer while
retaining the immutable Library template-version binding. This PR remains draft
and requires a new preview deployment plus product-owner verification before
merge.

**Correction validation/evidence status.** `npm run check` passes on this
correction (836 unit tests and 158 Worker/D1 integration tests, production and
Functions builds, audit, and secret scan). The added capture scenario produces a
desktop screenshot after Activity scroll and enforces the rail geometry at
1280px, 834px, and 390px. This environment has no attachable authenticated
browser and no Chrome/Chromium executable, so the three new captures could not
be generated or inspected locally; they remain required preview/CI evidence
before merge. No production action has been performed.

### What this slice delivers

The complete browser-operable record-only issue path inside the existing UI-7
RFI workspace:

`draft → save → mark ready → review issue details → issue once → server-assigned
number → immutable Original Issue evidence after reload`.

**Mark ready.** The lifecycle action reads `capabilities.markReady` and is
labelled **Mark ready** for a clean draft and **Save and mark ready** when the
form holds unsaved edits, so `/ready` is never called against stale server
content. The confirmed sequence is: validate the client fields, save with the
current `lockVersion`, confirm the save, refetch the authoritative workspace,
call `/ready`, refetch workspace and register data. A save that succeeds while
`/ready` fails says exactly that — the draft stays saved, editable, and
unmarked, with the server message and request ID. A `409` save conflict reloads
the server values and stops before `/ready`.

**Coordination boundary, not a second form.** `RfiContentPanel` keeps sole
ownership of the draft form state and exposes only what the header needs:
whether the draft is dirty (`onDirtyChange`) and one validated save operation
(`handleRef`). No generic form framework was introduced.

**Ready to issue.** `Issue RFI` is the primary action; `Return to draft` moves
to the overflow menu and is promoted back to primary only when the server does
not authorize `issue`, so it appears exactly once. A lifecycle notice states
that content and routing are locked, and no editable content fields render.

**Issue workflow.** Two stages inside the shared `FormDialog` — issue details,
then review and confirm. To prefills the responsible project contact and
requires at least one recipient; CC is optional and cannot overlap To (a contact
selected under To is disabled under CC and is dropped from CC when promoted);
the response due date prefills from `requestedResponseDate` and must be a real
`YYYY-MM-DD` calendar date; eligible current-revision attachments are listed by
role and selected by default; delivery is a fixed **Record only** summary with no
disabled email or portal controls. The final action is labelled **Issue official
RFI**.

**Recipient data source.** The existing `responsibleContacts` workspace
collection was reused unchanged. It already selects every non-archived contact
in the project, which is exactly the eligibility rule
`RfiOfficialIssueService.resolveContact` enforces, so **no read-model change and
no server change were needed**. It exposes only project contact ID, name, and
company — no email, phone, or address.

**Idempotency.** One deliberate attempt carries exactly one key
(`crypto.randomUUID` through `createIdempotencyKey`, with a
`crypto.getRandomValues` v4 fallback). The key is reused for every retry of the
same canonical payload, including after a network failure; it is spent only when
the operator changes an unused payload or the server definitively refuses. The
attempt state tracks the canonical submitted payload, key, request state, request
ID, and whether the outcome is confirmed, retryable, or uncertain. The key is
never persisted, rendered, logged, or placed in a URL.

**Ambiguous outcomes.** Every issue failure first re-reads the authoritative
workspace. If `officialIssue` is present the attempt is treated as successful and
the persisted result is shown, whatever the response said. Otherwise the failure
is classified: transient server failures (`RFI_ARTIFACT_RENDER_FAILED`,
`RFI_STORAGE_UNAVAILABLE`, `RFI_ISSUE_COMMIT_FAILED`) offer **Retry issue** with
the same key and payload; a failed fetch or unexplained 5xx offers **Check issue
status**, which is a read and never a second POST;
`RFI_ARTIFACT_RECONCILIATION_REQUIRED` shows a support/reconciliation notice with
the request ID, offers no retry at all, and lets the operator close and return
later. No state ever reports a success or a failure it cannot prove.

**Cache invalidation.** `invalidateRfiLifecycleCaches` invalidates the RFI
workspace, the project RFI register, and the reserved dashboard and
project-overview keys from one place after mark ready, return to draft, and
issue. The workflow never navigates, so register search/filter/sort URL state is
preserved and no manual refresh is required.

**Issued evidence.** The Original Issue section now presents the generated
official PDF as the clearest action (through the authenticated attachment content
route), then the issued version, issuance number, issued date, response-due
snapshot, To and CC snapshots, and the files included with the original issue
labelled by role — kept distinct from the generated artifact and from later
files. Current status and available actions still come only from top-level
`rfi.status` and `capabilities`.

### API and schema impact

No endpoint, request shape, response shape, migration, or server behaviour
changed. The feature-local API layer gained `markRfiReady` and `issueRfi`;
`issueRfi` takes a typed body plus an explicit idempotency key and an optional
`AbortSignal`, and sends the exact `Idempotency-Key` header.
`RfiOfficialIssueResult` is typed separately from `RfiOfficialIssueSummary`
because the immediate result carries issue-time `status`, `capabilities`, and
identity fields the long-lived workspace projection intentionally omits.

Two shared components gained additive optional props rather than a feature-local
substitute: `FormDialog` (`secondaryAction`, `submitDisabled`, `hideSubmit`,
`fieldsDisabled`) and `Checkbox` (`ref`, so a dialog can place initial focus on
the first recipient).

### Tests

**96 tests added for this slice:** 94 workflow tests across six dedicated
suites, plus two independent shared-component regressions. Every existing UI-7
and Slice 2A suite is preserved and passing:

| Suite                       | Tests | Covers                                                                                                                    |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `rfi-issue-api`             | 6     | endpoints, methods, exact body, exact header, request-ID extraction, typed result, every documented error code            |
| `rfi-issue-idempotency`     | 16    | key generation, canonical payload identity, key reuse/discard rules, payload locking, failure classification              |
| `rfi-mark-ready-react`      | 20    | capability gate, clean/dirty labels, save-before-ready ordering, save failure, 409 conflict, 422 refusal, action priority |
| `rfi-issue-dialog-react`    | 30    | recipients, CC, due date, included files, record-only notice, review payload, double click, retry, network failure, a11y  |
| `rfi-issued-evidence-react` | 11    | official PDF route, snapshots, roles, reload survival, evidence-is-not-authority, heading hierarchy, register update      |
| `rfi-issue-layout-tokens`   | 11    | token registry, 390px responsive rules, wrapping, shared-component boundary, no rendered key/storage key/predicted number |
| `base-components-behavior`  | +1    | `Checkbox` forwards its optional ref to the focusable Radix control                                                       |
| `base-components-keyboard`  | +1    | additive `FormDialog` locked-fields, secondary-action, disabled-submit, and no-resubmit states                            |

Full gate: `npm run check` passes — Prettier, Cloudflare types, TypeScript,
ESLint, **831 unit tests**, **154 Worker/D1 integration tests**, the production
Vite build, the Pages Functions build, `npm audit --audit-level=high` clean, and
the **542-file** secret scan. `npm run lab:build` passes. The UI Lab includes
the shared locked reconciliation/no-resubmit `FormDialog` state.

### Visual evidence

`npm run evidence:rfi2b` builds the shared evidence bundle and drives the real
React workspace and the real API layer through Chrome DevTools. **26 captures
were regenerated and individually inspected** in the continuation audit into
`docs/evidence/rfi-2b/`; every capture
asserts the CSS viewport it claims and fails the run on horizontal overflow, so
the 390px, 430px, 834px, and desktop captures are proof of no overflow rather
than an assertion about it. Covered: clean draft with Mark ready, dirty draft
with Save and mark ready, both mark-ready confirmations, mark-ready validation
failure, ready-to-issue workspace, Return to draft in overflow, issue details,
recipient/CC selection, included-file selection, final review, issuing pending,
retryable failure with request ID, reconciliation-required, issued workspace with
official PDF, issued recipients and included files, a live end-to-end issue, and
long filename/contact/company content at desktop and 390px. The audit found no
clipped footer, horizontal overflow, full-width workspace regression, unusable
mobile control, or long-value wrapping defect; no production visual correction
was required.

### Deliberate limitations

- `record_only` only. No email delivery, email composition, external recipient
  portal, secure share links, or external responses.
- No RFI log export, bulk issue, or Submittals.
- Response/clarification workflow is unchanged; its redesign stays a later slice.
- The Work Dashboard and Project Overview are still compatibility-mounted, so
  their query keys in `src/ui/app/queryKeys.ts` are reserved for UI-8; today
  those legacy controllers refetch on mount and cannot show a stale count.
- `uploadAttachment` remains server-authorized in `ready_to_issue`, so files can
  still be added while content and routing are locked. That is the accepted
  Slice 2A lifecycle rule, not a UI decision.

### Rollback

1. Revert the PR merge commit. The RFI workspace returns to the merged UI-7
   behaviour: evidence and Return to draft, no mark-ready or issue UI.
2. To disable only the issue entry point without a revert, remove the
   `capabilities.issue` branch from `primaryAction` in
   `RfiWorkspaceFeature.tsx`; `/issue` is then unreachable from the browser and
   remains server-guarded.
3. No database, storage, `/api/v2` contract, renderer, or controlled-document
   definition change is involved in either path.

### Next recommended action

Review this draft PR, run the authenticated product-owner smoke checklist against
a preview deployment, and confirm the `docs/evidence/rfi-2b/` captures. Do not
merge without explicit approval. **UI-8 — Dashboard and Project Overview — is
not started and must not begin until this slice is reviewed and merged.**

## 6. Phase status

Two different programs are tracked in this repository, and they must not be
read as one sequence. §6.1 is this document's authoritative scope. §6.2 is a
convenience pointer to the product delivery roadmap, whose source of truth is
`IMPLEMENTATION_ROADMAP.md`.

### 6.1 UI foundation program — authoritative here

| Phase                        | Status                                                         | Next gate                           |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Spike 0 — Tabulator          | Complete; rejected for RFI                                     | Future high-volume proposal only    |
| UI-1 — Audit and decisions   | Complete                                                       | Binding documents and ADRs recorded |
| UI-2 — CSS + React/Vite      | Complete; merged (`a1ade6d`, PR #41)                           | none                                |
| UI-3 — Components + UI Lab   | Complete; merged (`cb9f191`, PR #43)                           | none                                |
| UI-4 — React shell           | Complete; merged (`6976f16`, PR #44)                           | none                                |
| UI-5 — RFI register          | Complete; merged (`86b11e1`, PR #45)                           | none                                |
| UI-6A — Projects register    | Complete; merged (`0b5ec89`, PR #46, squash)                   | none                                |
| UI-6B — Document Register    | **Complete; merged** (`315de55`, PR #47, squash)               | none                                |
| UI-7 — Detail workspaces     | **Complete; merged** (`509d5bb`, PR #48)                       | none                                |
| UI-8 — Dashboard/forms/admin | Not started; blocked until RFI Slice 2B is reviewed and merged | Shared shell/forms/registers stable |
| UI-9 — Library + Studio      | Not started                                                    | Application foundation stable       |
| UI-10 — Enforcement/cleanup  | Not started                                                    | Route parity and visual baselines   |

### 6.2 Implementation-roadmap status — context only

Product delivery phases are **not** UI-program phases and do not gate or
advance the table above. Source of truth: `IMPLEMENTATION_ROADMAP.md` (and
`RFI_SLICE_1_ROLLOUT.md` for the Slice 1 closeout).

| Roadmap item                        | Status                                                                                         | Relationship to the UI program                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RFI Slice 1                         | Complete; merged and closed out in production                                                  | Its register/workspace surfaces are what UI-5/UI-7 migrate                 |
| RFI Slice 2A — backend architecture | **Complete in code; merged** as `f6b9462` (PR #49) — no production migration or deployment yet | UI-7 consumes its workspace contract                                       |
| RFI Slice 2B — issuance UI          | **Implemented; draft PR on `feature/rfi-slice-2b-issuance-ui`**                                | Record-only issue workflow composed from the shared workspace chrome (§5I) |
| RFI Slice 2 — email/share delivery  | Deferred                                                                                       | Not started; not part of Slice 2B                                          |

## 7. Current constraints and risks

- Slice 2A official issuance stays server-authoritative. Slice 2B adds the
  browser workflow for it and reimplements none of that authority: numbering,
  validation, idempotency persistence, and artifact commit remain on the server.
- Issue delivery is `record_only`. Email, share links, and an external recipient
  portal are still deferred and are deliberately not shown as disabled controls.
- Official issue evidence is immutable; current lifecycle state and available
  actions come only from top-level `rfi.status` and `capabilities`.
- Existing renderer output and valid definitions remain compatible.
- Browser capability presentation never replaces server authorization.
- The existing Cloudflare development/test dependency audit findings must be
  resolved or formally accepted before a production release; do not use
  `npm audit fix --force` without a review.
- A migrated RFI's Assigned to value remains unresolved (legacy text only) until
  manually reconciled to a project contact.

## 8. Next action

**RFI Slice 2B — mark ready, official issuance, and issued-evidence UI — is
implemented and awaiting review in a draft PR on
`feature/rfi-slice-2b-issuance-ui`.** UI-7 is complete and merged (`509d5bb`,
PR #48) and the Slice 2A backend is complete in code and merged (`f6b9462`,
PR #49); both are history, not active work.

The RFI workspace now completes the browser path
`draft → save → mark ready → review → issue once → server-assigned number →
immutable Original Issue evidence`, with `record_only` delivery, one idempotency
key per deliberate attempt, and honest handling of retryable, uncertain, and
reconciliation-required outcomes. Full scope, decisions, tests, evidence,
limitations, and rollback are in §5I.

Outstanding before this slice can close: an authenticated product-owner smoke
pass against a preview deployment, and product-owner confirmation of the 26
`docs/evidence/rfi-2b/` captures. No production deployment, migration, remote
D1 SQL, R2 write, or real official issue was performed.

After this slice is reviewed and merged, **UI-8 — Dashboard, Project Overview,
remaining create/edit forms, Team, and Administration** is the next phase. It
migrates the last two compatibility-mounted screens (`dashboard`,
`project-overview`) plus the placeholder project routes, and must compose the
shared shell, register, workspace, and form patterns rather than introduce new
chrome. **Do not begin UI-8 before this slice is reviewed and merged.** See §6.2
and `IMPLEMENTATION_ROADMAP.md`.
