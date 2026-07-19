# Architecture v1.0 Acceptance and Governance

## 1. Status

This documentation set is Architecture v1.0 for the BASE Office Forms / Document Control Platform. It is the implementation source of truth until superseded by an approved architecture change.

## 2. Authority order

When documents conflict, use this order:

1. `ARCHITECTURE_V1_ACCEPTANCE.md`
2. Approved Architecture Decision Records in `ARCHITECTURE_DECISIONS.md`
3. `PRODUCT_ARCHITECTURE.md`
4. `DOMAIN_MODEL.md` and `DATA_MODEL.md`
5. `WORKFLOWS.md`
6. `API_CONTRACTS.md` and `API_SECURITY_STORAGE.md`
7. `UX_PRODUCT_SPEC.md`
8. `TESTING_QUALITY_STRATEGY.md`
9. `ENGINEERING_STANDARDS.md`
10. Roadmap, backlog, migration, operations, and handoff documents
11. Existing implementation where not contradicted above

Existing code is evidence of current behavior, not authority to violate v1.0 decisions.

## 3. Binding decisions

The following are non-negotiable without an ADR:

- Preserve the current definition renderer and schema compatibility.
- Projects are first-class records, not folders.
- Templates and project records are separate.
- D1 stores relational metadata; R2 stores binary files/artifacts.
- Issued revisions and official artifacts are immutable.
- Official numbering is server-side and consumed only during issue/submit/publish transactions.
- Voided numbers are not reused.
- Workflow status and review disposition are separate.
- Submittals are stable items with child revisions.
- Delivery is a durable event with attempts, not a checkbox.
- Logs are query projections.
- Tenant isolation exists from the first new schema migration.
- AI is assistive and cannot independently issue, publish, approve, delete, or assign official numbers.
- Existing shared-library documents remain readable during migration.

## 4. Architecture change process

A proposed change must include:

- problem statement;
- options considered;
- decision;
- consequences;
- migration impact;
- security/data impact;
- documents and tests affected;
- approval.

Material changes add a new ADR. Do not silently edit a binding rule only to match an implementation shortcut.

## 5. Review checkpoints

Architecture review is required before merging changes that alter:

- domain entities or state machines;
- official numbering;
- authorization/tenant boundaries;
- schema ownership or immutability;
- artifact generation;
- file storage/retention;
- external sharing;
- delivery semantics;
- AI permissions;
- renderer definition compatibility.

## 6. Phase 1 acceptance

Projects + RFIs are accepted only when:

- OHPA Conway project data and routing are represented structurally;
- project-specific server numbering is concurrency-safe;
- drafts are unnumbered;
- issue creates an immutable revision and artifact;
- supporting files are stored and authorized correctly;
- response and closure workflows are complete;
- audit timeline is complete;
- RFI log PDF/XLSX exports reconcile to records;
- tenant and role tests pass;
- existing shared-library workflow still functions;
- pilot user completes the UX acceptance script;
- migration reconciliation has no unexplained record loss.

## 7. Phase 2 acceptance

Submittals are accepted only when:

- expected items and stable Log IDs exist;
- revisions are explicit children;
- submission and return files are revision-scoped;
- status/disposition are separate;
- revise/resubmit creates a new revision without destroying prior history;
- vendor delivery is auditable;
- log projection shows one stable item row;
- OHPA imported records reconcile.

## 8. Production readiness

Production use beyond pilot requires:

- backup and restore test;
- incident runbook;
- monitoring and alerting;
- critical security review;
- tested migration and rollback/forward-fix plan;
- user training;
- support ownership;
- release evidence.

## 9. Deferred items

Deferred does not mean prohibited. It means implementation must not prematurely shape the core around an unvalidated feature. Current deferred areas include:

- full email inbox/client;
- broad external collaboration portal;
- billing and multi-tenant self-service;
- OCR/full-text document search;
- native mobile application;
- autonomous AI actions;
- complex configurable workflow builder;
- arbitrary custom record types before RFI/submittal stabilization.

## 10. Sign-off record

Architecture owner: Zack / BASE Construction  
Architecture role: Product and system architect  
Version: 1.0  
Date: 2026-07-19  
Implementation begins with the PR sequence in `CODER_HANDOFF.md` and gates in `IMPLEMENTATION_ROADMAP.md`.
