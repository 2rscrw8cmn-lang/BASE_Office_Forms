# BASE UI Foundation Implementation Playbook

**Status:** Execution guide for the binding direction in `APP_UI_FOUNDATION.md`
**Rule:** Complete phases in order unless a documented dependency requires a narrow overlap.

## 1. How to use this playbook

Before starting any UI phase, an agent must read:

1. `README.md` — repository entry point and required workflow;
2. `docs/README.md` — architecture index;
3. `docs/APP_UI_FOUNDATION.md` — binding design direction;
4. `docs/UI_PROGRAM_STATUS.md` — current phase, completed work, active branches, and next action;
5. this playbook's phase section;
6. the applicable product, API, workflow, testing, and current-structure documents.

At completion the agent must update the repository documentation described in the closeout section. A chat summary or PR description alone is not a durable handoff.

## 2. Program sequencing

```text
Spike 0  Tabulator behavior proof                              [complete: reject for RFI]
UI-1     Audit, design contract, and decisions                 [complete]
UI-2     Application/document CSS separation + React/Vite foundation [complete: PR #41 review/merge]
UI-3     BASE component library + UI Lab
UI-4     React application shell and route parity
UI-5     RFI register as a native React feature (controlled table, no Tabulator) [complete: PR #45 merged]
UI-6A    Projects register + Create Project workflow          [complete: PR #46 merged]
UI-6B    Document Register + Add Document workflow            [complete: PR #47 merged, main 315de55]
UI-7     RFI, Record, and Revision workspaces                 [implemented: draft PR #48]
UI-8     Dashboard, forms, Team, and Administration
UI-9     Document Library and Studio application controls
UI-10    Drift prevention, E2E, visual regression, and cleanup
```

**Reconciliation constraint:** Draft PR #36 carries the approved controlled
RFI Slice 1 model while it reconciles with merged UI-2. It is not UI-3 and must
not make RFI delivery depend on Tabulator.

The RFI product workflow continues in parallel only where its work does not establish competing UI conventions. Any new production UI created before its migration must use existing shared patterns and remain easy to replace.

## 3. Spike 0 — Tabulator behavior proof

### Objective

Prove that Tabulator can support BASE register behavior without weakening server authority or accessibility.

### In scope

- mount and destroy lifecycle;
- conditional cell editability;
- click selection and keyboard navigation;
- Enter, Tab, Shift+Tab, Escape, arrow behavior;
- changed-only save behavior;
- async save states;
- validation and rollback;
- optimistic-concurrency conflict recovery;
- focused row/cell preservation where practical;
- URL filters remaining outside the grid;
- desktop and mobile feasibility;
- testing approach.

### Out of scope

- final visual design;
- broad app framework migration;
- new backend contracts unless a blocking gap is documented;
- direct adoption across multiple registers;
- official workflow changes.

### Required output

Create or update a spike report containing:

- tested Tabulator version and license;
- prototype location;
- behavior matrix;
- gaps and workarounds;
- recommended `BaseDataGrid` interface;
- bundle and security impact;
- decision: adopt, adopt with conditions, or reject;
- files that must not be carried into production unchanged.

### Exit gate

No production adoption until all critical RFI keyboard, save, validation, permission, and conflict behaviors have an acceptable design.

### Result

Spike 0 is complete and rejects Tabulator for the RFI register. The prototype
could not preserve the required select-then-edit/non-editing-arrow keyboard
workflow through documented APIs. Retain the controlled custom RFI table.
Tabulator may be reconsidered for a future high-volume register, log, or
export surface through `BaseDataGrid`, with a new acceptance decision.

## 4. UI-1 — Audit, design contract, and decisions

**Status:** Complete. The audit and binding decisions are recorded in the UI
foundation, ADRs, and program tracker.

### Objective

Turn design intent into a binding, reviewable contract and identify existing inconsistencies before code migration.

### Required audit screens

- Dashboard;
- Projects;
- Project Overview;
- Records register;
- Record workspace;
- Revision workspace;
- RFI register;
- RFI workspace;
- create/edit dialogs;
- Studio;
- Document Library.

### For each screen document

- page pattern;
- primary user question;
- primary action;
- duplicated facts;
- shared components present;
- local one-off controls;
- typography and spacing inconsistencies;
- status treatment;
- loading, empty, error, permission, and conflict states;
- desktop/tablet/mobile behavior;
- components to preserve, replace, or retire.

### Decisions to record

