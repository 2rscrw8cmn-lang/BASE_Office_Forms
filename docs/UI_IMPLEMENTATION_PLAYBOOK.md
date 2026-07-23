# BASE UI Implementation Playbook

**Status:** UI-2 CSS/build foundation completed 2026-07-23
**Authority:** Use with `APP_UI_FOUNDATION.md` and `UI_PROGRAM_STATUS.md`.

## Required preamble for UI work

Work in repository `2rscrw8cmn-lang/BASE_Office_Forms`.

Before changing code, read, in order: `README.md`, `docs/README.md`,
`docs/APP_UI_FOUNDATION.md`, this playbook, `docs/UI_PROGRAM_STATUS.md`,
`docs/CURRENT_APPLICATION_STRUCTURE.md`, `docs/ENGINEERING_STANDARDS.md`,
`docs/TESTING_QUALITY_STRATEGY.md`, and the product/API/workflow documents for
the phase. Inspect current `main` and open work before selecting a base. Do not
merge unless explicitly requested.

Every UI phase must leave the tracker current and must record tests, visual
evidence or its absence, limitations, compatibility/rollback notes, and the
next smallest safe action.

## Program sequence

```text
Spike 0  Tabulator behavior proof
UI-1     Audit, design contract, and decisions                 [complete]
UI-2     Application/document CSS boundary + React/Vite        [complete]
UI-3     BASE components + UI Lab
UI-4     React application shell and route parity
UI-5     RFI register through BaseDataGrid
UI-6     Projects and Records registers
UI-7     RFI, Record, and Revision workspaces
UI-8     Dashboard, forms, Team, and Administration
UI-9     Document Library and Studio application controls
UI-10    Drift prevention, visual regression, and cleanup
```

The RFI product vertical slice may proceed separately, but it may not establish
competing page, status, form, or grid conventions.

## Spike 0 — Tabulator behavior proof

Prove mount/destroy, selection, keyboard editing, changed-only saves,
validation, rollback, async states, conflict recovery, focus preservation,
URL-owned filters, accessibility, mobile feasibility, testability, bundle
impact, and licensing. No production feature may instantiate Tabulator directly.
The output is a recommendation and a `BaseDataGrid` interface, not final
styling.

## UI-1 — Audit, design contract, and decisions

### Required screens

Dashboard, Projects, Project Overview, Records register, Record workspace,
Revision workspace, RFI register, RFI workspace, create/edit dialogs, Studio,
and Document Library.

### Required audit record

For every screen, record its page pattern, primary user question and action,
duplicated facts, shared components, local controls, typography/spacing/status
inconsistencies, loading/empty/error/permission/conflict behavior, desktop /
tablet / mobile behavior, and components to preserve, replace, or retire.

### Required decisions

Record the application/document CSS boundary, incremental React/Vite strategy,
Radix behavior versus BASE-owned component source, Lucide icon ownership,
Tabulator through `BaseDataGrid`, token ownership, component catalog/UI Lab,
and visual-regression approval rules. UI-1 changes documentation only; it does
not migrate screens.

### Exit gate

The team can describe one page header, register toolbar, workspace hierarchy,
form/dialog contract, status vocabulary, async/error/conflict contract, and
responsive rule without inventing a screen-specific exception. UI-2 may not
start until the exact tracker condition in `UI_PROGRAM_STATUS.md` is met.

## UI-2 — CSS boundary and React/Vite foundation

Introduce a deterministic React/TypeScript/Vite application build and a
compatibility mount while preserving all current routes, `/api/v2`, Studio,
Library, `public/engine.js`, valid definitions, and official output. Extract
neutral brand tokens only where justified. Keep `public/base.css` renderer-owned
and prove the authenticated app no longer depends on document layout classes.
Do not migrate feature screens in this phase. The completed implementation uses
`public/app/` as the committed Cloudflare Pages asset output and keeps the
existing `app-shell.js` behind `LegacyApplicationHost` until UI-4.

## UI-3 — BASE components and UI Lab

Build BASE-owned primitives, interactions, application patterns, the one icon
component, and a development-only UI Lab using production components. Cover
hover, focus, selected, disabled, loading, error, long text, empty, desktop,
and mobile states. Add keyboard, accessibility, behavior, visual, and token
enforcement tests.

## UI-4 — React shell and route parity

Move navigation, session/project context, router integration, loading,
not-found, error boundary, tabs, focus management, announcements, and mobile
drawer behavior into the foundation. Keep compatibility mounts for unmigrated
features. Prove canonical URLs, query/hash handling, history, safe 403/404,
and selected project tabs.

## UI-5 — RFI register through BaseDataGrid

After Spike 0 is accepted, configure one `BaseDataGrid` for the RFI register.
Preserve project-contact IDs, keyboard editing, draft-only capability, URL
filters, Saving/Saved/Failed/Conflict states, row refresh, explicit workspace
navigation, loading/empty/error states, and deliberate mobile behavior. Do not
enable incomplete official issuance.

## UI-6 through UI-10

- **UI-6:** migrate Projects and Records to shared register patterns without
  duplicating Record, Revision, or File identity.
- **UI-7:** unify RFI, Record, and Revision detail routes around the workspace
  hierarchy; issued/published/archived work remains immutable.
- **UI-8:** migrate Dashboard, Overview, forms, Team, and Administration using
  shared summaries, forms, states, and server-derived capabilities.
- **UI-9:** migrate Library and Studio application chrome while preserving
  compatible definitions and renderer output.
- **UI-10:** add route journeys, responsive/visual baselines, accessibility
  checks, raw-color/direct-Tabulator enforcement, dependency records, bundle
  monitoring, and cleanup only after route parity and rollback confidence.

## Mandatory closeout

Update `UI_PROGRAM_STATUS.md` for every phase. Update
`CURRENT_APPLICATION_STRUCTURE.md` when runtime, routes, dependencies, styles,
components, or file locations change. Update ADRs and API/workflow/testing docs
when their contracts change. The handoff must state branch/PR, exact scope,
checks, screenshots or why unavailable, documentation, limitations, rollback,
and the next phase. No UI phase is complete on a chat summary alone.
