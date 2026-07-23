# BASE UI Program Status

**Status date:** 2026-07-23  
**Current phase:** UI-1 — Audit and design contract complete  
**Authority:** Living handoff for the UI foundation program

## 1. Current direction

Preserve the D1/R2 domain model, authorization, numbering, lifecycle, revision
and file identity, immutable issuance architecture, JSON definitions,
`public/engine.js`, and official document output. Introduce React + TypeScript +
Vite incrementally for application UI, separate application CSS from renderer
CSS, use Radix behavior with BASE-owned components, use Lucide through one icon
component, and evaluate Tabulator only through `BaseDataGrid`.

UI-1 did not migrate React, add dependencies, change routes, or change runtime
behavior.

## 2. Audit completion

The audit covered the requested screens against current `main` and
`docs/CURRENT_APPLICATION_STRUCTURE.md`:

| Surface | Current pattern and task | Facts / shared vs local | State and responsive audit | UI-1 disposition |
|---|---|---|---|---|
| Dashboard | Dashboard/overview; answer “what needs attention today?” and open the canonical revision, issue, RFI, or issuance route. | Reuses shell, API, format, status, reason, and activity helpers. Counts overlap with Project Overview when the user narrows scope; attention items are locally rendered. | Loading, partial empty, full empty, retry/error, request ID, stale-request guard, and announcements exist. Shell drawer/table-width rules apply. | Preserve information hierarchy; replace local summary/attention markup with shared patterns in UI-8. |
| Projects | Directory/register; find a project and create one when authorized. | Shared shell/API/status/date helpers; local toolbar, table, mobile cards, and Create Project dialog. Project identity and Open affordance are repeated across desktop/card variants. | Search/filter/no-results, loading, retry/error, capability-gated create, keyboard dialog behavior. Table becomes cards on mobile. | Preserve server fields and capability gate; replace local register/dialog styling in UI-6/UI-8. |
| Project Overview | Dashboard/overview; understand project health and choose Records, Issuances, RFIs, or Team. | Reuses project header/tabs and shared format/activity helpers. Summary, attention, activity, and shortcuts are local; counts overlap with Dashboard and project header status. | Loading, empty attention, retry/error, not-found via project access, announcements. Shared 950/620 shell behavior. | Preserve attention-first layout; replace local metric/shortcut blocks with shared overview patterns in UI-8. |
| Records | Directory/register; locate a stable document identity and open its current work. | Shared shell/API/format/options/dialog primitives, but local filters, desktop table, mobile cards, archive control, and Add Document flow. Record, current revision, draft, and file facts are intentionally distinct but visually repeated between table/card/detail. | Loading, filtered empty, retry/error, capability-gated add/edit/archive, recoverable staged create/upload failure with request ID. Mobile cards are deliberate. | Preserve authoritative read model and terminology; replace local register surface with shared register pattern in UI-6. |
| Record workspace | Record workspace; understand stable document identity and open current/history work. | Shell/project context plus local breadcrumbs, identity header, metadata, current-work panel, files, history, dialogs. Title/number/type/current version appear in multiple hierarchy levels. | Loading, not-found, server mutation errors, archive/read-only state, upload/publish loading; no shared conflict recovery. Desktop table + mobile history cards. | Preserve identity/revision/file separation; consolidate duplicate facts under Workspace pattern in UI-7. |
| Revision workspace | Record workspace; upload files or publish a permitted draft revision. | Reuses shell, API, format, status/button/dialog CSS, but local revision identity, file list, publish/upload dialogs, and read-only notices. Record title, revision label/number, status, files, and issuance context recur. | Loading, missing/error, upload/publish busy states, invalid lifecycle/read-only states, request IDs; no standardized conflict recovery. Mobile stacks files/history. | Preserve immutable published/superseded behavior and explicit publish action; replace local workspace chrome in UI-7. |
| RFI register | Route placeholder today; eventual directory/register task is to find, filter, edit eligible drafts, and open an RFI workspace. | API/domain lifecycle exists, but no browser register, shared grid, contact picker, or UI status implementation exists. | No RFI UI loading/empty/error/conflict/responsive behavior exists. Spike 0 must prove keyboard/edit/save/conflict behavior first. | Do not infer current completion. Build in UI-5 through `BaseDataGrid`. |
| RFI workspace | Route placeholder today; eventual workspace task is to review question, responsibility, due date, response, files, and lifecycle action. | API supports detail, responses, and transitions; no browser component or shared workspace implementation exists. | No UI states exist; server 409 lifecycle errors are authoritative. | Build after RFI register and shared workspace contract in UI-7; keep official issue actions gated. |
| Create/edit dialogs | Form dialog/sheet; create a project, record, revision/file, or RFI draft with validation and server confirmation. | Project, record, add-document, record-detail, and revision dialogs each implement local markup/field grouping. Shared `app-dialog-*` CSS and API/error formatting exist, but no component library. | Focus trap/Escape/restoration and inline errors are strongest in project/add-document flows; server error/request IDs exist; conflict treatment is not a common pattern. Mobile dialogs become full-width/stacked. | Preserve recoverability and server authority; replace local dialog systems with `FormDialog`/`AlertDialog` in UI-3/UI-8. |
| Studio | Legacy editor workspace; edit definitions, preview, save/library, import/export, and template actions. | Local three-part editor/preview, inline SVG icon family, native controls, local panels, toast/state system, and renderer. Definition title/type/number/settings repeat in editor and preview by design. | Draft/Saving/Saved/Offline/Error state and last-valid-preview fallback exist; local 1050/760 breakpoints; library/template API errors are local. | Preserve definition compatibility, renderer, permanent IDs, and last-valid preview; replace chrome only in UI-9. |
| Document Library | Legacy directory/library; search/open/use/edit/delete/share compatible definitions. | Local top bar, search/table rows, legacy API, edit/view links and tokens. It is intentionally distinct from project Records but terminology and action treatment are not application-standard. | Legacy loading/error/empty behavior is not under the shell state contract; desktop-first table and local responsive rules. No shared conflict state. | Preserve routes, definitions, and links; clarify content/lifecycle distinction and migrate chrome in UI-9. |

