# RFI Slice 2A Migration, Rollout, and Recovery

**Status:** Slice 2A is complete in code and merged as PR #49 (`f6b9462`); its
local rehearsal is complete. **No production deployment, migration, SQL, or R2
mutation has been performed** — the human-approved sequence below is still
outstanding.

RFI Slice 2B adds the record-only issuance UI on
`feature/rfi-slice-2b-issuance-ui` (draft PR; not merged) and changes nothing in
this document's migration, rollout, rollback, or reconciliation procedure: no
schema change, no endpoint change, and no server behaviour change. Two steps
below become browser-operable rather than manual once Slice 2B merges:

- step 8's pilot issue can be performed from the RFI workspace's **Issue RFI**
  workflow, which generates and preserves one `Idempotency-Key` per deliberate
  attempt and sends `deliveryMode: record_only`;
- step 8's **Return to draft** verification uses the overflow action in the
  ready-to-issue state.

The prohibition below is unchanged and is enforced by the UI: **Return to draft
is never offered, manually or automatically, as a recovery path for a renderer,
R2, D1, idempotency, or reconciliation failure.** An uncertain issue outcome
surfaces a support/reconciliation notice with its request ID and offers no retry
at all.

## Scope and compatibility

Migration `0015_rfi_official_issuance.sql` is additive and advances
`app_meta.schema_version` from 12 to 13. It adds official RFI snapshot,
idempotency, and orphan-reconciliation tables/triggers. It does not rebuild or
delete existing tables, update existing RFI rows, allocate numbers, create
issuances, or write R2.

Old application code does not depend on the new tables, so migration 0015 may
be applied before the Slice 2A application deployment. New Slice 2A code must
not receive issue traffic before 0015 is present.

## Rehearsal evidence

Automated Worker/D1 migration coverage:

- applies all migrations to an empty database and confirms schema version 13;
- stages a populated database through 0014 with an active project, published
  template, ready unnumbered RFI, authoritative revision, and sequence;
- applies 0015 and confirms the existing Record/details/revision/sequence are
  unchanged, no official issue was invented, and `PRAGMA foreign_key_check`
  returns no rows.

The application gate additionally proves that an incomplete or invalidly
routed draft cannot be marked ready, a complete draft can be marked ready and
intentionally returned to draft before issue, and a committed/numbered issue
cannot race back to draft.

Run locally:

```text
npx vitest run tests/integration/rfi-official-issuance-migration.test.ts --config vitest.worker.config.mts
npm run check
```

## Human-approved production sequence

1. Freeze official RFI issue actions. Existing draft/register/workspace use may
   continue because 0015 is additive.
2. Confirm current production deployment and migration ledger. Expect
   `0001`–`0014`, with 0015 pending.
3. Create and verify a D1 export/backup. Capture a read-only inventory of
   current RFI-related R2 keys.
4. Run the local populated rehearsal and full `npm run check` on the exact
   release commit.
5. Apply pending migrations with explicit human approval:

   ```text
   npx wrangler d1 migrations apply base-office-forms-library --remote
   ```

6. Verify schema before deploying code:

   ```sql
   SELECT schema_version FROM app_meta WHERE id = 1;
   SELECT name FROM sqlite_master
   WHERE type = 'table' AND name IN (
     'rfi_official_issues',
     'rfi_issue_recipients',
     'rfi_issue_file_snapshots',
     'idempotency_keys',
     'rfi_artifact_orphans'
   )
   ORDER BY name;
   PRAGMA foreign_key_check;
   ```

   Expect schema version 13, all five tables, and no foreign-key-check rows.

7. Merge only after approval, then wait for the production Pages deployment
   built from the reviewed commit to succeed.
8. Perform one authorized synthetic/pilot issue from `ready_to_issue` using a
   unique `Idempotency-Key` and `deliveryMode: record_only`. Confirm:
   - response is `open`, has `RFI-###`, `Original Issue`, `ISS-###`, artifact,
     recipients, and request ID;
   - same key/same request replays the result;
   - the official PDF downloads through the authorized RFI attachment route;
   - exactly one matching row exists in `rfi_official_issues`, `issuances`,
     generated `revision_files`, idempotency results, and `rfi.issued`
     activity;
   - the promoted revision is the persisted `records.current_revision_id`;
   - no pending orphan row exists.
     Before the pilot issue, verify **Return to draft** once on a separate
     unnumbered ready fixture: the activity is written, PATCH editing works only
     after return, and marking ready again succeeds. Never use this action to
     recover a renderer, R2, D1, idempotency, or reconciliation failure.
