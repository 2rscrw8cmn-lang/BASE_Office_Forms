Exit code: 0
Wall time: 0.2 seconds
Output:

# BASE Document Control Architecture v1.0

This directory is the implementation source of truth for evolving the existing BASE Forms & Documents Kit into a project-centric document-control platform.

## Agent start sequence

Implementation agents must first read the root [`AGENTS.md`](../AGENTS.md), then:

1. `UI_PROGRAM_STATUS.md` for the current repository handoff and active phase;
2. `CURRENT_APPLICATION_STRUCTURE.md` for what is actually implemented;
3. the applicable architecture, workflow, API, data, security, testing, and migration documents;
4. `APP_UI_FOUNDATION.md` and `UI_IMPLEMENTATION_PLAYBOOK.md` for application UI work;
5. current open pull requests that affect the same workflow or files.

The original roadmap and coder sequence remain useful architectural history, but they do not override current `main`, active pull requests, or the living program tracker. Agents must update durable repository documentation before handoff; a chat summary alone is insufficient.

## Start here

1. `ARCHITECTURE_V1_ACCEPTANCE.md` — authority, binding rules, and acceptance gates.
2. `PRODUCT_ARCHITECTURE.md` — product boundary, topology, modules, and release definition.
3. `DOMAIN_MODEL.md` — exact meaning of projects, records, revisions, files, artifacts, and deliveries.
4. `DATA_MODEL.md` — D1 schema and relational strategy.
5. `WORKFLOWS.md` — project, RFI, submittal, template, share, and delivery state transitions.
6. `UX_PRODUCT_SPEC.md` — required screen structure and user behavior.
   - `UX_RFI_SPEC.md` — reconciled RFI register and workspace behavior; read alongside the product spec.
7. `API_CONTRACTS.md` — endpoint and transaction contracts.
8. `API_SECURITY_STORAGE.md` — authentication, authorization, tenant isolation, R2, shares, and recovery.
9. `TESTING_QUALITY_STRATEGY.md` — mandatory test and release gates.
10. `ENGINEERING_STANDARDS.md` — code organization and implementation rules.
11. `IMPLEMENTATION_ROADMAP.md` — phased delivery sequence.
12. `IMPLEMENTATION_BACKLOG.md` — issue-ready epics and work.
13. `MIGRATION_ROLLOUT.md` — Notion/current-library import and OHPA pilot cutover.
14. `REPORTING_EXPORTS.md` — logs, dashboards, and formal exports.
15. `AI_ARCHITECTURE.md` — allowed and prohibited AI behavior.
16. `OPERATIONS_RUNBOOK.md` — deployment, backup, incident, and support baseline.
17. `ARCHITECTURE_DECISIONS.md` — binding ADRs.
18. `CODER_HANDOFF.md` — first PR sequence and stop conditions.
19. `CURRENT_APPLICATION_STRUCTURE.md` — implemented repository and runtime inventory.
20. `LOCAL_DEVELOPMENT.md` — prerequisites, environment contract, commands, and test setup.
21. `APP_UI_FOUNDATION.md` — binding application design direction, component rules, and application/document boundary.
22. `UI_IMPLEMENTATION_PLAYBOOK.md` — detailed UI phase guides, acceptance gates, and mandatory closeout.
23. `UI_AGENT_PROMPTS.md` — copy-ready prompts for each UI phase and safe continuation.
24. `UI_PROGRAM_STATUS.md` — living UI program status, active work, constraints, and next action.

## Product direction

The existing renderer, JSON definition format, visual system, packages, and shared library are retained. The new platform adds a relational project-and-record layer around those assets.

```text
Template + Branding + Project Snapshot + Record Revision → Official Artifact
```

The daily product is project control. The renderer is the controlled presentation engine.

## Non-negotiable rules

- Projects are first-class records, not folders.
- Templates are not project records.
- Issued revisions and official artifacts are immutable.
- Numbering is server-side and project-scoped.
- D1 stores metadata; R2 stores binary content.
- Delivery is an auditable event, not a checkbox.
- Logs are queries, not manually maintained documents.
- AI may suggest; a human performs official actions.
- Existing definitions remain compatible during migration.

## Implementation scope

The first production vertical slice is:

`Projects → RFIs → Files → Issue → Response → Close → Log exports`

Submittals follow using the same record, revision, file, artifact, delivery, and audit foundation.

## UI foundation guides

- `APP_UI_FOUNDATION.md` — binding application UI contract and renderer boundary.
- `UI_IMPLEMENTATION_PLAYBOOK.md` — ordered UI phases, gates, and closeout rules.
- `UI_PROGRAM_STATUS.md` — current UI phase, audit findings, decisions, and next gate.
- `UI_DEPENDENCIES.md` — UI package, license, security, and replacement record.
- `UI2_ROLLBACK.md` — UI-2 deployment boundary and rollback procedure.
