# BASE UI Program Status

**Status date:** 2026-07-22  
**Authority:** This is the living handoff for the UI foundation program. Update it in every UI-related PR.

## 1. Current direction

- Preserve the existing document-control domain, D1/R2 model, authorization, revision/file identity, immutable issuance architecture, JSON definitions, `public/engine.js`, and official document styling.
- Introduce React + TypeScript + Vite incrementally for the application workspace.
- Separate application styling from controlled-document styling.
- Use Radix behavior primitives with BASE-owned components and visual styling.
- Use Lucide as the application icon family.
- Evaluate and, if accepted, use Tabulator only through one `BaseDataGrid` adapter.
- Migrate routes in phases; do not perform a broad rewrite.

## 2. Current product state relevant to UI

Completed foundations already on `main` include:

- authenticated application shell and route structure;
- Dashboard, Projects, Project Overview, Records register, and document-first Record/Revision workspaces;
- app UI token and register polish work;
- Studio stabilization work;
- records, revisions, files, and issuance foundations;
- substantial unit and integration test coverage.

Active product work at the time this tracker was created:

- RFI Vertical Slice 1 is in PR #36 and must be reviewed against current `main` before merge or further dependent work.
- RFI official issuance remains incomplete and must fail closed until the complete atomic workflow exists.
- A Tabulator spike is being performed separately to validate RFI register behavior and integration.

Do not follow the original numbered foundation PR sequence in `CODER_HANDOFF.md` as though it has not started. Use current `main`, open PRs, and this tracker.

## 3. Phase status

| Phase | Status | Authority / output | Next gate |
|---|---|---|---|
| Spike 0 — Tabulator | In progress outside this documentation change | Spike report required | Behavior, conflict, accessibility, and adapter recommendation |
| UI-1 — Audit and decisions | Ready | `APP_UI_FOUNDATION.md`, audit, ADR updates | Audit representative screens and confirm implementation decisions |
| UI-2 — CSS separation + React/Vite | Blocked by UI-1 and active-branch coordination | Future PR | Stable base from updated `main`; renderer regression plan |
| UI-3 — Components + UI Lab | Not started | Future PR | UI-2 merged |
| UI-4 — React shell | Not started | Future PR | UI-3 shared patterns stable |
| UI-5 — RFI register | Not started | Future PR | Accepted Tabulator spike and UI-4 shell |
| UI-6 — Projects + Records | Not started | Future PR | UI-5 proves register contract |
| UI-7 — Detail workspaces | Not started | Future PR | Shared workspace components stable |
| UI-8 — Dashboard/forms/admin | Not started | Future PR | Shared shell/forms/registers stable |
| UI-9 — Library + Studio | Not started | Future PR(s) | Daily application migration stable |
| UI-10 — Enforcement/cleanup | Not started | Future PR | Route parity and visual baselines |

## 4. Immediate next actions

1. Complete the Tabulator spike without treating stock styling as production design.
2. Review PR #36 and coordinate its migration/merge safety independently of the UI foundation.
3. Run UI-1 audit and record final ADRs.
4. Start UI-2 from an updated `main`; avoid concurrent broad edits to `app-shell.css` on multiple branches.

## 5. Active constraints

- Preview and production database configuration must be verified before migrations; do not infer safety from a branch preview alone.
- Official RFI issuance must remain unavailable until validation, numbering, immutable snapshot, artifact generation/durable processing, recipients, timestamp, status transition, activity, and idempotency are implemented as one coherent operation.
- Existing renderer output and valid definitions must remain compatible.
- No feature may infer authorization from role strings in browser code.
- No feature may instantiate Tabulator directly after `BaseDataGrid` is introduced.

## 6. Decisions pending confirmation through UI-1 or spikes

- Final Tabulator adoption decision and exact version.
- Exact React/Vite asset output and compatibility mounting strategy.
- Radix/shadcn package selection and whether components are copied or wrapped.
- Exact visual-regression tooling and artifact retention.
- Whether standard read-only registers use BaseDataGrid or a lighter shared table component.

## 7. Required update format

Every UI PR appends or revises the following information:

### Latest completed work

- **Phase:**
- **PR / branch:**
- **Commit:**
- **Scope completed:**
- **Acceptance criteria met:**
- **Tests/checks:**
- **Screenshots/evidence:**
- **Documentation updated:**
- **Known limitations:**
- **Rollback/compatibility notes:**
- **Next recommended action:**

### Active work

- **Phase:**
- **PR / branch:**
- **Owner/agent:**
- **Current blocking issue:**
- **Do not duplicate:**

Stale tracker information is a documentation defect and must be corrected in the same PR that changes the implementation state.