- application/document CSS boundary;
- React/Vite incremental migration;
- Radix/shadcn source ownership approach;
- Tabulator through `BaseDataGrid`;
- icon system;
- token source;
- component catalog strategy;
- visual-regression approval rules.

### Deliverables

- updated `APP_UI_FOUNDATION.md` where audit findings refine the rules;
- ADR entries;
- screen inventory or linked issue set;
- UI program tracker update;
- ordered implementation issues with dependencies.

### Exit gate

The team can answer, without inventing per-screen rules:

- what a page header looks like;
- what a register toolbar looks like;
- what a detail workspace looks like;
- how actions and statuses are presented;
- how forms and dialogs behave;
- how every standard async/error state appears;
- what is application UI versus official document rendering.

## 5. UI-2 — CSS separation and React/Vite foundation

**Status:** Complete on 2026-07-23. PR #41 passed the full gate and the
authenticated product-owner smoke test; it is ready for review and merge. PR
#36 reconciliation is required before UI-3 begins.

### Objective

Create a safe technical boundary for the application UI without changing official document output.

### Target structure

```text
public/
├── brand-tokens.css       shared neutral BASE brand values
├── base.css               controlled-document styles only
├── engine.js              authoritative renderer
└── generated app assets   Vite build output

src/ui/
├── app/
├── components/
├── features/
├── grid/
├── styles/
└── test/
```

The exact structure may differ if documented, but document and application styling must remain separate.

### Required work

- add React, TypeScript, and Vite;
- establish deterministic build output compatible with Cloudflare Pages;
- remove `base.css` from the authenticated application entry point;
- extract only neutral shared brand tokens where needed;
- add application reset, semantic tokens, theme, and utilities;
- provide an adapter for rendering controlled-document previews;
- keep legacy Studio and Library pages operational;
- preserve existing route URLs and `/api/v2` contracts;
- add dependency/license documentation;
- add regression tests proving renderer output and legacy pages remain stable.

### Do not

- rewrite the renderer;
- migrate every screen in this PR;
- move domain rules into React;
- change storage, migrations, or authorization without an independently justified requirement;
- import default shadcn or template styling as the final BASE theme.

### Exit gate

- application builds and deploys through current Cloudflare workflow;
- official document output is unchanged;
- authenticated app does not inherit generic document classes;
- legacy routes remain available;
- tests and build gate pass;
- rollback is documented.

## 6. UI-3 — Component library and UI Lab

### Objective

Create the reusable components that will prevent further visual drift.

### Required component groups

Implement the primitives, interactive components, and application patterns listed in `APP_UI_FOUNDATION.md`.

### UI Lab

Provide a development-only route or build artifact showing each component in:

- default;
- hover;
- focus;
- active/selected;
- disabled;
- loading;
- error;
- long-text;
- empty;
- desktop and mobile widths.

The UI Lab must use the production components, not duplicate demo markup.

### Testing

- component behavior tests;
- keyboard/focus tests for dialogs, menus, drawers, and tabs;
- accessibility scan where supported;
- visual screenshots for all shared patterns;
- token enforcement tests or lint rules.

### Exit gate

A feature team can build a standard register or detail workspace without adding new global visual CSS.

## 7. UI-4 — React application shell and route parity

### Objective

Move global application composition into the new foundation while keeping feature routes operational.

### Scope

- global navigation;
- mobile navigation drawer;
- session and organization context;
- project context;
- React Router route map;
- TanStack Query provider and query conventions;
- toast provider;
- error boundary;
- route loading and not-found states;
- project tabs;
- page containers;
- focus and route announcements;
- compatibility mounting for not-yet-migrated feature screens.

### Required parity

- all existing canonical URLs resolve;
- query strings and hashes survive normalization;
- browser back/forward behavior remains correct;
- generic 403/404 treatment remains safe;
- project tabs select correctly for descendants;
- mobile drawer focus trap and restoration remain correct;
- authorization stays server-derived.

### Exit gate

The shell is stable enough that feature migrations no longer need to modify global navigation or invent page containers.

## 8. UI-5 — RFI register as a native React feature

### Objective

Migrate `/projects/:projectId/rfis` from the compatibility-mounted
`public/rfis-view.js` controller to a native React feature inside the UI-4
shell, using a native semantic `<table>` on desktop and a dedicated card
pattern on mobile. Draft editing uses the shared responsive Drawer so desktop
and mobile share one form contract without turning the register into a
spreadsheet.

