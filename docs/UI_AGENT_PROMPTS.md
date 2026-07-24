# BASE UI Program — Copy-Ready Agent Prompts

**Purpose:** Start each phase from repository context without relying on an earlier chat.
**Usage:** Copy one phase prompt into a coding agent. Replace bracketed values only when needed.

## Required preamble for every UI agent

Use this at the top of every phase prompt:

```text
Work in repository 2rscrw8cmn-lang/BASE_Office_Forms.

Before changing code, read in this order:
1. README.md
2. docs/README.md
3. docs/APP_UI_FOUNDATION.md
4. docs/UI_IMPLEMENTATION_PLAYBOOK.md
5. docs/UI_PROGRAM_STATUS.md
6. docs/CURRENT_APPLICATION_STRUCTURE.md
7. docs/ENGINEERING_STANDARDS.md
8. docs/TESTING_QUALITY_STRATEGY.md
9. the product/API/workflow documents relevant to this phase.

Treat those files as binding. Inspect current main and open PRs before choosing a base. Do not replay old roadmap steps that are already complete. Do not change official document rendering, authorization, numbering, lifecycle, D1/R2 ownership, or API contracts unless the prompt explicitly requires it and the change is documented.

Keep the work vertically coherent and reviewable. Do not merge unless I explicitly say to merge.

Before handoff, run the applicable checks and update:
- docs/UI_PROGRAM_STATUS.md;
- docs/CURRENT_APPLICATION_STRUCTURE.md when implementation structure changed;
- applicable architecture/API/workflow/testing docs;
- the PR body with test, screenshot, limitation, and rollback evidence.

Your final response must state branch/PR, scope completed, checks run, screenshot status, documentation updated, limitations, and the exact next recommended phase or prompt.
```

## Prompt 0 — Tabulator spike

```text
[INSERT REQUIRED PREAMBLE]

Run a focused Tabulator spike for the RFI register. This is a behavior and integration proof, not final styling and not a broad React migration.

Study the current RFI register implementation and preserve its interaction contract: selection, Enter edit/save, Tab and Shift+Tab save-and-move, Escape cancel, arrow navigation, changed-only blur saves, draft-only editability, project-contact selection, Saving/Saved/Failed states, optimistic-concurrency conflict recovery, URL filters, explicit row navigation, and mobile behavior.

Prove:
- clean mount/destroy lifecycle;
- conditional editors and validation;
- async PATCH integration without moving authority into the grid;
- rollback and one-row conflict refresh;
- focus preservation where practical;
- URL state outside Tabulator;
- accessible keyboard behavior;
- viable tests and bundle impact.

Do not spread direct Tabulator initialization across features. Propose the production BaseDataGrid adapter contract. Do not spend time making stock Tabulator look final.

Create or update a spike report with version/license, behavior matrix, gaps, workarounds, recommendation, dependency/security impact, and code that must not ship unchanged. Update UI_PROGRAM_STATUS.md and return the recommended next prompt.
```

## Prompt UI-1 — Audit and design contract

```text
[INSERT REQUIRED PREAMBLE]

Complete UI-1 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Audit Dashboard, Projects, Project Overview, Records, Record workspace, Revision workspace, RFI register, RFI workspace, create/edit dialogs, Studio, and Document Library. For each, record page pattern, primary task/action, duplicated facts, shared versus local components, typography/spacing/status inconsistencies, async/error/conflict states, responsive behavior, and components to preserve/replace/retire.

Refine APP_UI_FOUNDATION.md only where findings justify a clearer binding rule. Add architecture decisions for application/document CSS separation, incremental React/Vite, Radix/BASE components, Lucide, and Tabulator through BaseDataGrid. Produce ordered issue-ready implementation slices with dependencies.

Do not perform the React migration in this phase. Documentation must describe the current implementation honestly and distinguish completed foundation from remaining work.

Update UI_PROGRAM_STATUS.md with audit completion, decisions, open questions, and the exact UI-2 start condition.
```

## Prompt UI-2 — CSS separation and React/Vite foundation

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-2 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Introduce React, TypeScript, and Vite for the authenticated application workspace while preserving all current canonical routes, /api/v2 contracts, Cloudflare Pages deployment, and legacy Studio/Library operation. Separate application CSS from controlled-document CSS. The authenticated app must stop inheriting generic document classes and document-level body rules. Extract only neutral shared brand tokens where justified.

Preserve public/engine.js, public/base.css document output, valid JSON definitions, and renderer compatibility. Provide a controlled renderer-preview adapter rather than rewriting document rendering in React.

Add dependency/license documentation, deterministic build commands, regression tests, and rollback notes. Do not migrate every feature screen or alter domain behavior in this PR.

