# API Contracts

**Status:** Architecture v1.0 — binding contract  
**Base path:** `/api/v2` for all new document-control platform routes
**Format:** JSON unless an endpoint explicitly returns or accepts binary content

Existing legacy routes retain their current paths and behavior. They are not moved
under `/api/v2` by this contract.

## 1. Contract principles

- Resource identifiers are opaque UUIDs.
- Official display numbers are server-generated.
- Every write is authorization-checked within an organization and project boundary.
- Domain transitions use explicit action endpoints instead of arbitrary status patches.
- Issued revisions are immutable.
- All responses include `requestId`.
- Timestamps are RFC 3339 UTC strings.
- Dates without times are ISO `YYYY-MM-DD`.
- Monetary values are integer cents with an explicit currency.
- Pagination uses opaque cursors.
- API behavior is idempotent where duplicate user actions could create official records.

## 2. Standard envelopes

### 2.1 Success

```json
{
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

### 2.2 Collection

```json
{
  "data": [],
  "meta": {
    "requestId": "req_...",
    "nextCursor": null
  }
}
```

### 2.3 Error

```json
{
  "error": {
    "code": "RECORD_VERSION_CONFLICT",
    "message": "This record changed while you were editing.",
    "fieldErrors": {},
    "requestId": "req_..."
  }
}
```

## 3. Concurrency and idempotency

Mutable draft resources expose `lockVersion`. Update requests must provide either:

- `If-Match: "<lockVersion>"`; or
- `lockVersion` in the request body where headers are impractical.

Official transitions require `Idempotency-Key`. Replay requires the same
tenant, operation, resource identity, and canonical request. Reusing the key
for another resource or changed input returns `409 IDEMPOTENCY_KEY_REUSED`.

## 4. Identity

### `GET /me`

Returns the authenticated user, organization memberships, active organization, and effective capabilities.

### `POST /session/organization`

Switches active organization when a user belongs to more than one organization.

Request:

```json
{ "organizationId": "org_uuid" }
```

## 4b. Read models (implemented)

These two read-only endpoints are implemented under `/api/v2` to back the
Dashboard and Project Overview screens. They add no tables and do not change the
schema version. Every response follows the standard success envelope and
includes `meta.requestId`. Both scope data server-side to projects the
authenticated user may access (org_admin and document_control_admin see all
projects in the active organization; assigned project managers, contributors,
and viewers see only their assigned projects); tenant isolation is mandatory.

### `GET /api/v2/dashboard`

Returns a concise cross-project "what needs my attention" model. Attention and
recent lists are capped at 5 items each with deterministic ordering and no
pagination.

```json
{
  "data": {
    "summary": {
      "accessibleProjectCount": 0,
      "draftRevisionCount": 0,
      "readyToIssueCount": 0,
      "activeRfiCount": 0
    },
    "draftRevisions": [
      {
        "revisionId": "uuid",
        "revisionNumber": 2,
        "revisionLabel": null,
        "title": "…",
        "recordId": "uuid",
        "recordNumber": "R-001",
        "recordTitle": "…",
        "projectId": "uuid",
        "projectNumber": "P-001",
        "projectName": "…",
        "createdAt": "2026-07-20T10:00:00Z"
      }
    ],
    "readyToIssue": [{ "…": "draft-revision fields", "fileCount": 3 }],
    "activeRfis": [
      {
        "rfiId": "uuid",
        "rfiNumber": "RFI-014",
        "title": "…",
        "status": "issued",
        "dueDate": "2026-07-27",
        "projectId": "uuid",
        "projectNumber": "P-001",
        "projectName": "…",
        "createdAt": "…"
      }
    ],
    "recentFiles": [
      {
        "fileId": "uuid",
        "originalFilename": "…",
        "uploadedAt": "…",
        "revisionId": "uuid",
        "revisionNumber": 2,
        "recordId": "uuid",
        "recordTitle": "…",
        "projectId": "uuid",
        "projectNumber": "P-001",
        "projectName": "…"
      }
    ],
    "recentIssuances": [
      {
        "issuanceId": "uuid",
        "issueNumber": "ISS-014",
        "purpose": "for_construction",
        "issuedAt": "…",
        "issuedByName": "…",
        "fileCount": 2,
        "recordId": "uuid",
        "recordTitle": "…",
        "revisionId": "uuid",
        "projectId": "uuid",
        "projectNumber": "P-001",
        "projectName": "…"
      }
    ]
  }
}
```

Definitions: a draft revision has status `draft` on a non-archived record; a
ready-to-issue revision has status `published` on a non-archived record with at
least one file and no existing issuance; an active RFI is `issued`
(awaiting response) or `answered` (awaiting close). Storage keys and raw state
JSON are never exposed.

### `GET /api/v2/projects/{projectId}/overview`

Reuses the same project-access authorization as project detail; an inaccessible
or cross-tenant project returns `404 PROJECT_NOT_FOUND`. Attention lists are
capped at 5 items and recent activity at 10, all deterministically ordered.

```json
{
  "data": {
    "project": { "…": "same shape as GET /api/v2/projects/{id}" },
    "counts": {
      "records": 0,
      "draftRevisions": 0,
      "publishedRevisions": 0,
      "files": 0,
      "issuances": 0,
      "activeRfis": 0,
      "teamMembers": 0
    },
    "attention": {
      "draftRevisions": [],
      "readyToIssue": [],
      "activeRfis": []
    },
    "recentActivity": [
      {
        "id": "uuid",
        "action": "revision.published",
        "objectType": "revision",
        "objectId": "uuid",
        "actorUserId": "uuid",
        "actorType": "user",
        "actorDisplayName": "…",
        "occurredAt": "…"
      }
    ]
  }
}
```

Counts are project-scoped and use only values that can be computed accurately
from existing tables. Attention definitions match the dashboard. Recent activity
is project-scoped by joining each event's object to its owning row and exposes
only safe public fields — never `prior_state_json`, `new_state_json`,
`metadata_json`, or storage keys.

## 5. Projects

### `GET /projects`

Returns the active-organization project list already scoped by the authenticated
membership and project-access policy. The response `data` remains an array for
backwards compatibility:

```json
{
  "data": [
    {
      "id": "project_uuid",
      "projectNumber": "24-018",
      "name": "Riverside Medical Center",
      "status": "active",
      "description": null,
      "address": { "city": "Orlando", "region": "FL" },
      "updatedAt": "2026-07-23T15:00:00.000Z"
    }
  ],
  "meta": {
    "capabilities": { "createProject": true },
    "requestId": "request_uuid"
  }
}
```

`meta.capabilities.createProject` is derived on the server from
`canCreateProjects`; clients must not reconstruct it from role strings.
Adding this metadata does not change the existing array under `data`, so legacy
consumers continue to deserialize the same list. The current endpoint is
unpaginated and has no server-side list filters; UI filtering only narrows the
authorized response.

### `POST /projects`

Creates a project when the same authoritative creation policy permits it.
`projectNumber` and `name` are required; the currently supported optional
inputs are `status`, `description`, and address city/region:

```json
{
  "projectNumber": "24-018",
  "name": "Riverside Medical Center",
  "status": "planning",
  "description": "Medical tower renovation",
  "address": {
    "city": "Orlando",
    "region": "FL"
  }
}
```

The server returns the persisted project in `data` with HTTP 201. The client
must not optimistically insert a project before this confirmation.

### `GET /projects/{projectId}`

Returns project identity, numbers, team summary, routing summary, and open-record counts.

### `PATCH /projects/{projectId}`

Updates draftable project metadata with optimistic concurrency.

### `POST /projects/{projectId}/archive`

Archives a project. It does not delete records.

### `POST /projects/{projectId}/restore`

Restores an archived project.

## 6. Project contacts and routing

### `GET /projects/{projectId}/contacts`

### `POST /projects/{projectId}/contacts`

Relates an existing contact or creates a project-scoped contact relationship.

### `PATCH /projects/{projectId}/contacts/{projectContactId}`

Updates role, discipline, routing inclusion, and effective dates.

### `GET /projects/{projectId}/routing-rules`

### `PUT /projects/{projectId}/routing-rules/{recordType}`

`recordType` initially supports `rfi` and `submittal`.

Request:

```json
{
  "sendTo": ["project_contact_uuid"],
  "cc": ["project_contact_uuid"],
  "exclude": ["project_contact_uuid"],
  "defaultResponseDays": 7,
  "notes": "Route through Ruben Ocasio."
}
```

## 7. Record collections

### `GET /projects/{projectId}/records`

Returns the project's document records as a list summary. Query parameter:

- `includeArchived=true|false` (default `false`) — include archived records.

Text search, type / discipline / current-revision-status filtering, archived
visibility, and sorting are applied in the browser over the authorized list;
they are presentation only and never an authorization boundary. Access uses the
same authorization as project detail, so an inaccessible or cross-tenant project
returns the generic project not-found result.

Response (`data`):

```json
{
  "records": [
    {
      "id": "record_uuid",
      "projectId": "project_uuid",
      "recordNumber": "A-101",
      "title": "Floor Plan",
      "recordType": "drawing",
      "discipline": "Architecture",
      "status": "active",
      "currentRevision": {
        "id": "revision_uuid",
        "revisionNumber": 1,
        "revisionLabel": null,
        "status": "published",
        "title": "Published revision"
      },
      "hasDraftRevision": true,
      "draftRevisionId": "revision_uuid",
      "fileCount": 2,
      "createdAt": "2026-07-05T00:00:00Z",
      "updatedAt": "2026-07-06T00:00:00Z",
      "capabilities": { "update": true, "archive": true }
    }
  ],
  "capabilities": { "createRecord": true }
}
```

Field meanings:

- `currentRevision` is the record's authoritative current revision (from the
  record's `currentRevisionId`), or `null` when no current published revision
  exists. It is never derived from the highest revision number, newest
  `createdAt`, or a filename.
- `hasDraftRevision` reports whether any draft revision exists for the record.
  `draftRevisionId` is present only when exactly one draft exists; when more than
  one draft exists (an integrity violation) it is `null` and no draft is silently
  chosen.
- `fileCount` is the total number of files attached across every revision of the
  record. It excludes immutable issuance snapshot files and never counts another
  record's or project's files.
- `updatedAt` is the record row's own last-modified time (record metadata), not
  a cross-entity latest-activity timestamp; `createdAt` is the record's creation
  time. The Document Register shows `updatedAt` in its "Updated" column and
  sorts on either through its `sort` query parameter.
- Response-level `capabilities.createRecord` and per-record `capabilities`
  (`update`, `archive`) are derived server-side from the record policy
  (organization-wide record admins or the assigned project manager). Per-record
  `update`/`archive` are `true` only while the record's lifecycle still permits
  them, so archived records report both as `false`.

The response never exposes storage keys, R2 metadata, raw authorization
internals, raw SQL fields, or activity JSON blobs.

**Consumer note (UI-6B).** The native Document Register
(`src/ui/features/records/`) replaced `public/records-view.js` on
`/projects/:projectId/records` without changing this contract: no endpoint,
response shape, field, or capability was added or altered for UI-6B. The
register issues exactly one `includeArchived=true` request per project and
applies search, filtering, sorting, and archived visibility in the browser over
that already-authorized response. It presents `currentRevision` as the only
current revision — never inferring one from `hasDraftRevision`,
`draftRevisionId`, revision number, or dates — and gates its Add document
action solely on `capabilities.createRecord`.

The Add Document workflow composes three existing endpoints in order:
`POST /projects/{projectId}/records`, then
`POST /projects/{projectId}/records/{recordId}/revisions`, then (upload mode
only) `POST /projects/{projectId}/records/{recordId}/revisions/{revisionId}/files`.
It never sends a client-supplied `recordNumber`, and on a partial failure it
retries only the uncompleted stage, so an ordinary retry cannot create a
duplicate Record or Revision.

## 8. RFIs

### Reconciled persistence boundary

RFI API routes continue to expose project-scoped RFI IDs and server-derived
capabilities. Migration 0014 maps the stable RFI ID to the Record ID, keeps
RFI-only fields in `rfi_details`, creates one current draft revision, and moves
attachment metadata to `revision_files`; it does not change the public route
contract. `rfi_0014_reconciliation` supports post-migration audit. Production
application is an explicit human-approved operation, not part of PR #36.

### `GET /projects/{projectId}/rfis`

Returns RFI log rows.

### `POST /projects/{projectId}/rfis`

Creates an unnumbered draft.

```json
{
  "subject": "Hard Ceiling Lighting Quantity",
  "question": "The RCP shows three fixtures while the lighting plan shows two.",
  "suggestion": "Confirm the required quantity.",
  "references": [{ "type": "drawing", "value": "A6.01" }],
  "responseDueDate": "2026-07-27",
  "responsiblePartyId": "contact_uuid",
  "templateVersionId": "template_version_uuid"
}
```

### `GET /rfis/{rfiId}`

Returns details, current revision, file summary, delivery summary, and capabilities.

### `GET /projects/{projectId}/rfis/{rfiId}/workspace`

Returns `officialIssue: null` before issue. After issue, `officialIssue` is a
dedicated immutable `RfiOfficialIssueSummary`, not the `POST .../issue`
response:

```json
{
  "officialDisplayNumber": "RFI-001",
  "issuedRevision": {
    "id": "revision_uuid",
    "internalRevisionNumber": 1,
    "userFacingVersion": "Original Issue"
  },
  "issuance": { "id": "issuance_uuid", "issueNumber": "ISS-001" },
  "issuedAt": "2026-07-25T20:00:00.000Z",
  "responseDueDate": "2026-07-27",
  "officialArtifact": { "fileId": "artifact_file_id", "sha256": "..." },
  "includedFiles": [],
  "recipients": { "to": [], "cc": [] },
  "originalIssueRequestId": "request_uuid"
}
```

It contains original-issue evidence only: official number, `Original Issue`
revision, issuance, issue timestamp, response-due snapshot, artifact, included
file snapshots, ordered To/CC snapshots, and the original request ID. It does
not contain `status`, `capabilities`, `rfiId`, or `recordId`. Top-level
`rfi.status` and top-level `capabilities` are the only authoritative current
lifecycle projection after response, clarification, close, reopen, or void.
The summary never returns R2 keys or raw snapshot/idempotency JSON. Workspace
attachments are labeled `Current Draft` before issue and `Original Issue`
after issue.

### `PATCH /rfis/{rfiId}`

Updates ordinary RFI content only while top-level status is exactly `draft`.
`ready_to_issue` is locked and must first use **Return to draft**; the API never
silently performs that transition from a PATCH.

### `POST /rfis/{rfiId}/ready`

Validates every RFI-level fact that becomes locked, then transitions
`draft -> ready_to_issue`. Required facts are non-blank `subject` and
`question`, a `responsiblePartyId` that resolves to an active contact in the
same project, and the exact bound template version still published and accepted
by the official renderer contract. Failure returns
`422 RFI_READY_VALIDATION_FAILED`; the RFI remains editable in `draft`.

### `POST /projects/{projectId}/rfis/{rfiId}/return-to-draft`

User-facing action: **Return to draft**.

Performs the intentional, server-authoritative
`ready_to_issue -> draft` transition so content or routing prerequisites can be
corrected. It requires `rfis:return_to_draft`, appends
`rfi.returned_to_draft`, increments the RFI lock version, and is guarded in D1
against any official issue, issuance, `record_number`, `sequence_no`, or
`issued_at`. Issued/open RFIs cannot use it. Transient renderer, R2, D1,
idempotency, or reconciliation failures do not invoke this endpoint and do not
automatically change a ready RFI; the operator deliberately chooses the action.

### `POST /rfis/{rfiId}/issue`

Implemented by RFI Slice 2A at
`POST /api/v2/projects/{projectId}/rfis/{rfiId}/issue`. Requires a non-empty
`Idempotency-Key` header (maximum 200 characters).

```json
{
  "recipientProjectContactIds": ["contact_uuid"],
  "ccProjectContactIds": ["contact_uuid"],
  "responseDueDate": "2026-07-27",
  "includedFileIds": ["file_uuid"],
  "deliveryMode": "record_only"
}
```

Only `record_only` is supported. Recipient IDs must be a non-empty unique list;
CC and included-file lists must be unique, and To/CC cannot overlap.
`responseDueDate` is a real `YYYY-MM-DD` calendar date. Unknown request fields
are rejected.

Success returns the standard envelope with:

```json
{
  "data": {
    "rfiId": "rfi_uuid",
    "recordId": "rfi_uuid",
    "officialDisplayNumber": "RFI-001",
    "status": "open",
    "issuedRevision": {
      "id": "revision_uuid",
      "internalRevisionNumber": 1,
      "userFacingVersion": "Original Issue"
    },
    "issuance": {
      "id": "issuance_uuid",
      "issueNumber": "ISS-001"
    },
    "issuedAt": "2026-07-25T20:00:00.000Z",
    "responseDueDate": "2026-07-27",
    "officialArtifact": {
      "fileId": "artifact_file_id",
      "role": "generated_artifact",
      "originalFilename": "RFI-001.pdf",
      "mediaType": "application/pdf",
      "byteSize": 12345,
      "sha256": "64_hex_characters"
    },
    "includedFiles": [],
    "recipients": {
      "to": [
        {
          "projectContactId": "contact_uuid",
          "contactName": "Project Architect",
          "companyName": "Design Co",
          "email": "architect@example.com"
        }
      ],
      "cc": []
    },
    "capabilities": {
      "issue": false,
      "recordResponse": true,
      "returnForClarification": false,
      "close": false,
      "reopen": false,
      "void": true
    },
    "requestId": "request_uuid"
  },
  "meta": {
    "requestId": "request_uuid"
  }
}
```

The immediate issue response remains `RfiOfficialIssueResult` for compatibility
and may contain issue-time `status` and `capabilities`. It is not reused as the
workspace's long-lived `officialIssue` projection.

The response never exposes storage keys, raw snapshot JSON, or idempotency
metadata. The canonical identity includes organization isolation plus
`projectId` and `rfiId`. Same key/same resource/same request returns the
original `data`; using the key for another RFI/project or changed input returns
`409 IDEMPOTENCY_KEY_REUSED` without disclosing the other resource.

Relevant errors:

- `400 IDEMPOTENCY_KEY_REQUIRED`
- `400 VALIDATION_FAILED` for malformed request, unsupported delivery, or an
  `Idempotency-Key` longer than 200 characters
- `401 AUTHENTICATION_REQUIRED`
- concealed `404 PROJECT_NOT_FOUND` / `RFI_NOT_FOUND` where required
- `409 RFI_ILLEGAL_TRANSITION`, `RFI_ALREADY_ISSUED`, or
  `IDEMPOTENCY_KEY_REUSED`
- `422 RFI_READY_VALIDATION_FAILED` from `POST .../ready`
- `422 RFI_ISSUE_VALIDATION_FAILED` for an unusable exact template, routing,
  project, responsible contact, or file relationship
- `503 RFI_ARTIFACT_RENDER_FAILED`, `RFI_STORAGE_UNAVAILABLE`, or
  `RFI_ISSUE_COMMIT_FAILED`
- `500 RFI_ARTIFACT_RECONCILIATION_REQUIRED` when commit evidence is partial or
  unavailable, or guarded compensation cannot delete R2

### `POST /rfis/{rfiId}/responses`

```json
{
  "responseText": "Provide a total of three can lights.",
  "returnedDate": "2026-07-22",
  "responseFileIds": ["file_uuid"],
  "receivedFromProjectContactId": "contact_uuid"
}
```

Creates an immutable response snapshot and transitions to `response_received`.

### `POST /rfis/{rfiId}/close`

```json
{
  "closureNote": "Response distributed to electrical subcontractor.",
  "costImpact": "none",
  "scheduleImpact": "none"
}
```

### `POST /rfis/{rfiId}/return-for-clarification`

Creates a new official RFI revision or clarification cycle according to the workflow specification.

### `POST /rfis/{rfiId}/reopen`

Restricted capability. Requires reason.

### `POST /rfis/{rfiId}/void`

Voids, never deletes, an issued RFI. Requires reason.

### `GET /projects/{projectId}/rfis/export`

Query:

- `format=pdf|xlsx|csv`
- same filters as the RFI log

Exports are generated from query results and record snapshots, not from browser DOM scraping.

## 9. Submittals

### `GET /projects/{projectId}/submittals`

Returns one row per stable submittal item.

### `POST /projects/{projectId}/submittals`

Creates an expected or draft stable item.

```json
{
  "specSection": "06-6410",
  "sequence": 1,
  "description": "Millwork Shop Drawings",
  "vendorProjectContactId": "contact_uuid",
  "status": "expected"
}
```

### `GET /submittals/{submittalId}`

Returns stable metadata and ordered revisions.

### `PATCH /submittals/{submittalId}`

Updates stable metadata permitted by state.

### `POST /submittals/{submittalId}/revisions`

Creates the next draft revision. Revision numbering is server-side.

```json
{
  "submissionFileIds": ["file_uuid"],
  "notes": "Revised per architect comments dated 2026-04-17."
}
```

### `POST /submittal-revisions/{revisionId}/submit`

Creates the submission artifact, snapshots routing, marks the revision immutable, and records the review due date.

### `POST /submittal-revisions/{revisionId}/return`

```json
{
  "returnedDate": "2026-04-17",
  "disposition": "approved_as_noted",
  "reviewedFileIds": ["file_uuid"],
  "reviewComments": "Coordinate final hardware locations."
}
```

### `POST /submittal-revisions/{revisionId}/deliver-to-vendor`

Records or sends the returned package to the vendor and creates a delivery event.

### `POST /submittals/{submittalId}/close`

Allowed only when the current disposition satisfies closure rules.

## 10. Templates

### `GET /templates`

### `POST /templates`

Creates a working template shell and initial draft version.

### `GET /templates/{templateId}`

### `POST /templates/{templateId}/versions`

Creates a new draft version from a provided definition or prior version.

### `POST /template-versions/{versionId}/validate`

Returns schema and renderer validation without publishing.

### `POST /template-versions/{versionId}/publish`

Publishes an immutable version after successful validation.

## 11. Controlled documents

### `GET /controlled-documents`

### `POST /controlled-documents`

### `POST /controlled-documents/{documentId}/revisions`

### `POST /controlled-document-revisions/{revisionId}/publish`

### `POST /controlled-document-revisions/{revisionId}/supersede`

Controlled-document revisions use their own numbering and effective-date rules, but share artifact and audit infrastructure.

## 12. Files

### `POST /files/upload-intents`

```json
{
  "projectId": "project_uuid",
  "fileName": "RFI-005 Sketch.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 827331,
  "purpose": "record_attachment"
}
```

Returns a short-lived direct-upload URL, object key, file ID, and required headers.

### `POST /files/{fileId}/complete`

Confirms upload completion. The server verifies object existence, size, and checksum where available before marking the file ready.

### `GET /files/{fileId}/download`

Returns a short-lived signed download redirect after authorization.

### `POST /files/{fileId}/quarantine`

Administrator/system operation when validation fails.

## 13. Artifacts

### `GET /artifacts/{artifactId}`

Returns artifact metadata.

### `GET /artifacts/{artifactId}/download`

### `POST /records/{recordId}/artifacts/regenerate`

Restricted to drafts or explicit administrative repair. Existing official artifacts are never overwritten.

## 14. Deliveries

### `POST /records/{recordId}/deliveries`

```json
{
  "artifactIds": ["artifact_uuid"],
  "recipientProjectContactIds": ["contact_uuid"],
  "ccProjectContactIds": ["contact_uuid"],
  "channel": "email",
  "subject": "OH-CONWAY RFI-005 — Shade Locations",
  "message": "Please review and respond by July 27."
}
```

### `GET /records/{recordId}/deliveries`

### `POST /deliveries/{deliveryId}/retry`

A delivery retry creates a new attempt record; it does not erase failure history.

## 15. Secure shares

### `POST /records/{recordId}/share-links`

```json
{
  "scope": "view_and_download",
  "expiresAt": "2026-08-15T23:59:59Z",
  "recipientEmail": "reviewer@example.com",
  "requireEmailMatch": true,
  "maxUses": 20
}
```

The raw token is returned once. Only its hash is stored.

### `POST /share-links/{shareLinkId}/revoke`

### Public routes

- `GET /s/{token}`
- `POST /s/{token}/acknowledge`
- future: `POST /s/{token}/response`

## 16. Activity

### `GET /records/{recordId}/activity`

Supports cursor pagination and event-type filtering.

Activity responses expose human-readable summaries plus structured event payloads safe for the current user.

## 17. Search

### `GET /search?q=...`

Optional filters:

- `projectId`
- `type`
- `status`
- `cursor`

Search applies authorization before returning results.

## 18. AI jobs

### `POST /ai/jobs`

```json
{
  "jobType": "draft_rfi",
  "projectId": "project_uuid",
  "inputs": {
    "sourceText": "Field condition notes...",
    "fileIds": []
  }
}
```

### `GET /ai/jobs/{jobId}`

### `POST /ai/jobs/{jobId}/accept`

Acceptance converts a suggestion into an ordinary user-authored draft operation. The AI job itself cannot issue or publish.

## 19. Webhook/event model

Internal domain events are emitted after committed transactions. Initial event names:

- `project.created`
- `record.created`
- `record.assigned`
- `rfi.ready`
- `rfi.issued`
- `rfi.response_received`
- `rfi.closed`
- `submittal.revision_created`
- `submittal.submitted`
- `submittal.returned`
- `submittal.closed`
- `file.ready`
- `artifact.created`
- `delivery.sent`
- `delivery.failed`
- `share.accessed`

Consumers must be idempotent.

## 20. HTTP status usage

- `200` successful read/update/action
- `201` resource created
- `202` asynchronous job accepted
- `204` successful no-content operation
- `400` malformed request
- `401` unauthenticated
- `403` authenticated but unauthorized
- `404` absent or intentionally concealed cross-tenant resource
- `409` version, state, numbering, or idempotency conflict
- `413` payload too large
- `415` unsupported media type
- `422` domain validation failure
- `429` rate limited
- `500` unexpected server error
- `503` required dependency unavailable

## 21. Contract testing

Every endpoint must have tests for:

- happy path;
- validation failure;
- authentication failure;
- authorization failure;
- cross-tenant concealment;
- optimistic concurrency;
- invalid state transition;
- idempotent replay where applicable;
- audit-event creation;
- rollback when a transaction step fails.
