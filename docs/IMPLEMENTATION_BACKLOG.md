# Implementation Backlog

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19


This backlog is organized as issue-ready epics. IDs are stable planning references, not GitHub issue numbers.

## Definition of done

A work package is done only when:

- production code is complete
- migrations are reversible or rollback is documented
- permission and tenant checks exist
- automated tests cover success and failure
- activity events are written where applicable
- loading, empty, error, and conflict UI states exist
- mobile layout is usable
- documentation and API contracts are updated
- existing shared-library checks pass

## Epic FND-01 — Repository and test foundation

- FND-01.1 Add test runner and scripts.
- FND-01.2 Add unit-test directory and fixtures.
- FND-01.3 Add D1 integration-test harness.
- FND-01.4 Add browser end-to-end harness.
- FND-01.5 Add renderer golden fixtures.
- FND-01.6 Add CI workflow for build, typecheck, functions build, and tests.
- FND-01.7 Add correlation-ID middleware.
- FND-01.8 Add standard API error response.

Acceptance:

- `npm run check` includes tests.
- A failed migration/test blocks merge.
- Existing document render fixtures remain stable.

## Epic FND-02 — Definition schema

- FND-02.1 Convert `SCHEMA.md` rules into versioned JSON Schema.
- FND-02.2 Validate definitions in browser and API.
- FND-02.3 Add schema version to definitions.
- FND-02.4 Add migration/normalization for older definitions.
- FND-02.5 Add validation error UI.
- FND-02.6 Add test definitions for RFI and submittal.

Acceptance:

- Invalid nested block data is rejected.
- Current valid definitions still load.
- Errors identify the field path.

## Epic IAM-01 — Authentication adapter

- IAM-01.1 Define `AppSession`.
- IAM-01.2 Implement Cloudflare Access adapter.
- IAM-01.3 Add user upsert by verified identity subject.
- IAM-01.4 Add organization membership lookup.
- IAM-01.5 Add session endpoint.
- IAM-01.6 Add sign-out/access-denied UI.
- IAM-01.7 Add local development identity fixture.

Acceptance:

- Business services depend on `AppSession`, not raw headers.
- Disabled membership cannot access the app.

## Epic IAM-02 — Authorization and tenant isolation

- IAM-02.1 Add organizations.
- IAM-02.2 Add memberships and roles.
- IAM-02.3 Add project membership.
- IAM-02.4 Implement authorization policy functions.
- IAM-02.5 Enforce organization filters in repositories.
- IAM-02.6 Add cross-tenant tests.
- IAM-02.7 Return non-disclosing 404 responses.

Acceptance:

- Knowing another object UUID does not grant access.
- Every v2 endpoint has an authorization test.

## Epic PRJ-01 — Projects

- PRJ-01.1 Add project migrations.
- PRJ-01.2 Add project repository/service/API.
- PRJ-01.3 Add project list.
- PRJ-01.4 Add project detail.
- PRJ-01.5 Add internal/client/architect/owner project numbers.
- PRJ-01.6 Add address and status.
- PRJ-01.7 Add members.
- PRJ-01.8 Add project activity.
- PRJ-01.9 Add archive/restore.

Acceptance:

- OHPA Conway can be represented without ambiguous project-number labels.

## Epic PRJ-02 — Contacts and routing

- PRJ-02.1 Add contact directory.
- PRJ-02.2 Add project contacts.
- PRJ-02.3 Add project roles.
- PRJ-02.4 Add default To/CC/exclusion rules.
- PRJ-02.5 Add RFI routing preview.
- PRJ-02.6 Add submittal routing preview.
- PRJ-02.7 Snapshot recipients on issue.

Acceptance:

- OHPA routing to Ruben with Jim copied and exclusions is represented structurally.
- Later project-contact edits do not change prior delivery snapshots.

## Epic REC-01 — Record platform

- REC-01.1 Add records migration.
- REC-01.2 Add record revisions.
- REC-01.3 Add sequence counters.
- REC-01.4 Add activity events.
- REC-01.5 Add optimistic locking.
- REC-01.6 Add transition service.
- REC-01.7 Add idempotency service.
- REC-01.8 Add record timeline.
- REC-01.9 Add archive rules.

