# API, Security, and Storage

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19

## 1. API versioning

Keep the existing shared-library API operational.

New domain APIs use:

```text
/api/v2
```

Do not silently change the meaning of existing `/api/documents` endpoints.

## 2. Resource endpoints

### Organizations and identity

- `GET /api/v2/session`
- `GET /api/v2/organizations/current`
- `GET /api/v2/members`
- `POST /api/v2/invitations`

### Projects

- `GET /api/v2/projects`
- `POST /api/v2/projects`
- `GET /api/v2/projects/:projectId`
- `PATCH /api/v2/projects/:projectId`
- `GET /api/v2/projects/:projectId/activity`
- `GET /api/v2/projects/:projectId/contacts`

`GET /api/v2/projects` preserves its existing authorized `data` array and adds
`meta.capabilities.createProject`. The flag is evaluated server-side through
the same `canCreateProjects` policy enforced by `POST /api/v2/projects`.
Browser code may use it to present the action but may never infer that action
from membership role strings. The current creation policy permits
organization administrators and document-control administrators only.

### Templates

- `GET /api/v2/templates`
- `POST /api/v2/templates`
- `GET /api/v2/templates/:templateId`
- `POST /api/v2/templates/:templateId/versions`
- `POST /api/v2/templates/:templateId/versions/:versionId/publish`
- `POST /api/v2/templates/:templateId/retire`

### Records

- `GET /api/v2/projects/:projectId/records`
- `POST /api/v2/projects/:projectId/records`
- `GET /api/v2/records/:recordId`
- `PATCH /api/v2/records/:recordId`
- `POST /api/v2/records/:recordId/transitions/:transition`
- `GET /api/v2/records/:recordId/revisions`
- `GET /api/v2/records/:recordId/activity`

Transitions include:

- ready-to-issue
- issue
- record-response
- close
- reopen
- void
- ready-to-submit
- submit
- record-review
- create-resubmission

`GET /api/v2/projects/:projectId/records` is unchanged by UI-6B. It already
returns `capabilities.createRecord` and per-record `capabilities`
(`update`, `archive`) inside `data`, all derived server-side from the record
policy through `ProjectService.resolveRecordAccess`. Project access and tenant
scoping are resolved before any record data is read, so an inaccessible or
cross-tenant project yields the generic not-found result and no rows.

The native Document Register requests the full authorized set once with
`includeArchived=true` and then searches, filters, sorts, and toggles archived
visibility entirely in the browser. That is presentation over an
already-authorized response and is never an authorization boundary — the
browser cannot widen what the server returned. The Add document action is
presented only when `capabilities.createRecord` is true; browser code never
infers this from a membership role string, and `POST` remains independently
enforced server-side.

Record creation, draft revision creation, and file upload each keep their own
server-side authorization. The Add Document workflow only sequences those three
calls; a partial failure leaves the already-created, already-authorized
entities in place and retries only the remaining stage.

### Files

- `POST /api/v2/files/uploads`
- `POST /api/v2/files/uploads/:uploadId/complete`
- `GET /api/v2/files/:fileId`
- `DELETE /api/v2/files/:fileId`
- `POST /api/v2/records/:recordId/files`
- `DELETE /api/v2/records/:recordId/files/:recordFileId`

### Artifacts and logs

- `POST /api/v2/records/:recordId/artifacts`
- `GET /api/v2/artifacts/:artifactId`
- `POST /api/v2/projects/:projectId/log-exports`

### Shares and deliveries

- `POST /api/v2/shares`
- `DELETE /api/v2/shares/:shareId`
- `POST /api/v2/deliveries`
- `GET /api/v2/records/:recordId/deliveries`

External token route:

- `GET /s/:token`
- `POST /s/:token/respond`

### AI

- `POST /api/v2/ai/jobs`
- `GET /api/v2/ai/jobs/:jobId`
- `POST /api/v2/ai/jobs/:jobId/apply`

AI apply endpoints create proposed patches; the standard record API performs the final mutation.

## 3. API conventions

- JSON request and response bodies
- ISO 8601 timestamps in UTC
- Cursor pagination
- Explicit error codes
- Correlation ID on every request
- Idempotency key required for issue, submit, delivery, upload completion, and AI apply
- Optimistic concurrency via `lockVersion`
- Server-generated IDs and numbers
- JSON Schema validation at API boundary

