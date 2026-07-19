# Operations and Support Runbook

**Status:** Architecture v1.0 — operational baseline

## 1. Environments

- **Local:** developer-specific D1/R2 emulation and non-production identity.
- **Preview:** per-branch deployment with isolated or explicitly shared test resources.
- **Staging:** production-like configuration and sanitized fixtures.
- **Production:** BASE operational data.

Production credentials and data must never be used in preview environments.

## 2. Environment configuration

Required logical bindings:

- D1 database
- R2 bucket
- authentication/Access configuration
- artifact rendering service configuration
- email provider credentials
- application origin
- secure-share signing/pepper secret
- AI provider credentials when enabled
- observability destination

Configuration validation runs at deploy/startup and fails closed for missing critical bindings.

## 3. Deployment sequence

1. Confirm release commit and approved PR.
2. Verify CI and security gates.
3. Confirm database backup/export.
4. Apply backward-compatible migrations.
5. Deploy application code.
6. Run smoke tests.
7. Enable feature flag for internal testers.
8. Observe logs and metrics.
9. Expand rollout only after acceptance.

Do not deploy code that requires a schema migration before the migration is available.

## 4. Smoke tests

- `/api/v2/health` reports healthy dependencies.
- authenticated `/me` works.
- project directory loads.
- OHPA Conway opens.
- RFI log loads.
- a test draft can be created and deleted.
- file upload/download works in the test project.
- renderer preview succeeds.
- no cross-tenant fixture is visible.

Official issue tests in production use a designated test project only.

## 5. Backups

### D1

- Scheduled export/backup according to Cloudflare capability and business recovery target.
- Backup before migration and pilot cutover.
- Periodic restore test to a non-production environment.

### R2

- Versioning/retention strategy where available.
- Object inventory linked to database file IDs.
- Never rely on user-local browser downloads as the authoritative backup.

### Definitions and artifacts

Definition JSON and artifact metadata are backed up with D1; binary artifacts remain in R2.

## 6. Recovery objectives

Initial internal targets:

- RPO: 24 hours maximum, with a goal of materially lower for D1 changes.
- RTO: 8 business hours for core record viewing; 24 hours for full issue/delivery capability.

These targets must be revisited before external commercialization.

## 7. Incident severity

- **SEV-1:** cross-tenant exposure, data loss, unauthorized official action, widespread inability to access official records.
- **SEV-2:** core issue/submittal workflow unavailable, numbering/artifact inconsistency, widespread upload failure.
- **SEV-3:** degraded feature with workaround, isolated delivery failure, export issue.
- **SEV-4:** cosmetic or low-impact defect.

## 8. Incident response

1. Acknowledge and assign incident lead.
2. Preserve evidence and request IDs.
3. Disable affected feature flag or route if needed.
4. Stop destructive/repeated jobs.
5. Assess data exposure/integrity.
6. Restore safe read access when possible.
7. Communicate status to affected users.
8. Repair with auditable scripts/migrations.
9. Verify reconciliation.
10. Complete post-incident review.

## 9. Numbering incident

If duplicate or skipped numbering is suspected:

- disable issue actions for affected project/record type;
- do not manually renumber issued records;
- inspect sequence counter, idempotency key, revision, artifact, and activity records;
- determine whether the apparent duplicate is display-only or persisted;
- repair through an approved migration/script;
- retain original event history and record administrative correction;
- reconcile exported logs and deliveries.

Skipped numbers caused by voided/failed official attempts are acceptable only when the system records why. Numbers are never reused.

## 10. Artifact-rendering incident

- Preserve revision snapshot and failed job metadata.
- Mark artifact generation failed without reverting the official record unless the issue transaction was designed to remain pending.
- Permit authorized regeneration as a new artifact linked to the same immutable revision.
- Never overwrite a prior artifact.
- Record renderer version and reason.

## 11. File incident

For missing or corrupt file:

- revoke download/share access if integrity is uncertain;
- verify R2 object key, checksum, size, and database metadata;
- check quarantine and upload-completion events;
- restore from object version/backup if available;
- attach replacement as a new file record;
- document administrative action.

## 12. Delivery incident

- Delivery failure does not invalidate the issued record.
- Inspect delivery and attempt records.
- Confirm recipient snapshots and artifact list.
- Retry idempotently or create a new delivery attempt.
- Do not alter historical recipient data.
- Record manual delivery when performed outside the provider.

## 13. Secure-share incident

For suspected token exposure:

- revoke the link immediately;
- inspect access events;
- create a new link with narrower scope/expiry;
- notify record owner;
- determine whether files were downloaded;
- escalate based on data sensitivity.

## 14. User access support

- Verify authenticated identity and organization membership.
- Verify project membership/effective role.
- Do not bypass authorization by sharing raw R2 URLs or edit tokens.
- Temporary elevation requires administrator action and audit event.
- Departed users are deactivated; their historical actions remain attributed.

## 15. Data correction

Operational users correct draft data through the UI. Issued-record correction requires one of:

- new revision;
- reopen/clarification workflow;
- void and replacement;
- audited administrative correction for metadata that does not alter official content.

Direct production SQL is last resort and requires:

- approved script;
- backup;
- dry run;
- transaction;
- before/after report;
- activity/administrative event;
- peer review.

## 16. Monitoring

Track:

- request error rate and latency;
- authentication failures;
- authorization denials and suspicious patterns;
- issue transaction failures;
- sequence conflicts;
- artifact job duration/failure;
- file upload completion failures;
- delivery failure/retry rate;
- share-link access anomalies;
- D1/R2 availability;
- AI job cost/failure when enabled.

Alerts must avoid including document contents or tokens.

## 17. Routine maintenance

Weekly during pilot:

- review failed jobs and deliveries;
- reconcile orphaned upload intents/files;
- review overdue record calculations;
- review support feedback;
- confirm backups.

Monthly:

- restore test sample;
- dependency/security review;
- inactive user review;
- expired share cleanup;
- storage inventory reconciliation;
- architecture decision review.

## 18. Pilot cutover support

During OHPA Conway cutover:

- designate one workflow owner;
- retain Notion read access;
- conduct daily reconciliation for first week;
- prohibit parallel official numbering after cutover;
- log all exceptions;
- hold a go/no-go review before submittal cutover.

## 19. Support information shown to users

Server errors provide a request ID and safe message. The support view should allow administrators to retrieve safe diagnostic metadata by request ID without exposing secrets or unrelated tenant data.

## 20. Post-incident review template

- Summary
- Timeline
- Impact
- Detection
- Root cause
- Contributing factors
- Data integrity/exposure assessment
- Resolution
- Recovery verification
- What worked
- What failed
- Corrective actions with owners/dates
- Architecture or runbook changes
