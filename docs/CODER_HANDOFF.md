# Coder Handoff

## 1. Mission

Implement the architecture in this directory without rewriting the current renderer or breaking the shared library.

The first implementation target is the authenticated Project + RFI vertical slice.

## 2. Required first pull requests

Keep pull requests reviewable and ordered.

### PR 1 — Test and schema foundation

Scope:

- test runner
- CI
- definition JSON Schema
- API error/correlation utilities
- migration test harness
- existing shared-library regression tests

Do not add project UI yet.

### PR 2 — Identity and tenant foundation

Scope:

- organizations
- users
- memberships
- authentication adapter
- Cloudflare Access implementation
- `AppSession`
- authorization policies
- cross-tenant tests

### PR 3 — Projects and contacts

Scope:

- projects
- project members
- contacts
- project contacts
- routing rules
- project list/detail
- project activity

### PR 4 — Record platform

Scope:

- records
- sequence counters
- revisions
- activity events
- idempotency
- transition service
- optimistic locking

No RFI-specific UI beyond fixtures.

### PR 5 — RFI workflow

Scope:

- `rfi_details`
- draft/editor
- issue transition and numbering
- response/close/reopen/void
- RFI template binding
- frozen issued render payload
- project RFI log

### PR 6 — RFI exports and pilot import

Scope:

- PDF/CSV/XLSX log export
- migration source tracking
- OHPA Conway import tools
- reconciliation report
- pilot runbook

Do not start the submittal implementation until PR 6 meets the Phase 1 exit gate.

## 3. Code structure

Target service organization:

```text
functions/
  api/
    [[path]].ts              legacy router retained
  v2/
    router.ts
    middleware/
      auth.ts
      correlation.ts
      errors.ts
      idempotency.ts
    domain/
      projects/
      contacts/
      templates/
      records/
      rfi/
      submittals/
      files/
      shares/
      deliveries/
      audit/
    storage/
      d1/
      r2/
    schemas/
```

The exact Pages Functions routing layout may differ, but keep domain logic out of a single catch-all file.

Browser code:

```text
public/
  app/
    api/
    session/
    projects/
    records/
    rfi/
    submittals/
    components/
```

Do not add new large feature logic to `home.js` or `studio.js` when a module boundary exists.

## 4. Service rules

- Route handlers parse requests and call services.
- Services enforce business rules and transitions.
- Repositories perform tenant-scoped persistence.
- Renderer compilation is a separate service.
- Authorization is explicit.
- Domain services do not read raw authentication headers.
- No SQL string is built from user values.
- Every write returns the new `lockVersion`.
- Every official transition accepts an idempotency key.
- Every mutation writes an activity event in the same logical operation.

## 5. Migration rules

- New migration numbers continue after current migrations.
- Migrations are forward-only in production; rollback is documented and tested through backup/restore or compensating migration.
- Add foreign keys and indexes intentionally.
- Never repurpose current `documents.version` as a business revision.
- Do not delete current tables during Phase 0–2.

Suggested migration sequence:

```text
0003_identity_and_organizations.sql
0004_projects_and_contacts.sql
0005_records_and_sequences.sql
0006_rfi_details.sql
0007_files_and_artifacts.sql
0008_submittal_details.sql
0009_templates_and_controlled_docs.sql
0010_shares_deliveries_ai_jobs.sql
```

Migrations may be split further.

## 6. Testing rules

Every transition test includes:

- permitted role
- denied role
- wrong organization
- wrong project
- invalid current state
- duplicate idempotency key
- stale lock version
- audit event
- expected database constraints

Numbering tests include concurrent issue attempts.

Artifact tests confirm a later draft edit does not alter an issued revision payload.

## 7. UI rules

- Project context is always visible on record pages.
- Official number and status are prominent.
- Current responsible party and due date are visible without opening a secondary panel.
- Draft versus issued state is unmistakable.
- File roles are labeled.
- Revision history is a timeline, not a flat attachment list.
- Destructive/official transitions require clear confirmation.
- Mobile layouts prioritize actions and status over dense tables.
- Tables have responsive record-detail fallback.

## 8. Compatibility rules

- Existing standalone studio and library continue to work.
- Existing valid definition JSON continues to render.
- New definition keys require schema documentation and tests.
- Legacy public viewer links are not silently converted to project shares.
- Package snapshots remain portable.

## 9. Security rules

- Never trust organization or project ID from the client for authorization.
- Never store plaintext share tokens.
- Never expose R2 objects through permanent public URLs.
- Never log secrets, full tokens, or file contents.
- Never allow AI output to call issue/publish/approve transitions.
- Never permit a published/issued revision update through the generic PATCH endpoint.

## 10. Implementation notes for OHPA pilot

Project fields must distinguish:

- BASE internal project number: `261820046`
- external architect/client project number shown in routing: `8722265100`

Routing must support:

- To: Ruben Ocasio
- CC: Jim Lynch
- explicit excluded contacts

RFI import must handle:

- Potential → draft
- Closed record with response but missing returned date
- attachments stored as a database file or page-body file
- manual `ID#` and `RFI Sender ID` consistency checks

Submittal import later must parse:

```text
06-6410-01-00
specification section = 06-6410
item sequence = 01
revision = 00
```

## 11. Stop conditions

Pause implementation and update architecture before:

- introducing a generic field/EAV engine
- changing the definition format incompatibly
- storing binary files in D1
- making projects folders
- combining status and disposition
- letting the browser generate official numbers
- overwriting issued revisions
- choosing an identity/storage/provider that violates the adapter boundaries
- adding autonomous AI issuance

## 12. Completion target

Phase 1 is complete when a BASE PM can manage an OHPA RFI from draft through closed artifact and exported log without duplicate entry in Notion.