9. Monitor Worker exceptions, D1 constraint errors, issue request IDs, R2
   write/delete errors, and pending orphan rows before enabling broader use.

## Post-deploy reconciliation

Read-only invariants:

```sql
SELECT COUNT(*) AS invalid_issue_relationships
FROM rfi_official_issues issue
LEFT JOIN records record ON record.id = issue.rfi_id
LEFT JOIN record_revisions revision ON revision.id = issue.revision_id
LEFT JOIN revision_files artifact ON artifact.id = issue.artifact_file_id
LEFT JOIN issuances issuance ON issuance.id = issue.issuance_id
WHERE record.id IS NULL
   OR record.current_revision_id <> issue.revision_id
   OR record.workflow_status <> 'open'
   OR revision.status <> 'published'
   OR artifact.role <> 'generated_artifact'
   OR issuance.record_id <> issue.rfi_id;

SELECT rfi_id, COUNT(*) AS issue_count
FROM rfi_official_issues
GROUP BY rfi_id HAVING COUNT(*) > 1;

SELECT organization_id, project_id, record_type_key, last_number
FROM project_record_type_sequences
WHERE record_type_key = 'rfi'
ORDER BY organization_id, project_id;

SELECT id, organization_id, project_id, rfi_id, artifact_storage_key,
       failure_summary, detected_at
FROM rfi_artifact_orphans
WHERE reconciliation_status = 'pending'
ORDER BY detected_at;
```

Expect zero invalid/duplicate rows. Sequence values must be at least the maximum
committed RFI sequence for their project and must never be decremented.

## Rollback and forward recovery

Because 0015 is additive, application rollback is the preferred first action:
disable issue traffic and redeploy the previous known-good application commit.
Leave the new tables and committed official rows intact. Old code will ignore
them. Do not drop tables, delete official snapshots, decrement sequences, or
delete committed official R2 objects.

For a defect before any successful issue, deploy a forward code fix or revert
the application while retaining 0015. For a defect after a successful issue,
preserve the number, revision, issuance, artifact, snapshots, activity, and
idempotency result; use a reviewed forward migration or compensating business
workflow. Never rerun an applied migration manually.

## Artifact reconciliation

A pending `rfi_artifact_orphans` row records either
`compensation_delete_failed` (D1 absence was confirmed, but R2 deletion failed)
or `commit_outcome_unknown` (authoritative evidence was partial/unavailable).
The latter may represent a successful issue and must be retained.

1. Keep the affected RFI issue action disabled and preserve logs/request IDs.
2. Check all four reference surfaces: `rfi_official_issues`,
   `revision_files`, `issuance_files`, and `rfi_issue_file_snapshots`.
3. Verify the R2 object's key, size, and SHA-256 match the orphan row.
4. Delete only when all authoritative queries succeed, every reference is
   absent, and explicit operator approval names that exact R2 object. Otherwise
   retain and escalate for a reviewed forward repair.
5. Verify it is absent, then update the orphan row to `deleted` with
   `reconciled_at`. If policy requires retention, set `retained` and document
   the reason instead.
6. Retry issue with the original idempotency key and unchanged request only
   after reconciliation.

Do not use **Return to draft** as an automatic or operator shortcut for an
uncertain issue outcome. It is guarded to pre-number, pre-official state and is
only for intentional content or routing correction.

If an official issue row does reference the key, stop: do not delete it. That
is an integrity incident requiring investigation and a reviewed forward fix.

## Preview template reconciliation (2026-07-28)

The isolated Pages-preview fixture originally carried a stale published RFI
stub. `npm run db:reconcile:rfi-preview-template` is the reviewed forward
correction: it retains that immutable row for audit, publishes exactly one
canonical successor, and is safe to rerun. It may rebind only preview RFI rows
in `draft` or `ready_to_issue` that remain unnumbered, unissued, and without an
official issue, published revision, or generated artifact. Issued, numbered,
open, closed, and void rows remain bound to their existing version. This is a
preview-fixture correction only; it does not change a production template,
migration, or official record.

## Deliberate limitations

- `record_only` only; no email, share, inbox, or portal delivery.
- Slice 2A itself shipped no UI. The issuance dialog and issued-evidence
  presentation are RFI Slice 2B (`UI_PROGRAM_STATUS.md` §5I), which is
  implemented but not merged.
- Response, clarification, close, reopen, final-closed artifact, and log export
  remain later slices.
- Artifact generation is synchronous in the Worker and uses the frozen
  Slice 2A PDF renderer contract.
