# RFI Slice 1 Reconciliation and Production Rollout

**Status: Complete.** PR #36 is squash-merged, deployed, migrated, reconciled,
and smoke-tested in production. The sections below are the historical record
of how the cutover was planned and executed; nothing further is pending for
RFI Slice 1.

## Production closeout (2026-07-23)

- **Merged main commit:** `e2bca602b4c867f9dd6ec5d17b5b3f8aea690d06`.
- **Production deployment:** `a6cccd6b-e893-42fb-854a-96f9a26d41e2`
  (`https://a6cccd6b.base-office-forms.pages.dev`), built from that commit;
  confirmed via `wrangler pages deployment list` as the current Production
  deployment before migrating.
- **Migration applied:** `0014_rfi_document_control_alignment.sql`, start
  2026-07-23T18:56:25Z, completion 2026-07-23T18:56:28Z (`0014` applied at
  `2026-07-23 18:56:28` per the ledger). Command:
  `npx wrangler d1 migrations apply base-office-forms-library --remote`
  (executed 55 statements in 24.11ms; `0013` correctly skipped, not rerun).
- **Resulting ledger:** exactly `0001`–`0014` (14 entries).
- **Reconciliation — all passed:**
  - 1 migrated RFI; 0 missing records/details/revisions.
  - 0 duplicate `rfi_details` rows; 0 current-revision mismatches; 0 duplicate
    records.
  - 0 orphan details/responses/files.
  - Response preservation: 0 pre-migration responses → 0 preserved (none
    existed to preserve).
  - File/R2-key preservation: 0 pre-migration attachments → 0 on the draft
    revision (none existed to preserve); the 8 pre-existing non-RFI
    `revision_files` rows are untouched (same count, same storage keys,
    backfilled to `role = primary_document`).
  - Party resolution: the one RFI's `responsible_party = 'fvf'` correctly
    preserved as **unresolved** (`current_responsible_contact_id = NULL`,
    `responsible_party_legacy_text = 'fvf'`), matching the pre-migration
    preflight (0 matching active contacts).
  - Sequence state preserved: `project_record_type_sequences.last_number = 1`,
    matching the pre-migration `rfi_number_sequences.last_number = 1`.
  - Legacy tables `rfi_records`, `rfi_attachments`, `rfi_number_sequences`
    retired and absent.
- **Schema marker:** `app_meta.schema_version = 12` immediately after
  migration, and **confirmed still 12** after authenticated production
  Dashboard and Project Overview requests — the `INSERT OR IGNORE` legacy-
  bootstrap fix (commit `5366208`) holds under real traffic.
- **Production smoke passed:** Dashboard, Projects, Project Overview, Records,
  direct-route refresh, browser Back/Forward, Studio, Document Library,
  controlled document preview, mobile navigation; migrated RFI appears exactly
  once with subject/question preserved and Party `fvf` preserved unresolved;
  expandable draft editor (single-open, normal text selection, field
  save/refresh persistence), Details/Preview, RFI workspace load, correct
  metadata/breadcrumbs, controlled renderer preview; issuance remains
  fail-closed.
- **Known limitations:** only one legacy RFI existed in production at
  migration time, with zero responses/attachments — response and R2
  attachment-preservation logic were exercised structurally and via the
  disposable 0014 rehearsal's populated fixture, not against real production
  attachment volume. The unresolved Party value stays unlinked to a
  `project_contacts` row until manually reconciled. RFI issuance remains
  incomplete and fail-closed (pre-existing, unchanged by this migration).

**RFI Slice 1 is complete.** Next: UI-3 is the active implementation phase;
RFI Slice 2A backend architecture may begin once `main` is pulled and stable;
RFI Slice 2 issuance UI stays paused until UI-3's shared components exist.

## Verified production state (2026-07-23T18:32:20Z)

Read-only verification against production confirmed:

- **Database:** `base-office-forms-library` (`1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab`).
- **Ledger:** exactly 13 entries, `0001`–`0013`. `0013_rfi_slice1_register_workspace.sql`
  is recorded (applied 2026-07-22 18:50:26). `0014_rfi_document_control_alignment.sql`
  is **not** in the ledger.