Standard error shape:

```json
{
  "error": {
    "code": "RECORD_VERSION_CONFLICT",
    "message": "This record changed. Reload before saving.",
    "correlationId": "..."
  }
}
```

## 4. Authentication

## 4.1 Internal pilot

Cloudflare Access authenticates internal users.

The API reads the verified identity header only after validating that the request passed through Access.

An authentication adapter maps the external subject to:

- user
- organization membership
- project access
- role

No business service reads identity headers directly.

## 4.2 Productized identity

A future OIDC/SAML provider replaces the authentication adapter.

Domain services continue receiving the same application session:

```text
user_id
organization_id
membership_role
project_permissions
```

## 4.3 External recipients

External share-token access is isolated from member authentication.

A share token grants only its stored scope.

External access never accepts an organization ID or project ID from the browser as authorization.

## 5. Authorization

Every service call checks:

1. authenticated actor or valid share token
2. organization ownership
3. project access
4. role permission
5. object state
6. transition-specific guard

## 5.1 Permission matrix

| Action                 | Org Admin | Doc Control | Project Manager |   Contributor | Viewer |
| ---------------------- | --------: | ----------: | --------------: | ------------: | -----: |
| Manage members         |       Yes |          No |              No |            No |     No |
| Manage branding        |       Yes |         Yes |              No |            No |     No |
| Publish template       |       Yes |         Yes |              No |            No |     No |
| Create project         |       Yes |         Yes |              No |            No |     No |
| Edit project routing   |       Yes |         Yes |             Yes |            No |     No |
| Create record draft    |       Yes |         Yes |             Yes |           Yes |     No |
| Mark/return RFI draft  |       Yes |         Yes |             Yes |            No |     No |
| Issue RFI              |       Yes |         Yes |             Yes |  Configurable |     No |
| Submit submittal       |       Yes |         Yes |             Yes |  Configurable |     No |
| Record response/review |       Yes |         Yes |             Yes | Assigned only |     No |
| Close/void/reopen      |       Yes |         Yes |             Yes |            No |     No |
| Create external share  |       Yes |         Yes |             Yes |  Configurable |     No |
| View/download          |       Yes |         Yes |             Yes |           Yes |    Yes |

## 6. Tenant isolation

Rules:

- Every query includes organization context.
- Repository/service functions require organization ID from the session.
- IDs are not globally sufficient authorization.
- Foreign-key relationships are validated within the same organization.
- Tests must attempt cross-tenant access for every major endpoint.
- Logs and errors never expose another tenant's object existence.

Return 404 for unauthorized cross-tenant object lookup.

## 7. File storage

Use R2 for binary objects.

D1 stores metadata only.

## 7.1 Object-key format

```text
org/{organizationId}/project/{projectId}/records/{recordId}/files/{fileId}/{safeName}
org/{organizationId}/artifacts/{artifactId}/{safeName}
org/{organizationId}/branding/{fileId}/{safeName}
```

Object keys are generated by the server. User file names are metadata, not path authority.

RFI Slice 2A official artifacts use a deterministic private key:

```text
organizations/{organizationId}/projects/{projectId}/records/{rfiId}/revisions/{revisionId}/artifacts/official-rfi.pdf
```

The key is generated only by the server and is never returned by the issue API.
The existing authorized RFI attachment download endpoint streams the artifact.

### 7.1A Official RFI issue consistency

D1 and R2 do not share a transaction. Official RFI issue therefore:

1. authorizes and validates all tenant/project/record/contact/file/template
   relationships;
2. generates the artifact;
3. writes it to the server key and requires matching object size and SHA-256;
4. commits all official D1 state in one guarded batch;
5. after any D1 error, reloads authoritative issue, revision-file,
   issuance-file, file-snapshot, and idempotency evidence;
6. returns a confirmed committed result, deletes only after confirmed absence
   and a final no-reference check, or retains the object and records
   reconciliation when evidence is partial/unavailable.

