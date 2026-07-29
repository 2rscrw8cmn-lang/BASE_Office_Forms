# Workflow Specifications

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19

## 1. General workflow rules

- Transitions are server actions, not arbitrary status edits.
- Every transition validates permission and current state.
- Every transition writes an activity event.
- Issue transitions are idempotent.
- Official numbers are assigned only during issue/submit transitions.
- Issued revisions are immutable.
- Overdue is a calculated condition, not a manually selected status.
- Workflow status and review disposition are separate.

## 2. Project lifecycle

```text
planning → active → closeout → archived
```

Additional state:

- suspended

Rules:

- Archived projects are read-only except for authorized restoration.
- Projects with active records cannot be hard deleted.
- Project routing and identifiers are versioned through activity events.

## 3. Template lifecycle

```text
draft → published → retired
```

Rules:

- Draft template versions are editable.
- Publishing freezes the version.
- Editing a published template creates a new draft version.
- Retiring prevents new records from using the template.
- Existing records continue using their original template version.

## 4. Controlled-document lifecycle

```text
draft → in_review → approved → published → superseded
                                      ↘ retired
```

### Publish transition

Guard:

- required approver recorded
- revision number unique
- effective date present
- render succeeds
- artifact checksum created

Effects:

- freeze revision
- generate artifact
- mark prior active revision superseded
- set current revision
- create activity event
- optionally create acknowledgment assignments

### Add Document (create a document and its original draft)

The Add Document workflow launched from the Document Register creates a
document identity and its first draft revision, optionally attaching the
original file. It is a staged server sequence, not a single call:

1. **Create the Record** — the document identity. The server generates the
   record number; the browser never supplies one.
2. **Create the initial draft Revision** — always revision number 1
   (presented as "Original"), with the required initial change summary and an
   optional revision label.
3. **Upload the File** — only when the upload entry choice was used.
4. **Navigate** to the created draft Revision workspace, only after every
   required stage above has been confirmed by the server.

Two entry choices exist and correspond to real domain outcomes: upload the
original document (stages 1–3), or reserve a document identity for a later
upload (stages 1–2). There is no template/library instantiation path, because
no persisted project-document template relationship exists; selecting a Library
master does not create a project Record.

**Partial success is a first-class outcome.** Because the stages are separate
server calls, any of them can fail after an earlier one succeeded. The workflow
records which stages the server confirmed and never claims that nothing was
created:

- Record created, draft Revision failed — the document identity exists and is
  usable. The user is shown the server error and request ID, told the document
  exists (named when the server returned a number), and given a link to open
  it. Retrying attempts only the Revision.
- Record and draft Revision created, upload failed — both exist. The user is
  shown the server error, the request ID, and the file name that was not
  attached, and is given a link to open the draft Revision and retry the
  upload. Retrying attempts only the upload.

An ordinary retry must never create a duplicate Record or Revision. No record
appears in the register before the server confirms it, and the register is
refreshed from confirmed server data before navigation.

## 5. RFI workflow

### 5.1 States

```text
draft
↔ ready_to_issue
→ open
→ response_received
→ closed
```

Additional states:

- returned_for_clarification
- void

Calculated flags:

- response_overdue
- due_soon

### 5.2 Create draft

Required:

- project
- title
- question

Optional:

- contractor suggestion
- references
- attachments
- requested response date
- draft assignee

No official number is assigned.

### 5.3 Ready to issue

Guard:

- current state is exactly `draft`;
- subject and question are complete;
- `responsiblePartyId` resolves to an active contact in the same project;
- the exact bound template version exists, remains `published`, and is usable
  by the official renderer contract;
- user has `rfis:mark_ready`.

These are the RFI-level facts that become locked. Ordinary PATCH editing is not
permitted in `ready_to_issue`.

**Browser sequence (Slice 2B).** The lifecycle action is offered only when the
server returns `capabilities.markReady`. It reads **Mark ready** for a clean
draft and **Save and mark ready** when the form holds unsaved edits, because
`/ready` must never validate content the operator can no longer see. The
confirmed sequence is: validate the client fields → `PATCH` the draft with the
current `lockVersion` → confirm the save → refetch the authoritative workspace →
`POST .../ready` → refetch the workspace and the RFI register. A `409` save
conflict reloads the authoritative values and stops before `/ready`. A save that
succeeds while `/ready` fails is reported as exactly that: the draft stays saved,
editable, and unmarked, with the server message and request ID, and is never
retried automatically.

### 5.3A Return to draft