Prove official document output remains unchanged and update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, relevant ADRs, local development docs, package/build documentation, and the PR body.
```

## Prompt UI-3 — BASE components and UI Lab

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-3 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Build the BASE application component library using application tokens and Radix behavior primitives where appropriate. Implement the required primitives, interactive components, and application patterns from APP_UI_FOUNDATION.md. Use Lucide through one icon component. Do not ship stock shadcn styling.

Create a development-only UI Lab that renders the real production components in default, hover, focus, selected, disabled, loading, error, long-text, empty, desktop, and mobile states.

Add behavior, keyboard/focus, accessibility, visual, and token-enforcement tests. Feature code must be able to build a normal register or record workspace without new global visual CSS.

Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, testing docs, dependency records, and the PR evidence.
```

## Prompt UI-4 — React shell and route parity

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-4 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Migrate global application composition to the new React foundation: navigation, mobile drawer, session/organization/project context, React Router, TanStack Query provider, toast provider, error boundary, loading/not-found states, project tabs, page containers, focus management, and route announcements.

Preserve every existing canonical URL, query/hash behavior, browser back/forward behavior, safe 403/404 handling, project-tab descendant selection, Cloudflare Access/session behavior, and server-derived capabilities. Provide a compatibility path for feature screens not yet migrated.

Do not redesign individual feature workflows in this phase. Prove route parity through tests and desktop/mobile evidence.

Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, route docs, local development docs, and the PR body. Return the exact UI-5 prompt with any current-main constraints filled in.
```

## Prompt UI-5 — RFI register as a native React feature

> **Current decision:** Spike 0 rejected Tabulator for the RFI register because
> its keyboard behavior regressed. Do not treat BaseDataGrid or Tabulator as an
> RFI prerequisite, now or in this phase — a future high-volume-register
> decision would require its own separate acceptance.

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-5 from docs/UI_IMPLEMENTATION_PLAYBOOK.md: migrate
/projects/:projectId/rfis from the compatibility-mounted public/rfis-view.js
controller to a native React feature inside the UI-4 shell. This is a parity
migration and shared-component adoption phase. Preserve the approved API,
authorization, URL-state, changed-only commit, validation, and conflict
contracts in docs/UX_RFI_SPEC.md §13. Render a compact semantic desktop table
(no role="grid", cell selection, arrow-cell navigation, or Tab save-and-move),
dedicated mobile cards, and one shared right-side Drawer that becomes
full-screen on mobile. Do not render an inline editor row. Do not adopt
Tabulator or make BaseDataGrid a prerequisite. The RFI workspace route stays
on LegacyFeatureMount until UI-7.

Preserve exactly: columns RFI, Subject, Status, Assigned to, Due, Updated, and
an accessible visually unlabeled Actions column; Draft badges instead of
"Unnumbered"; row-primary-area open/navigation; editable-draft menus ordered
Edit details/Open RFI and locked/issued Open RFI-only menus; and
the shared Drawer fields Subject, Assigned to, Response due, Question,
Contractor recommendation, plus collapsed Additional information for drawing
and specification references. Use shared Drawer/Collapsible/Field/input/
ValidationMessage/SaveIndicator/Button components. Its detail Drawer footer
has secondary Open (`file-text`) and Close: Open waits for the normal
changed-only commit and only navigates on unchanged/success. Keep changed-only commits
(blur for text/date, selection for selects, Enter-blurs-non-textarea,
Enter-inserts-newline-in-textarea), Escape-commits-then-closes-and-returns-
focus, per-field Saving/Saved/Failed/Conflict states, contact-ID selection,
capability-gated Add RFI opening the new draft Drawer focused on Subject,
URL-backed q/status/responsible/due/sort/direction with the existing history
behavior, column-header `aria-sort`, and all loading/empty/error/permission/
conflict states.

Do not enable incomplete official issuance or infer permissions client-side. The API remains authoritative and its response shapes do not change without a verified blocking gap.

Port the existing tests/unit/rfi-ui.test.ts register behaviors into React tests without weakening or deleting the legacy rollback tests, and add the full required coverage list from the UI-5 prompt handoff (parity, keyboard, accessibility, conflict, permission, responsive, and visual evidence). Reconcile IMPLEMENTATION_ROADMAP.md, UI_IMPLEMENTATION_PLAYBOOK.md, this prompt file, and UX_RFI_SPEC.md wherever they still describe a spreadsheet/grid register. Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, and the PR body.
```

## Prompt UI-6 — Projects and Records registers

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-6 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Migrate Projects and Records to the React application foundation and shared register patterns. Reuse PageHeader, RegisterToolbar, filters, chips, result counts, states, status components, responsive logic, and BaseDataGrid or the approved simpler register component as appropriate.

