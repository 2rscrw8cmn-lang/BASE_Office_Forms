# Document Control Architecture Package

This directory is the implementation source of truth for evolving BASE Forms & Documents Kit into a project-centered document management and control platform.

The documents are intentionally opinionated. When a product or engineering decision conflicts with these documents, update the applicable architecture document through a deliberate review before implementation.

## Reading order

1. [`PRODUCT_ARCHITECTURE.md`](./PRODUCT_ARCHITECTURE.md) — product boundaries, system shape, guiding principles, and target architecture.
2. [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) — precise definitions for templates, controlled documents, project records, revisions, artifacts, files, logs, and delivery events.
3. [`DATA_MODEL.md`](./DATA_MODEL.md) — D1 tables, relationships, constraints, numbering, immutability, and migration compatibility.
4. [`WORKFLOWS.md`](./WORKFLOWS.md) — RFI, submittal, controlled-document, sharing, and project lifecycle state machines.
5. [`API_SECURITY_STORAGE.md`](./API_SECURITY_STORAGE.md) — API boundaries, authorization, tenant isolation, R2 storage, secure links, audit trails, and operational controls.
6. [`AI_ARCHITECTURE.md`](./AI_ARCHITECTURE.md) — allowed AI capabilities, approval boundaries, structured outputs, data handling, and implementation stages.
7. [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) — ordered delivery phases, release gates, dependencies, and acceptance criteria.
8. [`IMPLEMENTATION_BACKLOG.md`](./IMPLEMENTATION_BACKLOG.md) — issue-ready epics and work packages for implementation.
9. [`MIGRATION_ROLLOUT.md`](./MIGRATION_ROLLOUT.md) — migration from the current shared library and Notion workflows, pilot plan, cutover, and rollback.
10. [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) — binding architecture decisions and deferred choices.
11. [`CODER_HANDOFF.md`](./CODER_HANDOFF.md) — implementation rules and the exact first pull-request sequence.

## Authority hierarchy

When documents overlap, use this order:

1. Architecture decisions
2. Product architecture
3. Domain and data models
4. Workflow specifications
5. API, security, and storage specification
6. Roadmap and backlog
7. Existing README, schema examples, and implementation notes

`SCHEMA.md` remains authoritative for the current render-definition format. This architecture package does not replace the renderer schema; it defines how rendered documents participate in a controlled record system.

## Product direction

The product is built by a general contractor and launches around construction workflows, but the core architecture remains industry-neutral.

Construction-specific capabilities are implemented as record types and template packs:

- Requests for Information
- Submittals
- Transmittals
- Inspections
- Meeting minutes
- Change requests
- Punch lists
- Daily reports

The platform core provides:

- Organizations and users
- Projects and contacts
- Template and branding management
- Managed records and revisions
- File storage and generated artifacts
- Status workflows and assignment
- Logs and exports
- Secure external sharing
- Audit history
- AI-assisted drafting and extraction

## Non-negotiable rules

- The database record is the source of truth; a PDF is an issued artifact.
- Issued revisions are immutable.
- Official sequence numbers are assigned by the server.
- Workflow transitions are enforced by the server.
- Files are stored in object storage, not inside D1 or definition JSON.
- Every tenant-owned row carries an organization identifier.
- External share links are scoped, expiring, revocable, and auditable.
- AI may propose content but may not issue, approve, number, publish, or delete official records.
- The current renderer and definition format remain reusable presentation infrastructure.