Do not adopt Tabulator for this route: Spike 0 rejected it because its
keyboard behavior regressed against the approved model. Do not make
`BaseDataGrid` an RFI prerequisite; the detailed `BaseDataGrid` contract
(§6.4 of `APP_UI_FOUNDATION.md`) is retained only for a future accepted
high-volume register, log, or export, through a separate acceptance decision.

The RFI workspace route (`/projects/:projectId/rfis/:rfiId`) stays
compatibility-mounted through `LegacyFeatureMount` until UI-7.

### Approved interaction model (binding)

The register preserves the server, query-state, and changed-only commit
contracts approved in `docs/UX_RFI_SPEC.md` §13 while applying the approved
UI-5 visual refinement:

- one shared right-side Drawer for Add RFI and draft editing; it becomes
  full-screen on mobile and never renders as an inline table row;
- ordinary cursor/text selection inside the editor's controls;
- no cell/row selection state, no arrow-key cell navigation, no Tab
  save-and-move, and no `role="grid"` semantics;
- Escape commits any pending change through the same blur path already used
  for that control, then closes the Drawer and returns focus to its opener —
  never a silent rollback of an already-typed value;
- per-field Saving/Saved/Failed/Conflict feedback, not a whole-row or
  whole-grid save state;
- capability-gated direct editing (`row.capabilities.updateDraft`), never a
  role-string inference in the browser.

### Required behavior

- the compact desktop hierarchy: RFI, Subject, Status, Assigned to, Due,
  Updated, and an accessible visually unlabeled Actions column;
- draft identity is the shared `Draft` badge and never "Unnumbered"; issued
  RFIs retain their authoritative number and canonical workspace link; the
  database UUID is never shown;
- the row primary area opens an editable draft in the Drawer or navigates an
  issued/locked RFI to its canonical workspace; an editable draft's overflow
  menu orders `Edit details` then `Open RFI`, while a locked/issued row exposes
  only `Open RFI`;
- the shared Drawer covers Subject, Assigned to, Response due, Question,
  Contractor recommendation, and a shared `Collapsible` for Drawing and
  Specification references, built from the UI-3 `Drawer`, `Collapsible`,
  `Field`, inputs, `ValidationMessage`, `SaveIndicator`, and `Button`;
- changed-only commits: text/date controls commit on blur, selects commit on
  selection, Enter commits a non-textarea control by blurring it, Enter in a
  textarea inserts a newline, unchanged values never call the API;
- the Drawer footer has secondary `Open` (the `file-text` icon) and `Close`.
  `Open` first blurs an active field, waits for the normal changed-only commit
  without a timeout, and navigates only when it is unchanged or saves
  successfully; validation, 403, failed save, and 409 feedback keep the
  Drawer open for correction/retry;
- `Drawer` owns a shared `navigation` (default) and `detail` size contract:
  detail is `clamp(500px, 45vw, 660px)` above 760px and full viewport width at
  or below 760px. `RegisterToolbar` keeps desktop filters inline but exposes a
  shared 44px mobile filter disclosure with active-count and Clear access;
- contact selection by project-contact ID, with the unresolved-legacy-text
  handling preserved;
- capability-gated Add RFI that creates one draft, clears incompatible
  search/status filtering, opens the new draft's Drawer, and
  focuses Subject;
- URL-backed `q`, `status`, `responsible`, `due`, `sort`, `direction` query
  parameters with the existing replace-on-search / push-on-filter-or-sort
  history behavior, restored correctly by browser Back/Forward;
- column-header sorting with correct `aria-sort` and an accessible name that
  states the next direction;
- loading, populated, first-use empty, filtered empty, retryable error,
  missing/permission, creating, saving, saved, validation failure, permission
  loss, and optimistic-concurrency conflict states;
- a dedicated mobile card pattern (not a compressed desktop table) carrying
  the same authorized data and canonical navigation.

### Architecture rules

- feature code does not instantiate Tabulator and does not build a second
  grid abstraction;
- this RFI composition is the accepted reference-register pattern. Follow its
  focused feature components and shared primitives for later registers rather
  than introducing a large generic `BaseRegister` abstraction;
- the API remains authoritative; no new endpoints or response-shape changes
  without a verified blocking gap;
- role strings are not interpreted in the client;
- official issuance, numbering, and other lifecycle actions remain out of
  scope and outside register editing;
- filter/sort URL state is owned by the feature through React Router, not a
  hidden internal state store;
- the feature composes the UI-3 component library (`RegisterPage` chrome
  equivalents, `PageHeader`, `RegisterToolbar`, `FilterChip`, `Button`,
  `Field` and form controls, `RfiStatusBadge`, `AttentionBadge`,
  `SaveIndicator`, `EmptyState`, `ErrorState`, `PermissionState`,
  `Skeleton`/`Spinner`) rather than recreating buttons, badges, save
  indicators, or generic async states locally.