If commit state cannot be established, or a guarded deletion fails, the API returns
`RFI_ARTIFACT_RECONCILIATION_REQUIRED` and inserts a pending
`rfi_artifact_orphans` row with `commit_outcome_unknown` or
`compensation_delete_failed`. Operators follow `RFI_SLICE_2A_ROLLOUT.md`.
Objects referenced by `rfi_official_issues`, `revision_files`,
`issuance_files`, or `rfi_issue_file_snapshots` must never be deleted.

The issue endpoint requires durable idempotency. The key is tenant-scoped and
the canonical request includes project and RFI identity. Only the same
key/resource/request replays; cross-RFI/project reuse and changed input
conflict. Server capability checks precede record disclosure, and all RFI,
revision, contact, file, sequence, and issuance relationships remain
organization/project scoped.

`POST .../return-to-draft` is separately authorized through
`rfis:return_to_draft`; browser presentation of `capabilities.returnToDraft`
does not replace this check. Its D1 guard permits only an unnumbered
`ready_to_issue` RFI with no official issue or issuance evidence. Issue
failures never invoke it automatically.

## 7.2 Direct upload flow

1. Client requests upload session with name, size, and media type.
2. API validates permission and policy.
3. API creates pending file row.
4. API returns a short-lived signed upload target.
5. Browser uploads directly to R2.
6. Client calls completion endpoint.
7. API verifies object size and checksum.
8. File moves to ready or quarantine status.
9. Client attaches the file to a record with a role.

Do not proxy large submittal files through a normal Worker request.

Initial acceptance target:

- at least 250 MB per file
- resumable or retry-safe upload behavior
- multiple attachments per revision
- no file body stored in D1

## 7.3 File validation

Validate:

- allowed media types
- extension/media mismatch
- maximum size
- checksum
- duplicate upload completion
- empty file
- object existence

Security status:

- pending
- scanning
- clean
- quarantined
- blocked

The pilot may launch with a restricted file-type allowlist before automated malware scanning is available.

## 7.4 Download

Downloads use short-lived signed URLs or a streaming authorization endpoint.

Public permanent R2 URLs are prohibited for controlled files.

## 8. Secure share links

Token requirements:

- at least 256 bits of randomness
- plaintext shown once
- SHA-256 or stronger token hash stored
- explicit object and permission scope
- expiration required by default
- revocable
- use count
- access event log

Optional later controls:

- recipient email verification
- passcode
- one-time access
- watermark
- download disabled
- domain allowlist

## 9. Audit and observability

Every mutation includes:

- correlation ID
- actor
- organization
- object
- action
- prior/new state summary
- timestamp

Operational logs include:

- API route
- status
- duration
- correlation ID
- organization ID
- non-sensitive object ID

Do not log:

- share plaintext token
- full file contents
- secrets
- full AI prompts containing sensitive attachments
- authentication assertions

## 10. Validation

The current API validates top-level kind and payload size. The new API must validate complete request schemas.

Required validation layers:

1. request JSON Schema
2. permission
3. tenant relationship
4. workflow guard
5. business constraints
6. storage confirmation
7. database constraint

Render definitions also receive a formal versioned JSON Schema.

## 11. Rate limiting

Apply limits by:

- authenticated user
- organization
- share token
- IP for unauthenticated routes

Stricter limits apply to:

- share-token attempts
- AI jobs
- exports
- email/delivery
- upload session creation

## 12. Secrets

Secrets are Worker environment secrets, not repository values.

Examples:

- identity provider secret
- email provider key
- AI provider key
- signing key
- webhook secret

Rotate without data migration.

## 13. Backup and recovery

D1:

- scheduled export or backup policy
- migration version tracking
- restore runbook
- pre-migration backup for destructive changes

R2:

- object versioning/retention where available
- deletion markers in D1
- periodic orphan reconciliation
- artifact checksum verification

Recovery objectives are defined before external customers are onboarded.

## 14. Testing requirements

- Unit tests for numbering and workflow guards
- D1 integration tests for tenant isolation and constraints
- R2 integration tests for upload completion and authorization
- End-to-end tests for RFI issue/response/close
- End-to-end tests for submittal revision cycle
- Golden render/PDF tests
- Cross-tenant negative tests
- Share expiration and revocation tests
- Migration tests from current schema