The intentional operator action **Return to draft** moves
`ready_to_issue` back to `draft`. It requires `rfis:return_to_draft`, appends
`rfi.returned_to_draft`, and is allowed only before any official issue or
number allocation. The repository atomically requires no `record_number`,
`sequence_no`, `issued_at`, `rfi_official_issues`, or `issuances` evidence. The
returned draft can be edited and marked ready again after validation.

Renderer, R2, D1, idempotency, or reconciliation failures do not automatically
return an RFI to draft. Confirmed or potentially successful issue attempts stay
ready/open according to authoritative D1 evidence so a safe retry or operator
reconciliation cannot be confused with a content correction.

### 5.4 Issue

Guard:

- authenticated actor has project-scoped `rfis:issue`;
- project is active;
- current state is exactly `ready_to_issue` (direct issue from `draft` is not
  permitted);
- subject, question, responsible project contact, and at least one To recipient
  are complete and active;
- exact bound template version exists, validates, and is still `published`;
- every included file belongs to the authoritative current RFI revision and
  its private R2 object supplies matching D1 size and SHA-256 metadata (missing
  SHA is a failure);
- `Idempotency-Key` is supplied and the request is valid;
- delivery mode is `record_only`.

Coordinated effects:

1. Resolve the next project `rfi` record-type sequence without reserving it.
2. Freeze exact template definition, project/RFI/contact/routing/due-date/file
   data, renderer version, and checksums.
3. Compile and generate the official PDF through the strict, versioned BASE RFI
   official-document compiler; unsupported template changes are rejected.
4. Write the deterministic private R2 object and verify size/checksum.
5. In one guarded D1 batch, allocate the number, promote the authoritative
   shared revision 1 to `published` and label it `Original Issue`, attach the
   generated artifact, create the generic issuance and file snapshots, store
   frozen RFI/recipient/file snapshots, set `issued_at` and `open`, append
   activity, and store the immutable idempotency result.

If R2 write/verification fails, no D1 official state is committed. After a D1
error, authoritative evidence determines whether the batch committed. Confirmed
success retains the artifact and returns the stored result; confirmed absence
permits guarded deletion; partial/unavailable evidence retains the artifact,
records reconciliation, and returns
`RFI_ARTIFACT_RECONCILIATION_REQUIRED`. Same key/resource/request replays;
cross-RFI/project reuse or changed input conflicts. Email/share delivery is not
part of Slice 2A.

### 5.4A Issue — browser workflow (Slice 2B)

The action is offered only when the server returns `capabilities.issue`, and it
is the primary action in `ready_to_issue`; **Return to draft** moves to the
overflow so the deliberate correction can never displace the real task.

The workflow is two deliberate stages. **Issue details** prefills the RFI's
responsible project contact as the recipient, requires at least one recipient,
keeps CC optional and non-overlapping with To, prefills and requires a real
`YYYY-MM-DD` response due date, lists the current draft revision's attachments by
role with all eligible files selected by default, and states delivery as a fixed
**Record only** summary. **Review and confirm** shows the canonical payload plus
the statements that the server assigns the official number and that the issued
version and artifact become immutable. The final action is labelled **Issue
official RFI**.

One deliberate attempt carries exactly one `Idempotency-Key`. The key is reused
verbatim for every retry of the same canonical body, including after a network
failure, and is spent only when the operator changes an unsubmitted payload or
the server definitively refuses. While an outcome is unknown the submitted
payload is locked and cannot be edited or resubmitted, dismissal that would
create uncertainty is refused, and no official number or status is optimistically
displayed.

A failed request is never treated as proof that nothing committed. The browser
re-reads the workspace first; a present `officialIssue` means the attempt
succeeded and the persisted evidence is shown. Otherwise:
`RFI_ARTIFACT_RENDER_FAILED`, `RFI_STORAGE_UNAVAILABLE`, and
`RFI_ISSUE_COMMIT_FAILED` offer **Retry issue** with the same key and body; a
transport failure or unexplained 5xx offers **Check issue status**, which is a
read and never a second POST; `RFI_ARTIFACT_RECONCILIATION_REQUIRED` offers no
retry at all, shows a support/reconciliation notice with the request ID, and lets
the operator close and return later. **Return to draft is never used, manually or
automatically, to recover an uncertain issue outcome.**

After a confirmed issue the workflow closes, the RFI workspace, project RFI
register, dashboard, and project-overview read models are invalidated, the
server-assigned number is announced, and the authoritative refetched workspace —
not a local patch — renders the result.

### 5.5 Record response

Guard:

- state is `open` or `returned_for_clarification`
- response text or response file present
- optional responder display attribution may be recorded as free text

Effects:

- store response
- preserve the entered responder display attribution only in response history;
  do not treat an external responder as an authenticated BASE user or project
  contact
- record the authenticated BASE actor separately when `response_by_user_id`
  represents the user who entered the response; otherwise leave contact identity
  unset until a deliberate contact-selection workflow exists
- attach returned files with role
- set response timestamp
- set state `response_received`
- calculate cost/schedule impact prompt
- activity event

### 5.6 Return for clarification

Moves:

```text
response_received → returned_for_clarification
```

Requires clarification note and responsible party.

### 5.7 Close

Guard:

- response exists
- cost and schedule impact have explicit values: none, unknown, or quantified
- user has close permission

Effects:

- set closed timestamp
- state `closed`
- generate final closed artifact if configured
- activity event

### 5.8 Reopen

Only project manager or document control admin.

Moves:

```text
closed → open
```

Requires reason. Prior closure remains in activity history.

### 5.9 Void

Allowed from draft, ready, open, or response received.

- Unissued draft: no number consumed.
- Issued RFI: number remains and record displays Void.
- Reason required.

## 6. Submittal workflow

## 6.1 Stable item lifecycle

```text
expected
→ draft
→ ready_to_submit
→ under_review
→ returned
→ closed
```

Additional states:

- void

The submittal record remains stable across revisions.

## 6.2 Review disposition

Values:

- approved
- approved_as_noted
- revise_and_resubmit
- rejected
- no_action_required

`under_review` is not a disposition.

## 6.3 Expected

An expected submittal may be created from:

- project specification planning
- buyout item
- vendor requirement
- manual entry
- AI extraction reviewed by a user

It may exist without files or submission dates.

## 6.4 Create first revision

Creates revision `00`.

Required before submit:

- specification section
- description
- vendor/submitter
- source files
- reviewer/routing
- stable item number

## 6.5 Submit revision

Guard:

- current revision is draft or ready
- source files finalized
- cover data complete
- recipients resolved
- no other revision under review

Effects:

1. Freeze revision input files.
2. Compile cover sheet.
3. Generate combined issued package.
4. Record delivery recipients.
5. Set submitted timestamp.
6. Set record state `under_review`.
7. Write activity event.

## 6.6 Return review

Guard:

- state is `under_review`
- disposition selected
- returned file or documented response present

Effects:

- attach returned review
- set returned timestamp
- set disposition
- state `returned`
- write activity event

## 6.7 Disposition outcomes

### Approved / Approved as noted / No action required

User distributes the returned package to the responsible vendor/team.

Then:

```text
returned → closed
```

### Revise and resubmit / Rejected

Create the next revision:

```text
revision 00 returned
→ revision 01 draft
→ ready_to_submit
```

The prior revision remains immutable.

The stable record remains open.

## 6.8 Resubmission

- Increment revision.
- Copy stable metadata.
- Do not automatically copy prior source files.
- Allow selected files to be carried forward explicitly.
- Show prior review comments beside the draft.
- Record revision relationship.

## 6.9 Delivery to vendor

Replacing the current “Sent” checkbox:

- delivery event
- recipients
- timestamp
- artifact
- status
- sender

Closing an approved submittal may require a successful or manually recorded distribution event based on organization policy.

## 7. Share-link workflow

```text
create → active → expired
                ↘ revoked
```

Create guard:

- user has share permission
- object is shareable
- scope is explicit
- expiration within policy

Effects:

- generate random token
- store only token hash
- return plaintext token once
- activity event

Access:

- validate hash
- validate scope
- validate expiration/revocation/use limit
- log access
- serve only authorized object

## 8. Log workflow

Working log:

- query current records
- apply filters
- sort
- paginate
- save optional named view

Export:

1. Freeze query definition.
2. Query records.
3. Generate PDF/CSV/XLSX.
4. Store artifact.
5. Record generated-by and timestamp.
6. Return download/share action.

## 9. Delivery workflow

A delivery may use:

- secure link
- email
- manual external delivery record

The system records a delivery even when the actual channel is external.

Status:

- draft
- queued
- sent
- delivered
- failed
- manually_recorded

Retries create delivery attempts, not duplicate business events.

## 10. Activity timeline display

Every record page displays a chronological timeline with:

- state changes
- revisions
- files
- responses
- deliveries
- shares
- downloads where policy allows
- exports
- assignments

Internal technical events are hidden from normal users but retained for support.