### Exit gate

Behavioral parity and the refined responsive composition are demonstrated
through tests and desktop/mobile/tablet visual evidence. Acceptance is against
the compact semantic-table, dedicated-card, and shared-Drawer contract in
`docs/UX_RFI_SPEC.md` §13, never against a grid/spreadsheet prototype.

## 9. UI-6A and UI-6B — register migrations

### Objective

Migrate each remaining register in a vertically coherent, separately reviewed
phase while reusing the same page, toolbar, state, and responsive system.

### UI-6A — Projects register

- compact project identity;
- status, location, and updated information;
- search and status filter;
- server-derived capability-gated native Create Project workflow;
- no redundant Open action column;
- native semantic desktop table and dedicated mobile cards;
- canonical project navigation.
- no Tabulator or `BaseDataGrid`.

UI-6A does not change Records code. Its exit gate is a fully native
`/projects` route, retained legacy rollback modules, complete state/history/
capability/create coverage, and deterministic desktop/mobile evidence.

### UI-6B — Document Register

- stable record identity separated from revision and files;
- filters for type, discipline, revision status, and archive visibility;
- authoritative current revision;
- drafts shown without impersonating the published revision;
- file count and updated information;
- capability-gated Add Document;
- canonical record navigation.
- native semantic desktop table and dedicated mobile cards;
- no Tabulator or `BaseDataGrid`.

UI-6B migrates only the Document Register and Add Document workflow; it does
not reopen Projects, begin detail workspaces, or broaden into later phases.

**Delivered.** `/projects/:projectId/records` is native React and Add Document
is a staged workflow in the shared `Drawer size="detail"`. Record and Revision
detail routes remain compatibility-mounted until UI-7. The register uses the
existing `GET /api/v2/projects/:projectId/records` response unchanged,
including its server-derived `capabilities.createRecord`.

**Branch stacking (historical).** UI-6B was specified to start from a `main`
containing UI-6A, but UI-6A's PR #46 was still open when UI-6B began, and UI-6A
modifies ten files UI-6B must also modify, so UI-6B branched from
`agent/ui-6a-projects-register-react` and was later rebased onto `main`. Both
PRs are now merged (UI-6A `0b5ec89`, UI-6B `315de55`); this is closed history,
retained as the lesson on stacking against a squash-merged base. See
`docs/UI_PROGRAM_STATUS.md` §5F.

**Add Document staging is the reusable lesson.** A multi-step server workflow
records which stages have been confirmed and retries only the failed remainder,
rather than restarting and duplicating server state. A partial failure must say
what does exist, show the request ID, and link to it. Later phases with staged
server work (publishing, issuance) should follow this shape.

### Exit gate

After both separately reviewed phases, Projects, Records, and RFIs share the
same page header, toolbar, chips, states, status components, density, and
responsive logic while keeping domain-specific tables, cards, and workflows.

## 10. UI-7 — RFI, Record, and Revision workspaces

### Objective

Unify detail routes around the Record Workspace pattern.

### Required hierarchy

- breadcrumbs;
- identity header;
- one primary current action;
- overflow menu for secondary/destructive actions;
- metadata strip;
- current work panel;
- files/content/response section;
- version history and activity as secondary context.

### RFI workspace guide

- subject/number/status prominent;
- responsible party and due date visible;
- one authoritative question/suggestion/reference area;
- response separated from the question;
- supporting, response, and clarification file roles visible;
- issued/closed states read-only where required;
- official issue action guarded and server-confirmed.

### Record workspace guide

- stable document identity;
- current version/current work as the primary panel;
- readable file types and roles;
- version naming standardized;
- archived/published immutability clear;
- history not duplicated in header facts.

### Revision workspace guide

- exact revision context;
- draft upload/publish actions only when permitted;
- issued/published revisions immutable;
- current files and change summary;
- issue/publish actions never represented as ordinary save.

**Delivered.** All three detail routes are native React and compose one shared
`WorkspacePage` pattern (`src/ui/components/patterns/WorkspacePage.tsx`), the
detail-route counterpart to `RegisterPage`. Record facts and revision facts stay
in separate labelled locations; a draft never impersonates the authoritative
current revision; published, superseded, and archived states state their own
immutability; publish/archive/close/reopen/void are confirmed transitions rather
than saves; and issuance is still not exposed. See `UI_PROGRAM_STATUS.md` §5G.

