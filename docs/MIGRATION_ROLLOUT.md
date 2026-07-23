# Migration and Rollout

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19


## 1. Goals

- Preserve the current shared library.
- Avoid a big-bang rewrite.
- Import enough real data to validate the product.
- Maintain traceability to Notion and existing files.
- Allow rollback during the pilot.
- Stop duplicate entry only after acceptance gates pass.

## 2. Current sources

### Existing application

- D1 `folders`
- D1 `documents`
- definition JSON
- edit tokens
- packages
- browser-generated PDFs and JSON backups

### Notion

- Projects
- RFIs
- Submittals
- Vendors and project vendors
- project routing callouts
- attachments and returned files where present

### External file systems

- OneDrive/project folders
- email attachments
- PDF forms
- vendor submittal packages

## 3. Classification of current library items

Every current shared-library document is classified as one of:

- reusable template candidate
- controlled document candidate
- standalone reference document
- project-record artifact
- package
- obsolete/test

Classification is metadata. Do not move or delete items during initial classification.

## 4. Notion mapping

## 4.1 Projects

Map:

| Notion | Target |
|---|---|
| Name / Full Project Name | project name |
| Short Name | short name |
| Project Number | internal project number |
| client/architect numbers in notes | explicit external number fields |
| Architect | contact/project role |
| Owner | contact/company role |
| Client | contact/company role |
| Address | structured address |
| Status | normalized project status |
| Vendors / Project Vendors | contacts and project contacts |

Data-quality rule:

Project number `261820046` and routing number `8722265100` are not merged. They are imported into separately labeled fields after owner confirmation.

## 4.2 RFIs

Map:

| Notion | Target |
|---|---|
| ID# | sequence number |
| RFI Sender ID | display number |
| Project | project relation |
| Subject | title |
| Question | question |
| Suggestion | contractor suggestion |
| Response | response |
| Submit Date | issued date |
| Returned Date | response date |
| Status Potential | draft |
| Status Open | open |
| Status Closed | closed |
| File / page attachment | typed record files |
| Page # | drawing reference |

Data-quality rules:

- Verify `ID#` and display number agree.
- Closed records with response but no returned date are flagged.
- Potential records with submit dates are flagged for interpretation.
- Files in page bodies are imported as attachments with source location.
- No number is automatically reused.
- Existing official numbers are preserved.

## 4.3 Submittals

Map:

| Notion | Target |
|---|---|
| Log ID | parsed stable number and revision |
| Description | description |
| Projects | project |
| Vendor / Project Vendors | vendor contact |
| Submitted | revision submitted date |
| Response | revision returned date |
| Approval Status | normalized workflow and disposition |
| Approved Submittal | returned review file |
| Notes | internal notes |
| Sent | legacy distribution indicator |
| Aging | recalculated |
| Email Subject | regenerated |

Status normalization:

| Notion status | Target workflow | Target disposition |
|---|---|---|
| Expected | expected | null |
| In Review | under_review | null |
| In Review - Over Due | under_review | null; overdue calculated |
| Approved | returned/closed | approved |
| Approved As Noted | returned/closed | approved_as_noted |
| Rejected - Resubmit | returned | revise_and_resubmit |
| Rejected - Resubmitted | revision-dependent | revise_and_resubmit on prior revision |
| Closed - No Action | closed | no_action_required |

`Sent` imports as legacy metadata only. It does not create a precise delivery event unless recipient and date evidence exist.

## 5. Import mechanics

Each import runs as a batch:

1. Export or query source data.
2. Normalize source identifiers.
3. Validate required fields.
4. Create or match project/contact.
5. Create target object in import mode.
6. Preserve original number and dates.
7. Attach source URL/external ID.
8. Import files or record unresolved file pointers.
9. Write migration-source row.
10. Produce exception report.

Import mode bypasses normal numbering assignment but still enforces uniqueness.

## 6. Pilot project

Use OHPA Conway because it contains:

- active project routing rules
- internal and external project-number ambiguity
- draft/potential and closed RFIs
- responses without returned dates
- structured submittal log IDs
- approved and approved-as-noted submittals
- multiple vendors
- files and blank Notion detail pages

## 7. Pilot sequence

### Step 1 — Read-only import

- Import project, contacts, RFIs, and selected submittals.
- Compare against Notion.
- No writes back to Notion.
- No official issuance from the new system.

### Step 2 — RFI parallel run

- New RFIs are created in the new system.
- Notion receives only a reference/link if required.
- Compare generated PDF and log.
- Confirm routing and numbering.

### Step 3 — RFI cutover

- New system becomes RFI source of truth.
- Notion RFI view becomes read-only/archive.
- Existing Notion URLs remain in migration metadata.

### Step 4 — Submittal parallel run

- Select one live submittal.
- Complete submission, return, and distribution.
- Validate large-file handling and revision history.

### Step 5 — Submittal cutover

- New system becomes submittal source of truth.
- Notion submittal database becomes read-only/archive.

## 8. Acceptance reconciliation

For each migrated object verify:

- project
- number
- title/description
- status
- dates
- response/disposition
- vendor/responsible party
- files
- source link

Produce counts:

- source rows
- imported rows
- skipped rows
- duplicate rows
- rows with warnings
- unresolved files

## 9. Rollback

During parallel run:

- Notion remains readable.
- New records carry source-of-truth indicator.
- No destructive source updates.
- New system data can be exported.

Rollback procedure:

1. Pause issuance in new system.
2. Export records created after pilot start.
3. Re-enter only missing official records into the prior process.
4. Preserve generated PDFs and audit logs.
5. Mark pilot records suspended; do not delete.
6. Fix issue and rerun migration if appropriate.

After final cutover, rollback is a business continuity procedure, not a database deletion.

## 10. Existing application migration

The current shared-library `documents` remain available.

Incremental enhancements:

1. Add organization ownership.
2. Add classification.
3. Identify template candidates.
4. Create template versions from selected definitions.
5. Link migrated items to new templates/records.
6. Keep original document row and edit link during transition.

Do not transform every current document automatically.

## 11. File migration

Priority:

1. official issued PDF
2. returned/approved PDF
3. source package
4. supporting attachments
5. historical reference

For files that cannot be retrieved automatically:

- create unresolved file reference
- preserve source path/URL
- assign owner
- show migration warning
- do not pretend the file was imported

## 12. Training and operating procedures

Before cutover publish:

- RFI creation and issue procedure
- RFI response and closure procedure
- Submittal creation and revision procedure
- File naming/role procedure
- Project routing setup procedure
- Log export procedure
- Permission escalation procedure
- outage/manual continuity procedure

## 13. Success measures

- No duplicate official numbers
- No missing issued/returned file in pilot
- RFI log produced without manual re-entry
- Submittal revision history understandable to a new PM
- Reduced duplicate entry between Notion and PDF tool
- PM can find current responsible party quickly
- External recipient sees only intended record/artifact

## 14. RFI Slice 1 schema reconciliation

Migration 0014 is a forward reconciliation from the temporary `rfi_records`
model to the Records → Revisions → Files spine. Its stable RFI ID becomes the
Record ID and `rfi_0014_reconciliation` preserves the legacy-to-record/draft
mapping. The detailed preview topology, rehearsal, human approval points,
backup, maintenance gate, reconciliation, monitoring, forward-fix, and rollback
limits are in `RFI_SLICE_1_ROLLOUT.md`. This PR performs no production migration.