Acceptance:

- Two concurrent issue requests cannot produce duplicate numbers.
- Issued revisions cannot be edited through normal update endpoints.

## Epic RFI-01 — RFI data and UI

- RFI-01.1 Add RFI details table.
- RFI-01.2 Add RFI draft screen.
- RFI-01.3 Add references and attachments.
- RFI-01.4 Add due date/responsible party.
- RFI-01.5 Add impact fields.
- RFI-01.6 Add response entry.
- RFI-01.7 Add close/reopen/void actions.
- RFI-01.8 Add validation and conflict states.
- RFI-01.9 Add mobile layout.

Acceptance:

- RFI 004 and RFI 005 patterns from OHPA can be represented exactly.
- Closed RFI requires response and impact disposition.

## Epic RFI-02 — RFI issue and artifact

- [x] RFI-02.1 Create RFI template version.
- [x] RFI-02.2 Implement project binding.
- [x] RFI-02.3 Implement issue transition (`record_only` backend).
- [x] RFI-02.4 Generate frozen render payload.
- [x] RFI-02.5 Generate and privately persist issued artifact.
- [x] RFI-02.6 Snapshot recipients.
- [x] RFI-02.7 Add authorized artifact download through the existing RFI file
  route.
- RFI-02.8 Add final-closed artifact option.

- [x] RFI-02.9 Add the capability-gated browser mark-ready and official-issue
  workflow, browser-side idempotency, ambiguous-outcome and reconciliation
  handling, and issued-evidence presentation (Slice 2B; draft PR, not merged).

Slice 2A is complete in code and merged as PR #49; its closeout still requires
the guarded production rollout in `RFI_SLICE_2A_ROLLOUT.md`, which has not been
performed. Slice 2B adds the record-only issuance UI on
`feature/rfi-slice-2b-issuance-ui` and is awaiting review. Email, share-link,
and portal delivery remain separate later work, not hidden completion criteria
for the checked items above.

Acceptance:

- Record edits after issue do not alter the issued artifact.
- Voided issued number is not reused.

## Epic LOG-01 — RFI log

- LOG-01.1 Add project RFI query.
- LOG-01.2 Add open/closed/overdue filters.
- LOG-01.3 Add search and sorting.
- LOG-01.4 Add CSV export.
- LOG-01.5 Add XLSX export.
- LOG-01.6 Add PDF export.
- LOG-01.7 Store export artifact and query snapshot.

Acceptance:

- Export rows match the filtered screen.
- Export includes project identifiers and generated timestamp.

## Epic FIL-01 — R2 file platform

- FIL-01.1 Add R2 binding and configuration.
- FIL-01.2 Add files table.
- FIL-01.3 Add upload-session endpoint.
- FIL-01.4 Add direct upload.
- FIL-01.5 Add upload-complete verification.
- FIL-01.6 Add checksum.
- FIL-01.7 Add file-role attachments.
- FIL-01.8 Add signed downloads.
- FIL-01.9 Add quarantine/block states.
- FIL-01.10 Add orphan reconciliation.

Acceptance:

- 250 MB test file uploads without normal API-body proxy.
- Unauthorized project user cannot retrieve a signed URL.

## Epic SUB-01 — Submittal records

- SUB-01.1 Add submittal details table.
- SUB-01.2 Add expected-submittal planning.
- SUB-01.3 Add stable base numbering.
- SUB-01.4 Add revision `00`.
- SUB-01.5 Add source-file roles.
- SUB-01.6 Add vendor/reviewer.
- SUB-01.7 Add required-on-site date.
- SUB-01.8 Add workflow/disposition separation.

Acceptance:

- `06-6410-01-00` is represented as stable item plus revision.
- “In Review” cannot be saved as a disposition.

## Epic SUB-02 — Submission and review cycles