**The reusable lessons.**

1. *One page pattern per route family.* A detail route composes `WorkspacePage`
   the same way a register composes `RegisterPage`. Later detail surfaces
   (submittals, issuances) reuse it rather than rebuilding the hierarchy.
2. *Each fact has one authoritative location.* Where a fact becomes editable it
   moves into the editor and leaves the metadata strip, instead of appearing
   twice — see the RFI workspace's Assigned to / Response due.
3. *Reconcile before retrying.* A failed upload refetches its workspace before
   offering a retry, so an operator decides against confirmed server truth and a
   repeat attempt cannot duplicate server state. This extends the UI-6B staged
   Add Document rule to single-stage work.

### Exit gate

The three workspaces clearly belong to the same product while retaining their domain-specific content.

## 11. UI-8 — Dashboard, forms, Team, and Administration

### Dashboard and Overview

- compact score/summary strip;
- attention-first hierarchy;
- recent activity;
- meaningful canonical links;
- compact empty state.

### Forms

- use `FormDialog` or routed workspace according to complexity;
- standard field grouping, validation, loading, error summary, and footer;
- no feature-specific modal systems.

### Team and Administration

- separate operational project contacts from organization administration;
- use standard registers and forms;
- preserve deny-by-default permissions;
- surface invitation, inactive, or unresolved states explicitly.

### Exit gate

All daily project-control routes use the application foundation. Remaining legacy UI is limited to the Library and Studio transition.

## 12. UI-9 — Document Library and Studio

### Document Library objective

Clarify the distinction among templates, shared definitions, controlled documents, and project records. The Library is not a substitute for the project Records register.

### Library guide

- clear content type and lifecycle labels;
- stable search/filter behavior;
- application-standard page header and toolbar;
- explicit Open, Use Template, Edit, Publish/Retire, or Add to Project actions according to authority;
- avoid exposing edit tokens or legacy implementation terminology;
- preserve current compatible definitions and links during migration.

### Studio objective

Replace accumulated control inconsistencies while preserving definition compatibility and renderer output.

### Studio guide

- application-standard toolbar, menus, dialogs, toast, and save state;
- block cards visually correspond to preview blocks;
- clicking a preview section selects its editor block where practical;
- permanent block IDs;
- controlled block/input types rather than arbitrary strings;
- sections, add-block controls, and document settings are progressively disclosed;
- renderer preview failure retains the last valid preview;
- save/update/delete actions state their destination and consequence clearly;
- no second renderer or incompatible definition format.

### Exit gate

Library and Studio use the application component system while official previews remain renderer-owned.

## 13. UI-10 — Drift prevention and cleanup

### Required controls

- Playwright critical-route tests;
- desktop, tablet, and mobile screenshots;
- visual baseline review process;
- accessibility scans and keyboard journeys;
- lint restriction for raw application colors;
- lint/code-review restriction against direct Tabulator use;
- dependency and license register;
- removal of retired CSS/JS only after route parity and rollback confidence;
- bundle and performance monitoring.

### Exit gate

The old application shell and redundant CSS are removed or isolated, all approved routes use the shared foundation, and CI prevents ordinary feature work from recreating inconsistent patterns.

## 14. Mandatory agent closeout

Every implementation agent must complete all applicable items before handoff.

### Repository updates

- update `docs/UI_PROGRAM_STATUS.md` with completed scope, commit/PR, tests, screenshots, limitations, and next recommended action;
- update `docs/CURRENT_APPLICATION_STRUCTURE.md` when runtime, routes, dependencies, styles, components, or file locations change;
- update this playbook or `APP_UI_FOUNDATION.md` if an approved implementation decision changes the contract;
- update ADRs for significant technical decisions;
- update API/workflow/data/testing docs when their contracts change;
- update README links if a new primary guide is created.

### Pull request evidence

- problem and scope;
- architecture and UI-foundation references;
- dependency/license impact;
- API/schema/security impact;
- migration/rollback impact;
- test results;
- desktop and mobile screenshots for UI work;
- accessibility/keyboard checks;
- known limitations;
- explicit next step.

### Return message

The final agent response must state:

1. branch and PR;
2. exact scope completed;
3. tests and checks run;
4. screenshots or why unavailable;
5. documentation updated;
6. known limitations;
7. next recommended prompt/phase;
8. confirmation that no merge occurred unless the user explicitly requested a merge.

An agent may not report “done” while leaving the tracker and current-structure documentation stale.
