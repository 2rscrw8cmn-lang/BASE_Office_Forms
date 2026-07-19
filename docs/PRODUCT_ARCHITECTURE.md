# Product Architecture

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19


## 1. Executive direction

BASE Forms & Documents Kit will become a project-centered document management and control platform.

The current application already solves the presentation problem well:

- One JSON definition format
- One renderer
- One visual system
- Form, document, and package editing
- Shared D1 library
- Portable JSON backup
- Public view/fill links and private edit tokens

The next product layer must solve the operational problem:

- What project does this belong to?
- What type of managed record is it?
- What is its official number?
- What is its current workflow status?
- Who owes the next action?
- Which files belonged to each issue or revision?
- What was formally issued?
- What changed?
- Who viewed, downloaded, sent, approved, or closed it?
- Can a project log be exported without manually rebuilding it?

The renderer remains. A new domain layer becomes the source of truth.

## 2. Product boundary

### The platform owns

- Organizations, memberships, and permissions
- Projects, project identifiers, contacts, and routing rules
- Reusable templates and template versions
- Controlled company documents and revisions
- Project records such as RFIs and submittals
- Record workflow, assignments, due dates, and sequence numbers
- Files, attachments, returned documents, and generated artifacts
- Logs, exports, deliveries, external shares, and audit events
- AI-assisted drafting, extraction, comparison, and validation

### The renderer owns

- Layout and visual identity
- Form fields and document blocks
- Page setup and pagination
- Package assembly
- Browser preview
- PDF-ready rendering
- Definition import/export

### The platform does not initially own

- General-purpose email inboxes
- Full accounting or ERP
- Scheduling/CPM
- Drawing markup
- BIM coordination
- General file sync replacing OneDrive or SharePoint
- Contract administration outside the defined record workflows

## 3. Core distinction

```text
Template
  reusable layout and field configuration

Project Record
  live structured data and workflow state

Record Revision
  frozen issue, response, or resubmission event

Artifact
  generated PDF or export representing a frozen revision

Attachment
  supporting source or returned file

Log
  query-driven view of records; never manually maintained
```

A template is not an RFI. An RFI record is not its PDF. A PDF is not the audit history.

## 4. Target system topology

```text
Browser application
├── Existing document studio and renderer
├── Project workspace
├── RFI and submittal logs
├── Record detail/editor
├── File manager
└── Admin and template settings

Cloudflare Pages / Workers API
├── Authentication adapter
├── Tenant authorization
├── Projects service
├── Templates service
├── Records and workflow service
├── Numbering service
├── Files and artifacts service
├── Shares and deliveries service
├── Export service
├── Audit service
└── AI orchestration service

Storage
├── D1: relational data, metadata, workflow, audit, indexes
├── R2: uploads, returned files, generated PDFs, export packages
└── Queue/worker: rendering, extraction, notifications, scanning
```

## 5. Architectural principles

### 5.1 Relational records, JSON rendering

Operationally searchable data is stored in relational columns. Document presentation remains JSON-driven.

Use a hybrid model:

- Common record fields in `records`
- RFI-specific query fields in `rfi_details`
- Submittal-specific query fields in `submittal_details`
- Flexible secondary content in `data_json`
- Frozen render payload on each issued revision

Do not build the product on an entity-attribute-value schema.

### 5.2 Immutability after issue

Drafts may be edited.

Once a revision is issued, its:

- rendered payload
- attached files
- recipients
- issue timestamp
- official number
- generated artifact

are immutable.

Corrections create a new revision or event.

### 5.3 Append-only history

Meaningful actions produce activity events:

- created
- assigned
- issued
- viewed
- downloaded
- responded
- disposition recorded
- revised
- closed
- reopened
- shared
- revoked
- exported

The event stream is not the primary database model, but it is the authoritative audit trail.

### 5.4 Tenant-aware from the first migration

Every organization-owned row includes `organization_id`.

The API derives organization context from the authenticated session. Client-provided organization IDs are never trusted for authorization.

### 5.5 Construction first, platform second

RFI and submittal workflows are implemented explicitly and well. Generic record-type configuration is not allowed to weaken construction usability.

New industries may add record types later through:

- record-type configuration
- templates
- workflow definitions
- field schemas
- export mappings

### 5.6 AI is assistive

AI may draft and extract. Deterministic application code controls:

- numbering
- permissions
- state transitions
- issuance
- approval
- deletion
- retention
- final file association

## 6. Application modules

### 6.1 Home and global search

Search across:

- projects
- records
- templates
- controlled documents
- file names
- record numbers
- contacts

Search results must identify the object type and project context.

### 6.2 Projects

Each project provides:

- project profile
- identifiers
- team and external contacts
- routing defaults
- RFIs
- submittals
- other record types
- recent activity
- logs and exports
- project files linked to records

A Project is not implemented as a folder.

### 6.3 Template library

Templates have stable identity and immutable published versions.

Templates support:

- definition JSON
- field bindings
- default workflow
- numbering scheme
- organization branding
- industry/category tags
- draft/published/retired states

### 6.4 Controlled documents

Company policies, manuals, procedures, and controlled forms have:

- owner
- revision
- effective date
- approval state
- published artifact
- superseded relationship
- acknowledgment requirements where applicable

### 6.5 Project records

The first record types are RFI and submittal.

All project records share:

- project
- record type
- title
- sequence
- display number
- workflow status
- assignee/current responsible party
- created/issued/due/closed dates
- current revision
- source template version
- files
- events
- deliveries
- shares

### 6.6 Logs and exports

Working logs are interactive database views.

Exports are generated artifacts:

- PDF
- CSV
- XLSX

A log export records:

- filter criteria
- sort order
- generated timestamp
- generating user
- project
- file artifact

## 7. Authentication strategy

### Internal pilot

Protect the application with Cloudflare Access and normalize the authenticated identity into application users and memberships.

### Productized application

Replace the Access adapter with an OIDC/SAML-capable identity provider without changing domain tables.

The domain model is vendor-neutral:

- external identity subject
- email
- display name
- organization membership
- role

External recipients use scoped share tokens and do not become organization members.

## 8. Compatibility with the current application

The current `documents` and `folders` tables remain operational during migration.

They become the legacy shared library and continue serving:

- standalone forms
- standalone documents
- packages
- template candidates

New domain tables are additive. The renderer continues reading definition JSON.

A record artifact is produced by compiling:

```text
template version
+ organization branding
+ project data
+ record data
+ selected revision
= render definition / render payload
```

The compiled payload is passed to the existing renderer.

## 9. Quality attributes

The implementation must prioritize:

1. Data integrity
2. Auditability
3. Simple project-manager workflow
4. File reliability
5. Security and tenant isolation
6. Export quality
7. Mobile usability
8. Extensibility
9. Performance
10. AI capability

## 10. Initial release definition

The first production-capable release is complete when BASE can run one live project without maintaining the same RFI data in Notion and a separate PDF tool.

Minimum capability:

- authenticated internal users
- projects and contacts
- project routing
- project-specific RFI sequence
- RFI draft, issue, response, and closure
- supporting files
- frozen issued PDF
- RFI log
- PDF/CSV/XLSX log export
- activity history
- secure project access
- migration of a pilot project's active RFIs

Submittals follow on the same architecture after the RFI vertical slice is stable.