Projects must preserve authorized project data, create capability, compact identity, status/location/updated information, filters, canonical navigation, and mobile behavior.

Records must preserve stable Record identity separate from Revision and File identity, authoritative current revision, draft indicators, file counts, archive visibility, filters, Add Document capability, canonical navigation, and tenant-safe data already returned by the API.

Do not add redundant action columns or duplicate facts. Add parity, responsive, accessibility, and visual tests. Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, affected UX docs, and the PR body.
```

## Prompt UI-7 — Detail workspaces

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-7 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Migrate RFI, Record, and Revision detail routes to the shared Record Workspace pattern: breadcrumbs, identity header, one primary current action, overflow actions, metadata strip, current work panel, files/content/response, and secondary version history/activity.

Preserve domain differences and authority. RFI response content remains separate from the question; file roles and exact revision context remain visible; issued/published/archived states remain immutable; issue/publish actions are not ordinary saves; no duplicate facts are introduced.

Use existing APIs and capabilities. Do not enable incomplete issuance. Add loading, empty, error, permission, conflict, long-content, desktop/mobile, keyboard, and visual coverage.

Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, applicable RFI/record/revision UX docs, and the PR body.
```

## Prompt UI-8 — Dashboard, forms, Team, Administration

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-8 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Migrate Dashboard, Project Overview, remaining create/edit forms, Team, and Administration to the shared application foundation. Use the compact summary strip, attention-first hierarchy, shared activity feed, shared FormDialog/routed form rules, standard registers, and server-derived permissions.

Do not create feature-specific dialogs, buttons, badges, or error states. Keep project contacts distinct from organization administration. Preserve existing API authority and tenant isolation.

Add empty/loading/error/permission, responsive, keyboard, accessibility, and visual coverage. Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, relevant product/API docs, and the PR body.
```

## Prompt UI-9 — Library and Studio

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-9 from docs/UI_IMPLEMENTATION_PLAYBOOK.md in reviewable slices if necessary.

Document Library: make templates, shared definitions, controlled documents, and project Records clearly distinct. Use application-standard page/toolbar/status/action patterns while preserving compatible definitions and links. Never expose edit credentials or imply that a Library item is automatically a project Record.

Studio: migrate application chrome, toolbar, menus, dialogs, toasts, save state, block cards, settings organization, and progressive disclosure to the shared foundation. Preserve permanent block IDs, definition compatibility, and public/engine.js output. Preview failure must retain the last valid preview. Do not create a second renderer or incompatible storage format.

Because this area is high risk, split work by stabilization, application chrome, editor interaction, and visual polish when needed. Add full definition round-trip and renderer-regression coverage.

Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, Studio/Library documentation, ADRs if needed, and the PR body.
```

## Prompt UI-10 — Drift prevention and legacy cleanup

```text
[INSERT REQUIRED PREAMBLE]

Implement UI-10 from docs/UI_IMPLEMENTATION_PLAYBOOK.md.

Add enforcement that keeps future work aligned: Playwright critical journeys, desktop/tablet/mobile visual artifacts, accessibility checks, approved visual-baseline workflow, lint restrictions for raw application colors and direct Tabulator use, dependency/license register, bundle monitoring, and PR checklist enforcement.

Remove or isolate retired shell code and redundant CSS only after proving route parity and maintaining rollback confidence. Do not delete legacy document assets required by the renderer or compatible links.

Produce a final migration inventory showing every route and whether it uses the shared foundation, an approved exception, or legacy renderer-owned UI.

Update CURRENT_APPLICATION_STRUCTURE.md, UI_PROGRAM_STATUS.md, testing/engineering docs, and the PR body. UI_PROGRAM_STATUS.md should identify the next product phase after foundation completion.
```

## Prompt — Resume current UI work safely

Use this when a new chat must continue a partially completed phase:

```text
Work in 2rscrw8cmn-lang/BASE_Office_Forms. Read README.md, docs/README.md, docs/APP_UI_FOUNDATION.md, docs/UI_IMPLEMENTATION_PLAYBOOK.md, docs/UI_PROGRAM_STATUS.md, docs/CURRENT_APPLICATION_STRUCTURE.md, and all open PRs related to the active UI phase.

Determine the authoritative current phase, branch/PR, completed acceptance criteria, failed or missing checks, unresolved review comments, and next smallest safe action. Do not start a replacement implementation until you have compared current main, the active branch, and the tracker. Continue the existing branch/PR when it is still valid.

Complete the remaining phase work, run checks, update the tracker and current-structure docs, and return the mandatory closeout report. Do not merge unless explicitly requested.
```
