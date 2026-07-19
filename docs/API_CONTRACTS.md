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

Official transitions require `Idempotency-Key`. Replaying the same key with the same request returns the original result. Reusing the key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.

## 4. Identity

### `GET /me`

Returns the authenticated user, organization memberships, active organization, and effective capabilities.

### `POST /session/organization`

Switches active organization when a user belongs to more than one organization.

Request:

```json
{ "organizationId": "org_uuid" }
```

## 5. Projects

### `GET /projects`

Filters:

- `status`
- `managerId`
- `superintendentId`
- `client`
- `search`
- `archived`
- `cursor`

### `POST /projects`

Creates a project draft.

Required:

```json
{
  "shortName": "OH-CONWAY",
  "name": "Orlando Health Conway Clinic Fit Out",
  "internalProjectNumber": "261820046"
}
```

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

Filters:

- `type=rfi|submittal`
- `status`
- `disposition`
- `responsiblePartyId`
- `overdue`
- `search`
- `sort`
- `cursor`

The dedicated RFI and submittal routes below are preferred for typed payloads.

## 8. RFIs

### `GET /projects/{projectId}/rfis`

Returns RFI log rows.

### `POST /projects/{projectId}/rfis`

Creates an unnumbered draft.

```json
{
  "subject": "Hard Ceiling Lighting Quantity",
  "question": "The RCP shows three fixtures while the lighting plan shows two.",
  "suggestion": "Confirm the required quantity.",
  "references": [
    { "type": "drawing", "value": "A6.01" }
  ],
  "responseDueDate": "2026-07-27",
  "responsiblePartyId": "contact_uuid",
  "templateVersionId": "template_version_uuid"
}
```

### `GET /rfis/{rfiId}`

Returns details, current revision, file summary, delivery summary, and capabilities.

### `PATCH /rfis/{rfiId}`

Updates a draft or fields explicitly mutable in the current state.

### `POST /rfis/{rfiId}/ready`

Validates the draft and transitions to `ready_to_issue`.

### `POST /rfis/{rfiId}/issue`

Requires `Idempotency-Key`.

```json
{
  "recipientProjectContactIds": ["contact_uuid"],
  "ccProjectContactIds": ["contact_uuid"],
  "responseDueDate": "2026-07-27",
  "includedFileIds": ["file_uuid"],
  "deliveryMode": "record_only"
}
```

Server transaction:

1. locks the project/record sequence;
2. assigns the next RFI number;
3. creates immutable revision 0;
4. snapshots project and routing metadata needed for the document;
5. renders the issued artifact;
6. stores the artifact;
7. creates issuance and activity events;
8. optionally creates delivery records;
9. returns the official record.

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