## 3. Cross-screen findings

- The shell has the strongest existing shared foundation: project context, tabs,
  route focus, drawer behavior, API errors/request IDs, semantic status badges,
  page containers, and responsive thresholds.
- The current implementation still duplicates feature CSS and markup for page
  headers, registers, cards, action buttons, dialogs, status tones, file rows,
  and history. The repetition is the main migration target; it is not evidence
  that React components already exist.
- Application headings use Georgia through the currently shared CSS, while
  controls/body use Archivo and identifiers use JetBrains Mono. The prior
  “Georgia removed” rule was not truthful and is corrected in the foundation.
- Status is partly semantic but not centralized: project status maps most values
  to neutral, record/revision status classes differ, dashboard uses reason
  badges, Studio uses Draft/Saving/Saved/Offline/Error, and Library has local
  action/version text. UI-3 must define one vocabulary and tone map.
- Async handling is mature for implemented app routes but conflict recovery is
  not a shared client behavior. RFI UI is absent even though RFI API/domain
  services exist. No phase may claim the RFI register/workspace is implemented.
- `public/index.html` currently loads renderer/base CSS with app CSS. This is a
  known UI-2 boundary defect, not something to paper over with more selectors.

## 4. Decisions recorded by UI-1

1. **Application/document CSS separation:** keep `public/engine.js`, compatible
   definitions, and renderer CSS authoritative; UI-2 will extract only neutral
   brand tokens and stop authenticated application routes from depending on
   document classes. Current separation is incomplete.
2. **Incremental React/Vite:** introduce a deterministic application build and
   compatibility mount first; migrate route-by-route while preserving canonical
   URLs, `/api/v2`, legacy Library/Studio operation, and rollback to static
   mounts. UI-1 adds no runtime dependency.
3. **Radix/BASE components:** Radix may provide behavior primitives; BASE owns
   source, styling, tokens, markup, accessibility contract, and tests. Do not
   ship stock shadcn/template styling as the theme.
4. **Lucide:** use one BASE icon component backed by Lucide for migrated app
   UI. Existing inline SVGs are preserved until their owning route migrates.
5. **Tabulator/BaseDataGrid:** feature code may never instantiate Tabulator.
   Adoption is conditional on Spike 0 proving keyboard, save, validation,
   conflict, permission, accessibility, mobile, bundle, and licensing needs.
6. **Read-only registers:** UI-1 leaves the choice between `BaseDataGrid` and a
   lighter shared table open for Projects/Records; RFI edit behavior must be the
   first production grid proof.
7. **Visual approval:** every shared pattern needs desktop/tablet/mobile
   evidence and keyboard/accessibility checks. A baseline changes only with a
   recorded reason and reviewer approval; visual polish alone is not parity.

## 5. Ordered implementation slices