- **Schema:** `rfi_records` has the rebuilt 0013 column set (`subject`,
  `contractor_suggestion`, `responsible_party`, `template_version_id`,
  `lock_version`, ...), confirming 0013 applied structurally, not just logged.
  `rfi_details`, `rfi_0014_reconciliation`, and `project_record_type_sequences`
  are absent; `records` has none of 0014's added columns; the legacy tables
  0014 retires (`rfi_records`, `rfi_responses`, `rfi_attachments`,
  `rfi_number_sequences`) are still present and untouched. No partial-migration
  debris (`rfi_records_v2`, `rfi_responses_v2`, `_rfi_0014_assertion`) exists.
  **Production is in a clean pre-0014 state** — 0014 has never started.
- **`app_meta.schema_version` explained:** production reads `1` even though
  0013 should leave it at `11`. This is not migration corruption. The legacy
  API bootstrap (`functions/api/[[path]].ts`, `ensureSchema`) ran
  `INSERT OR REPLACE INTO app_meta (id, schema_version) VALUES (1, 1)` on any
  request where it saw `schema_version <> 1`, stomping the migration-owned
  marker back to `1` after 0013 advanced it. This PR already fixes it
  (commit `5366208`, "Align RFI slice with document control") by changing that
  statement to `INSERT OR IGNORE`, so it now no-ops once the row exists instead
  of overwriting it.
- **Do not rerun 0013.** It is already applied; `wrangler d1 migrations apply`
  skips anything already in the ledger, so the command below only touches 0014.

## Preview topology

| Purpose | Database | ID | Binding/tool |
| --- | --- | --- | --- |
| Production | `base-office-forms-library` | `1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab` | Root production `DB`; 0013 already applied, 0014 pending |
| Pages RFI preview | `base-office-forms-rfi-preview` | `5169cd7c-60d8-4dbd-a66c-75155f745216` | Root `preview` `DB` and `preview_database_id` |
| Disposable 0014 rehearsal | `base-office-forms-rfi-0014-rehearsal` | `e88f15e9-b648-49d1-bded-bed1996bdbd9` | `wrangler.rfi-rehearsal.jsonc` only |
| Retained UI-2 tooling | `base-office-forms-ui2-preview` | `c874725c-78d8-43d5-a1b8-5d4d26e52067` | `wrangler.ui2.jsonc`; 0001–0012 only |

`npm run db:migrate:rfi-preview` applies the exact 0001–0014 source list to
the Pages RFI preview. `npm run db:migrate:preview` remains UI-2 tooling only.
Neither targets production.

## Rehearsal and preview fixture

```powershell
# Fresh disposable populated-data migration rehearsal; no production access.
npm run db:rehearse:rfi-0014
npm run db:rehearse:rfi-0014:cleanup

# Combined Pages-preview Access fixture. The email is not committed.
$env:RFI_PREVIEW_FIXTURE_EMAIL = '<Access email>'
npm run db:fixture:rfi-preview
npm run db:fixture:rfi-preview:verify
npm run db:fixture:rfi-preview:cleanup
```

The combined fixture reads only the active production `users` row matching the
environment-provided email to obtain Access identity fields. It writes only
synthetic preview rows: `BASE RFI Preview`, `RFI Slice 1 Preview` (`RFI-001`),
one active organization administrator/project manager, a project contact, a
published BASE RFI template, and one draft RFI with its draft revision. It
does not copy production projects, records, RFIs, files, activities, issuances,
or R2 objects. Cleanup is fixed to deterministic fixture IDs and leaves the
migration ledger intact.

The 0014 rehearsal stages one numbered/open legacy RFI with a resolved Party,
response, and attachment metadata plus one unnumbered draft with an unresolved
Party. It verifies stable record identity, one `rfi_details` row and draft
revision per RFI, response/file/R2-key metadata preservation, Party resolution,
zero reconciliation orphans, retirement of legacy RFI tables, sequence
preservation, and exactly 14 ledger entries.

## Coordinated production cutover (executed 2026-07-23 — kept as the record of what ran)

Production currently has 1 legacy RFI row (`rfi_records` = 1,
`rfi_responses` = 0, `rfi_attachments` = 0). Old code requires `rfi_records`;
new code (this PR) requires the post-0014 `records` + `rfi_details` model.
**Those two schemas are mutually exclusive for the same deployed code**, so a
brief maintenance window is required between the code deploy and the 0014
migration — there is no code revision that reads correctly from both states.

1. **Freeze.** Product/operations approve a maintenance window and freeze
   application/RFI use (writes and, for the RFI register/workspace, reads).
