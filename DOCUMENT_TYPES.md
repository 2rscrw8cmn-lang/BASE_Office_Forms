# BASE Studio Document Types

The studio uses one controlled-document model for all types below. Templates are
starting points: sections and blocks can be added, removed, reordered, and customized.

## Forms and records

- Controlled form
- Request / authorization form
- Supplemental form or annex
- Checklist / inspection sheet
- Request for Information (RFI)
- Submittal / transmittal
- Log / register
- Attendance or sign-in record
- Acknowledgment, waiver, or certification
- Signature / approval page

## Correspondence and administration

- Memorandum
- Business letter
- Cover sheet / transmittal
- Binder cover
- Master register / controlled index
- FAQ / reference binder

## Policies and operating documents

- Policy
- Procedure / standard operating procedure
- Safety manual
- Project manual
- Reference appendix

## Construction and business development

- Scope of work
- Proposal package
- Qualification statement
- Company profile
- Management-team profile
- Project / case-study sheet
- Client reference list
- Insurance, bonding, banking, and financial-capability summary

## Packages

- Safety manual package
- Proposal / qualifications package
- Bid or subcontract package
- Controlled forms binder
- Custom multi-document package

Packages generate a cover and index from their current document list whenever they are
rendered or exported. Every embedded package document can be opened and edited directly
inside the package. Users can add blank documents, blank forms, built-in templates, or
shared-library snapshots, then duplicate, reorder, or remove them without leaving the
package editor.

The shared library is stored in Cloudflare D1 and is available across browsers and
devices. Folders organize public templates; private edit links control who can update an
existing record. JSON exports remain portable disaster-recovery and interchange backups.

Forms and documents share the same block catalog. Narrative, tables, choices,
checklists, attachment references, review decisions, and signatures can be added to
either kind. Budgets, schedules, project contacts, revision histories, and evidence
logs are also reusable across both kinds. Package content remains made of controlled
form and document snapshots.

## Reference sources

The files under `public/assets/reference/` are retained as content and structure
references. They are not modified by the studio.