- SUB-02.1 Generate cover sheet.
- SUB-02.2 Generate issued package.
- SUB-02.3 Implement submit transition.
- SUB-02.4 Add returned-review file.
- SUB-02.5 Add disposition transition.
- SUB-02.6 Add resubmission creation.
- SUB-02.7 Add prior-comment carryover.
- SUB-02.8 Add closure/distribution guard.
- SUB-02.9 Add aging calculation.

Acceptance:

- Rejected revision remains immutable.
- New revision increments without consuming a new stable item number.

## Epic LOG-02 — Submittal log

- LOG-02.1 Add expected/under-review/returned filters.
- LOG-02.2 Add aging and overdue calculation.
- LOG-02.3 Add disposition filter.
- LOG-02.4 Add vendor filter.
- LOG-02.5 Add PDF/CSV/XLSX export.
- LOG-02.6 Add revision-aware log display.

Acceptance:

- Current workflow state and latest disposition display separately.

## Epic TMP-01 — Template control

- TMP-01.1 Add templates and versions.
- TMP-01.2 Add draft editor.
- TMP-01.3 Add publish/retire.
- TMP-01.4 Add binding schema.
- TMP-01.5 Add template-version selection.
- TMP-01.6 Add renderer schema compatibility.
- TMP-01.7 Add legacy-document conversion action.

Acceptance:

- New template version does not alter prior issued records.

## Epic CTL-01 — Controlled documents

- CTL-01.1 Add controlled-document tables.
- CTL-01.2 Add revision workflow.
- CTL-01.3 Add approver and effective date.
- CTL-01.4 Add publish/supersede.
- CTL-01.5 Add immutable artifacts.
- CTL-01.6 Add current/superseded library views.

Acceptance:

- Only one active published revision exists at a time.

## Epic BRD-01 — Branding

- BRD-01.1 Add branding profile.
- BRD-01.2 Add logo upload.
- BRD-01.3 Add supported color/style settings.
- BRD-01.4 Apply profile at render compilation.
- BRD-01.5 Add preview.
- BRD-01.6 Preserve template content separation.

Acceptance:

- A second organization can render the same template with different branding.

## Epic SHR-01 — Secure shares

- SHR-01.1 Add share-link table.
- SHR-01.2 Generate hashed tokens.
- SHR-01.3 Add expiration and revocation.
- SHR-01.4 Add scoped external route.
- SHR-01.5 Add access events.
- SHR-01.6 Add download/view permission.
- SHR-01.7 Add optional response scope.

Acceptance:

- Token cannot access another object.
- Expired and revoked tokens fail immediately.

## Epic DLV-01 — Deliveries

- DLV-01.1 Add delivery and recipients.
- DLV-01.2 Add prepared subject/body.
- DLV-01.3 Add secure-link delivery.
- DLV-01.4 Add manual delivery recording.
- DLV-01.5 Add optional email adapter.
- DLV-01.6 Add retry and failure state.
- DLV-01.7 Replace “Sent” checkbox logic.

Acceptance:

- Delivery history identifies exact artifact and recipient snapshot.

## Epic AI-01 — AI foundation

- AI-01.1 Add provider-neutral adapter.
- AI-01.2 Add AI jobs.
- AI-01.3 Add prompt versions.
- AI-01.4 Add JSON Schema output validation.
- AI-01.5 Add proposal review UI.
- AI-01.6 Add apply-through-standard-API.
- AI-01.7 Add usage/cost tracking.
- AI-01.8 Add evaluation harness.

Acceptance:

- AI cannot call official transition services directly.

## Epic AI-02 — First AI capabilities

- AI-02.1 Build template from description.
- AI-02.2 Repair definition.
- AI-02.3 Draft RFI.
- AI-02.4 Extract submittal metadata.
- AI-02.5 Summarize returned review.
- AI-02.6 Compare revisions.

Acceptance:

- Each capability has a versioned schema and evaluation set.

## First implementation wave

Start in this order:

1. FND-01
2. FND-02
3. IAM-01
4. IAM-02
5. PRJ-01
6. PRJ-02
7. REC-01
8. RFI-01
9. RFI-02
10. LOG-01

Do not start SUB, SHR, DLV, or AI work before the RFI exit gate.