2. **Backup and preflight.** Produce and verify a D1 export plus an R2 object
   inventory for RFI attachment keys. Confirm ledger state matches this
   document (13 entries, 0014 pending) immediately before proceeding.
3. **Squash-merge PR #36** into `main`.
4. **Wait for the production Pages deployment to succeed** (`main` branch,
   Production environment) before touching the database — the new code must
   be live before 0014 runs, since 0014 retires tables the old code reads.
5. **Immediately apply the pending migration** (0014 only; 0013 is already
   applied and will be skipped):

   ```powershell
   npx wrangler d1 migrations apply base-office-forms-library --remote
   # equivalently: npm run db:migrate:remote
   ```

6. **Run reconciliation** (all read-only):

   ```powershell
   # Migrated-RFI identity/details/revision completeness (expect missing_* = 0)
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT COUNT(*) AS migrated_rfis, SUM(CASE WHEN record.id IS NULL THEN 1 ELSE 0 END) AS missing_records, SUM(CASE WHEN details.record_id IS NULL THEN 1 ELSE 0 END) AS missing_details, SUM(CASE WHEN revision.id IS NULL THEN 1 ELSE 0 END) AS missing_revisions FROM rfi_0014_reconciliation map LEFT JOIN records record ON record.id = map.record_id LEFT JOIN rfi_details details ON details.record_id = map.record_id LEFT JOIN record_revisions revision ON revision.id = map.draft_revision_id;"

   # One rfi_details row per RFI (expect 0 rows)
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT record_id, COUNT(*) c FROM rfi_details GROUP BY record_id HAVING c > 1;"

   # Correct current revision per RFI record (expect 0 rows)
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT r.id FROM records r JOIN rfi_0014_reconciliation map ON map.record_id = r.id WHERE r.current_revision_id <> map.draft_revision_id;"

   # No orphan details/responses/files (expect 0/0/0)
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT (SELECT COUNT(*) FROM rfi_details d LEFT JOIN records r ON r.id = d.record_id WHERE r.id IS NULL) AS orphan_details, (SELECT COUNT(*) FROM rfi_responses resp LEFT JOIN records r ON r.id = resp.record_id WHERE r.id IS NULL) AS orphan_responses, (SELECT COUNT(*) FROM revision_files f LEFT JOIN record_revisions rev ON rev.id = f.revision_id WHERE rev.id IS NULL) AS orphan_files;"

   # Party resolution / unresolved preservation
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT id, current_responsible_contact_id, responsible_party_legacy_text FROM records WHERE record_type_key = 'rfi';"

   # Sequence state
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT * FROM project_record_type_sequences WHERE record_type_key = 'rfi';"

   # Schema marker: expect exactly 12 immediately after migration
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT schema_version FROM app_meta WHERE id = 1;"
   ```

   Note: 0014 self-validates identity, stable fields, detail fields, response
   counts, and attachment metadata via its own `_rfi_0014_assertion` checks and
   aborts before retiring legacy tables if any fail — a successful `apply`
   already proves those invariants.

7. **Confirm `schema_version` stays 12** after a handful of authenticated
   application requests (Dashboard, Overview, Records, RFI register) hit the
   legacy API bootstrap, to verify the `INSERT OR IGNORE` fix holds under real
   traffic and nothing resets the marker again:

   ```powershell
   npx wrangler d1 execute base-office-forms-library --remote --command "SELECT schema_version FROM app_meta WHERE id = 1;"
   ```

8. **Smoke test** before reopening use:
   - Dashboard and Project Overview load without HTTP 500/Cloudflare 1101.
   - Records shows the reconciled RFI as a Record with its draft revision.
   - RFI register/workspace open the migrated RFI; Party shows resolved or
     preserved-unresolved correctly.
   - Response and file/attachment metadata and R2 download still work.
   - Mobile layout and Access-role gating behave as before.
   - Monitor Worker exceptions, D1 errors, request IDs, and missing R2 objects
     for the duration of the window.
9. **Reopen use** only after every check above passes.

Human approval is required before steps 1, 3, 5, and any restore.

## Forward fix, not casual rollback

0014 retires/rebuilds tables and changes foreign-key topology. If a problem
surfaces after cutover: keep the freeze/gate closed, restore the verified
backup only with human approval, or ship a forward corrective migration.
Do not blindly retry 0014 — investigate first.
