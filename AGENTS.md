# BASE Repository Agent Instructions

These instructions apply to coding and documentation agents working in this repository.

## Mandatory reading order

Before changing implementation or planning a new phase, read:

1. `README.md`
2. `docs/README.md`
3. `docs/UI_PROGRAM_STATUS.md`
4. `docs/APP_UI_FOUNDATION.md` for application UI work
5. `docs/UI_IMPLEMENTATION_PLAYBOOK.md` for the active UI phase
6. `docs/CURRENT_APPLICATION_STRUCTURE.md`
7. `docs/ENGINEERING_STANDARDS.md`
8. `docs/TESTING_QUALITY_STRATEGY.md`
9. applicable product, workflow, API, data, security, and migration documents
10. current open pull requests affecting the same files or workflow

Do not rely on an earlier chat as the source of truth. Repository documentation and current Git state are authoritative.

## Current-state rule

Inspect current `main`, active branches, and open pull requests before starting. Do not replay an old roadmap sequence when the repository has already completed those foundations. Continue an existing valid branch/PR instead of creating a competing replacement.

## Product and architecture rules

- Preserve controlled-document compatibility, `public/engine.js`, valid JSON definitions, and official artifact invariants.
- Keep authorization, lifecycle, numbering, validation, audit, D1 ownership, and R2 ownership authoritative on the server.
- Treat Projects, Records, Revisions, Files, Issuances, RFIs, and Submittals according to the domain documents.
- Do not infer authorization from role-name strings in the browser.
- Do not merge official and draft states for convenience.
- Do not enable incomplete official transitions.

## UI rules

- Follow `docs/APP_UI_FOUNDATION.md`.
- Application UI and controlled-document styling remain separate.
- Shared problems use shared components.
- Do not introduce raw application colors, local button/badge/dialog systems, feature-specific focus treatments, or direct Tabulator initialization.
- Tabulator is used only through the approved `BaseDataGrid` adapter after the spike is accepted.
- Official document previews remain renderer-owned.

## Scope and branch rules

- Keep work vertically coherent and reviewable.
- Do not mix broad refactors with workflow changes unless the dependency is explicit and documented.
- Do not edit an applied migration.
- Do not merge unless the user explicitly requests a merge.
- Before broad CSS, routing, schema, or foundation work, identify active PRs that could conflict.

## Required closeout updates

Before reporting completion, update all applicable durable handoff sources:

- `docs/UI_PROGRAM_STATUS.md` for UI-related work;
- `docs/CURRENT_APPLICATION_STRUCTURE.md` when runtime, dependencies, routes, styles, components, or file locations change;
- API, workflow, data, security, testing, migration, and architecture-decision documents when their contracts change;
- the pull request body with scope, impacts, tests, screenshots, limitations, rollback, and next step.

A chat summary alone is not an acceptable handoff.

## Required final response

State:

1. branch and pull request;
2. exact scope completed;
3. tests and checks run;
4. screenshots or why unavailable;
5. documentation updated;
6. known limitations and open risks;
7. next recommended prompt or phase;
8. whether anything was merged.

Do not say “done” while the program tracker or current-structure documentation is stale.
