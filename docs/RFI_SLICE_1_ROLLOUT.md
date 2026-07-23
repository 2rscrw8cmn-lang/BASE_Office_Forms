# RFI Slice 1 Reconciliation and Production Rollout

**Status:** PR #36 rehearsal and preview preparation only. Production execution requires explicit human approval.

## Preview topology

| Purpose | Database | ID | Binding/tool |
| --- | --- | --- | --- |
| Production | `base-office-forms-library` | `1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab` | Root production `DB`; read-only in this PR |
| Pages RFI preview | `base-office-forms-rfi-preview` | `5169cd7c-60d8-4dbd-a66c-75155f745216` | Root `preview` `DB` and `preview_database_id` |
| Disposable 0014 rehearsal | `base-office-forms-rfi-0014-rehearsal` | `e88f15e9-b648-49d1-bded-bed1996bdbd9` | `wrangler.rfi-rehearsal.jsonc` only |
| Retained UI-2 tooling | `base-office-forms-ui2-preview` | `c874725c-78d8-43d5-a1b8-5d4d26e52067` | `wrangler.ui2.jsonc`; 0001–0012 only |

`npm run db:migrate:rfi-preview` applies the exact 0001–0014 source list to the
Pages RFI preview. `npm run db:migrate:preview` remains UI-2 tooling only.
Neither targets production; migrations 0013 and 0014 must not be applied there
in this task.

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

## Human-approved production rollout plan

1. **Approval and freeze.** Product and operations owners approve a maintenance
   window, freeze RFI writes, and record the compatible deployed code revision.
2. **Backup/export.** Produce and verify a D1 export plus an R2 object inventory
   for RFI attachment keys; retain locations and hashes outside this repository.
3. **Preflight.** Confirm ledger, legacy RFI tables, project contacts, and
   template/membership integrity. Rehearse against an approved clone first and
   resolve duplicate or ambiguous Party values.
4. **Compatible-code deploy.** Deploy code able to read the reconciled
   Records/Revisions/Files model while write/issue traffic remains gated.
5. **Execute 0013 then 0014.** With explicit operations approval, apply each
   reviewed migration once and record output/timestamps; never blindly retry.
6. **Reconcile.** Verify one stable Record, details row, and draft revision per
   legacy RFI; preserved response/files/metadata; no orphans; consumed sequence;
   and retired legacy tables absent.
7. **Smoke and monitor.** Test Dashboard, Overview, RFI register/workspace,
   response behavior, Records, file metadata/download, mobile, and Access roles.
   Monitor Worker exceptions, D1 errors, request IDs, and missing R2 objects.
8. **Forward fix, not casual rollback.** 0014 retires/rebuilds tables and
   changes foreign-key topology. Keep the gate closed, restore the verified
   backup only with human approval, or ship a forward corrective migration.

Human approval is required before steps 1, 4, 5, 6, and any restore.
