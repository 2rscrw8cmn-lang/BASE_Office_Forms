# Implementation Roadmap

## 1. Delivery strategy

Build vertical slices that can replace a real workflow.

Do not begin with a generic workflow builder, full email client, custom branding studio, or broad AI chatbot.

The first proof of product is:

```text
Create project
→ create RFI
→ issue numbered PDF
→ receive response
→ close RFI
→ export project RFI log
```

Each phase has an exit gate. Work does not advance because screens exist; it advances when the business workflow is operational and tested.

## 2. Phase 0 — Architecture and platform foundation

### Objective

Prepare the current application for authenticated, tenant-aware domain records without breaking the shared library.

### Deliverables

- Formal definition JSON Schema
- `/api/v2` service structure
- D1 migration framework and schema versioning
- Organizations, users, memberships, and project access tables
- Authentication adapter
- Cloudflare Access internal pilot configuration
- Tenant-aware repository/service layer
- Standard API errors, correlation IDs, and idempotency
- Activity event service
- Unit/integration test foundation
- Legacy `/api/documents` regression tests

### Exit gate

- Authenticated user can load a session.
- Cross-tenant tests pass.
- Current shared library still works.
- Migrations apply cleanly to empty and existing databases.
- Definition validation rejects invalid structures without changing valid current documents.

## 3. Phase 1 — Projects and RFI vertical slice

### Objective

Replace the split Notion/PDF RFI workflow for one live project.

### Deliverables

#### Projects

- Project list and detail
- Multiple project-number fields
- address
- status
- internal members
- external contacts
- project routing rules
- project activity

#### RFI records

- RFI draft
- project-specific server numbering
- title, question, suggestion, references
- due date and responsible party
- supporting attachments
- workflow transitions
- response entry and response files
- cost/schedule impact
- close, reopen, void
- activity timeline

#### Rendering and logs

- RFI template binding
- issued RFI render payload
- immutable issued artifact
- project RFI table
- filters and search
- PDF/CSV/XLSX log export

### Pilot

OHPA Conway.

### Exit gate

- Active OHPA RFIs are represented in the system.
- A new RFI can be drafted, issued, answered, and closed without Notion.
- Number collision tests pass.
- Issued PDF remains unchanged after later record edits.
- RFI log matches the database.
- Project routing populates the correct recipients.
- User can identify internal, client, architect, and owner project numbers.

## 4. Phase 2 — R2 files and submittal lifecycle

### Objective

Replace the Notion submittal log and disconnected PDF/file process.

### Deliverables

#### File platform

- R2 binding
- direct upload sessions
- upload completion verification
- file metadata and checksum
- file roles
- signed downloads
- quarantine status
- orphan reconciliation

#### Submittals

- expected submittal planning
- stable item number
- revision `00` creation
- source package upload
- cover sheet generation
- combined issued package
- under-review aging
- returned-review upload
- separate workflow status and disposition
- approved/approved-as-noted closure
- revise-and-resubmit flow
- revision comparison view
- submittal log and exports
- distribution event replacing “Sent”

### Exit gate

- At least one OHPA submittal completes a full revision cycle.
- Prior revisions and files cannot be overwritten.
- Large uploads bypass normal Worker request bodies.
- Returned approval file is clearly separated from source files.
- Log shows current workflow state and review disposition correctly.
- Resubmission increments revision without changing the stable item number.

## 5. Phase 3 — Template control, controlled documents, and branding

### Objective

Turn the renderer/library into a governed organization system.

### Deliverables

- Templates and immutable template versions
- draft/publish/retire workflow
- field binding editor
- organization branding profile
- logo and supported style settings
- controlled document records
- controlled revision workflow
- approval and effective dates
- superseded revision handling
- artifact publication
- acknowledgment assignment foundation
- migration of selected current library documents into templates or controlled documents

### Exit gate

- Publishing a new template version does not alter existing issued records.
- Published controlled revisions are immutable.
- A new organization can apply its branding without editing template content.
- Legacy library documents remain accessible.

## 6. Phase 4 — Secure sharing, delivery, and external response

### Objective

Make controlled distribution possible without building an email client.

### Deliverables

- scoped share links
- expiration, revocation, and access logs
- artifact-only shares
- record-view shares
- response links for permitted RFI responses
- delivery records
- recipient snapshots
- prepared email subject/body
- optional email provider integration
- delivery retry/status
- external portal view
- watermark/download controls where required

### Exit gate

- Revoked or expired links cannot access files.
- External user cannot navigate beyond link scope.
- Every formal distribution has recipient and artifact history.
- Email failure does not corrupt record status or create duplicate issuance.

## 7. Phase 5 — Native AI assistance

### Objective

Eliminate repetitive formatting and extraction while preserving human control.

### Deliverables

- AI provider adapter
- job model
- prompt and output schema versioning
- template generation
- RFI drafting
- submittal metadata extraction
- returned-review summary
- revision comparison
- proposal review UI
- evaluation harness
- usage and cost controls
- organization AI settings

### Exit gate

- AI output always validates against schema.
- User reviews field-level proposals.
- AI cannot trigger official transitions.
- Evaluation thresholds are documented and met.
- Every applied proposal records prompt/model/version metadata.

## 8. Phase 6 — Productization

### Objective

Prepare for external organizations and commercial operation.

### Deliverables

- OIDC/SAML-capable identity adapter
- organization onboarding
- subscription and entitlement boundary
- tenant branding onboarding
- retention policies
- support/admin tooling
- data export and account deletion processes
- monitoring and recovery targets
- customer-facing audit exports
- template packs
- feature flags
- usage metering
- legal/privacy controls

### Exit gate

- New customer organization can onboard without engineering intervention.
- Tenant isolation has independent security review.
- Backup/restore exercise succeeds.
- Customer data export succeeds.
- Support can diagnose jobs using correlation IDs without accessing document contents by default.

## 9. Dependency chain

```text
Identity + tenant layer
→ Projects
→ Records + workflow
→ Numbering
→ Render revisions
→ R2 files
→ Submittal revisions
→ Shares and deliveries
→ AI
→ SaaS onboarding
```

Do not reverse this chain.

## 10. Work explicitly deferred

Until the applicable phase:

- Full email inbox/threading
- OneDrive as primary storage
- Generic no-code workflow builder
- Arbitrary custom roles
- Public marketplace
- Mobile native application
- Accounting integration
- Drawing markup
- Automatic AI issuance or approval
- Full customer billing

## 11. Release gates applying to every phase

- Migration tested
- Rollback documented
- Permission tests
- Cross-tenant negative tests
- Audit events
- Mobile layout checked
- Empty/loading/error states
- Accessibility basics
- Existing library regression
- Documentation updated
- No unresolved critical security findings
