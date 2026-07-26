# Domain Model

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19


## 1. Purpose

This document defines the nouns used by the product. Code, database names, API resources, and interface labels should use these meanings consistently.

## 2. Organization

An organization is the tenant boundary.

Examples:

- BASE Construction
- A future contractor customer
- An architecture firm
- A healthcare owner organization

Rules:

- Organization data is isolated from every other organization.
- Branding, numbering defaults, templates, users, and retention policy belong to an organization.
- A user may belong to more than one organization.

## 3. User and membership

A user is a human identity.

A membership connects a user to an organization and grants a role.

Initial roles:

| Role | Purpose |
|---|---|
| Organization Admin | Users, organization settings, retention, integrations |
| Document Control Admin | Templates, controlled documents, numbering, project setup |
| Project Manager | Full project record control |
| Contributor | Create and edit assigned drafts; upload files |
| Viewer | Read project records and downloads |
| External Recipient | Not a membership; access only through scoped share links |

Permissions are checked against both role and project access.

## 4. Project

A project is a first-class business entity.

A project contains structured data:

- name
- short name
- internal project number
- client project number
- architect project number
- owner project number
- address
- status
- start/end dates
- routing defaults
- project members
- external contacts

A project owns records but does not own reusable templates.

A project is not a folder.

## 5. Contact

A contact represents an external or internal project participant.

Examples:

- Architect
- Owner representative
- Vendor contact
- Engineer
- Subcontractor
- Consultant

Contacts may belong to an organization-level directory and be connected to projects with project-specific roles and routing preferences.

## 6. Template

A template is reusable presentation and field configuration.

A template has a stable identity such as:

- BASE RFI
- BASE Submittal Cover
- Safety Inspection
- Meeting Minutes

A template is not an issued record.

## 7. Template version

A template version is an immutable published snapshot containing:

- definition JSON
- binding schema
- default values
- supported record type
- renderer schema version
- branding behavior
- publication metadata

Draft template versions can be edited. Published versions are immutable.

Existing project records continue referencing the version used when created or issued.

## 8. Controlled document

A controlled document is an organization-owned policy, procedure, manual, or controlled form.

Examples:

- Safety Manual
- Quality Control Procedure
- RFI Procedure
- Employee Acknowledgment Form

A controlled document has business ownership and lifecycle independent of project records.

## 9. Controlled document revision

A controlled document revision is an immutable published revision with:

- revision number
- effective date
- approver
- superseded revision
- render payload
- artifact
- acknowledgment requirement

Publishing a new revision supersedes the prior active revision but does not delete it.

## 10. Project record

A project record is a managed business transaction.

Examples:

- RFI-004
- Submittal 06-6410-01
- Inspection 018
- Meeting Minutes 007

A project record stores the current business state.

Common fields:

- project
- record type
- sequence
- display number
- title
- workflow status
- current responsible party
- due date
- source template version
- current revision number
- created, issued, returned, and closed timestamps

The record is the source of truth, not the generated PDF.

## 11. RFI record

An RFI record adds:

- question
- contractor suggestion
- drawing/spec references
- requested response date
- response
- cost impact
- schedule impact
- responder
- response received date

The official RFI number is assigned when the RFI is first issued.

A draft may display “Unnumbered Draft.”

The first official issue is a coordinated event, not a normal record update.
It preserves the stable RFI/Record ID, atomically assigns the project-scoped
number, transitions `ready_to_issue` to `open`, and publishes the authoritative
shared revision. The shared model starts at internal revision 1, so the first
issued RFI is presented to users as **Original Issue** rather than forcing an
incompatible revision 0.

An official RFI issue owns immutable evidence:

- the exact published template version and definition;
- the frozen render payload and renderer version;
- the official PDF file metadata and checksum;
- the included file snapshots;
- To/CC contact snapshots;
- the generic issuance identity, issuer, and issued timestamp.

Later project, contact, template, renderer, response, or close changes do not
regenerate or mutate that evidence.

## 12. Submittal record

A submittal record represents the stable submittal item across revision cycles.

It adds:

- specification section
- item sequence
- description
- vendor
- submitter
- reviewer
- required-on-site date
- workflow status
- current review disposition

The stable base number is:

```text
{spec section}-{item sequence}
06-6410-01
```

Each submitted revision adds:

```text
{base number}-{revision}
06-6410-01-00
06-6410-01-01
```

## 13. Record revision

A record revision is a frozen issue or submission event.

It contains:

- revision number
- issue type
- status at issue
- issue timestamp
- issuer
- recipients
- frozen render payload
- attached source files
- generated artifact
- response/disposition when returned
- returned files

An RFI may have one main issued revision plus response and clarification events.
The official issue promotes the existing authoritative revision rather than
creating a competing RFI-only revision relationship.

A submittal normally has multiple formal revisions.

## 14. File

A file is an object stored in R2 with D1 metadata.

Metadata includes:

- organization
- object key
- original file name
- media type
- byte size
- checksum
- upload user
- upload timestamp
- security status
- retention state

A file has no business meaning until attached with a role.

## 15. Record file

A record file connects a file to a record or revision with a role.

Initial roles:

- supporting attachment
- source document
- issued package
- response attachment
- returned review
- approved record copy
- generated artifact
- reference drawing
- cover sheet

The same physical file may be referenced from multiple records without duplication if permitted.

## 16. Artifact

An artifact is a generated output.

Examples:

- Issued RFI PDF
- Submittal cover sheet
- Combined submittal package
- Project RFI log PDF
- Project submittal log XLSX
- Controlled manual PDF

Artifacts are immutable and checksum-addressed.

## 17. Delivery

A delivery is a formal distribution event.

It records:

- what revision/artifact was delivered
- sender
- recipients
- CC recipients
- delivery channel
- message subject/body snapshot
- delivery timestamp
- delivery result

Email is a channel. The delivery event is the system record.

## 18. Share link

A share link grants external access to a specific scope.

Scope examples:

- view one artifact
- download one package
- view one record
- submit a response
- view a filtered log

A share link has:

- token hash
- permission scope
- expiration
- revocation
- optional recipient binding
- access log

## 19. Activity event

An activity event is an append-only audit entry.

It answers:

- who
- did what
- to which object
- when
- from what prior state
- to what new state
- with what correlation or request ID

Sensitive values are redacted from event metadata.

## 20. Log

A log is a query definition over project records.

Examples:

- All RFIs
- Open RFIs
- Overdue RFIs
- Submittals under review
- Submittals required this month

A working log is not stored as manually entered rows.

A log export is an artifact.

## 21. Branding profile

A branding profile provides organization presentation settings:

- logo
- accent and neutral colors
- fonts from the supported system set
- header/footer rules
- divider style
- checklist style
- default notices
- address and contact information

Branding is applied during rendering. Template content remains logically separate.

## 22. Terms that must not be conflated

| Incorrect conflation | Correct distinction |
|---|---|
| Template = RFI | Template creates an RFI record |
| RFI = PDF | RFI is the record; PDF is an artifact |
| Folder = Project | Folder organizes library items; project owns managed records |
| Save version = Revision | Save version prevents conflicts; revision is a business issue |
| Status = Disposition | Workflow status tracks movement; disposition is reviewer outcome |
| Sent checkbox = Delivery | Delivery is a timestamped recipient event |
| Attachment = Record | Attachment supports a record or revision |
| Log = Document | Working log is a query; exported log is an artifact |