| Slice | Issue-ready scope | Depends on |
|---|---|---|
| UI-1 | Restore the program contract, complete screen audit, record decisions, and set the UI-2 gate. | Current `main`; complete |
| Spike 0 | Prove Tabulator behavior and publish `BaseDataGrid` contract, version/license, gaps, and tests. | Current RFI API/domain; may run in parallel with UI-2 |
| UI-2A | Extract neutral brand tokens; split application and renderer CSS; prove document output and legacy pages unchanged. | UI-1; current-main baseline |
| UI-2B | Add React/TypeScript/Vite deterministic build, compatibility mount, and rollback path without feature migration. | UI-2A |
| UI-3A | Build BASE primitives, status map, icon component, dialogs, focus, and state primitives. | UI-2B |
| UI-3B | Build PageHeader, RegisterToolbar, workspace patterns, responsive helpers, and UI Lab. | UI-3A |
| UI-4 | Migrate shell/navigation/context/router/query/error/focus parity. | UI-3B |
| UI-5 | Build RFI register through `BaseDataGrid`, including keyboard saves and conflict recovery. | UI-4; accepted Spike 0 |
| UI-6 | Migrate Projects and Records with shared read-only register/table contract. | UI-5; UI-3B |
| UI-7 | Migrate RFI, Record, and Revision workspaces. | UI-5; UI-6; shared workspace patterns |
| UI-8 | Migrate Dashboard, Overview, forms, Team, and Administration. | UI-4; UI-6; UI-7 |
| UI-9 | Migrate Library and Studio application chrome in reviewable slices. | UI-3; UI-8; renderer regression coverage |
| UI-10 | Add enforcement, E2E/visual/accessibility baselines, bundle monitoring, and retire redundant app CSS only after parity. | UI-4 through UI-9 |

## 6. Exact UI-2 start condition

UI-2 may start only when all of these are true:

- this UI-1 document set is present on the selected current-main base;
- Spike 0 is accepted, or its open gaps are explicitly recorded as non-blocking
  for the CSS/build portion and cannot affect the renderer boundary;
- the current-main baseline passes the existing build/check gates relevant to
  the touched surfaces, including renderer/legacy route regression evidence;
- the UI-2 branch names its CSS rollback boundary and does not overlap an
  uncoordinated broad `app-shell.css` rewrite;
- UI-2's first PR is limited to CSS/token/build separation and compatibility
  mounting; it does not migrate React feature routes.

Until then, the program remains at UI-1 complete / UI-2 not started.

## 7. Open questions

- Which exact React/Vite and Radix package versions meet the repository's
  runtime, bundle, and license requirements?
- Will UI-2 use a separate Vite output directory or a compatibility asset
  manifest for Cloudflare Pages?
- Which visual-regression runner and artifact retention policy will be approved?
- After Spike 0, which read-only Projects/Records surfaces use `BaseDataGrid`
  versus a lighter shared table?
- What is the smallest safe conflict payload/recovery contract for the future
  RFI grid and editable workspaces?

## 8. Phase table

| Phase | Status | Gate |
|---|---|---|
| Spike 0 — Tabulator | In progress / separate evidence required | Accepted behavior and adapter recommendation |
| UI-1 — Audit and decisions | Complete | This document, foundation, playbook, ADR entries |
| UI-2 — CSS + React/Vite | Not started; gated | Exact condition above |
| UI-3 — Components + UI Lab | Not started | UI-2 merged |
| UI-4 — React shell | Not started | UI-3 patterns stable |
| UI-5 — RFI register | Not started | UI-4 + accepted Spike 0 |
| UI-6 — Projects + Records | Not started | Shared register contract |
| UI-7 — Workspaces | Not started | Shared workspace contract |
| UI-8 — Dashboard/forms/admin | Not started | Shared shell/forms stable |
| UI-9 — Library + Studio | Not started | Application foundation stable |
| UI-10 — Enforcement/cleanup | Not started | Route parity and baselines |

## 9. Latest completed work

- **Phase:** UI-1
- **Branch/PR/commit:** documentation-only; no PR or commit created by this audit
- **Scope:** restored the missing UI playbook, completed the screen audit,
  refined the foundation contract, recorded UI architecture decisions, and
  ordered implementation slices
- **Checks:** documentation/source audit only; no code or React migration run
- **Screenshots:** not produced; UI-1 is a documentation audit and no browser
  surface was changed
- **Known limitations:** Spike 0 remains separate; RFI UI, React/Vite,
  application/document CSS separation, and shared components remain future work
- **Next action:** satisfy the exact UI-2 start condition, then run UI-2A

