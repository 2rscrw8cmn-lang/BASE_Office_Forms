# Testing and Quality Strategy

**Status:** Architecture v1.0 — binding quality specification

## 1. Quality objective

The platform manages official construction records. Correctness, traceability, and recoverability take priority over feature speed. A visually correct screen is not sufficient if numbering, authorization, files, revisions, or audit history can become inconsistent.

## 2. Test pyramid

### 2.1 Unit tests

Cover pure and deterministic logic:

- numbering and display formatting;
- state-transition guards;
- permission evaluation;
- record-to-render snapshot mapping;
- definition validation;
- due-date and aging calculations;
- status/disposition projection;
- file-role validation;
- audit-summary formatting;
- import normalization;
- AI-output schema validation.

### 2.2 Service tests

Run against an isolated D1-compatible test database and mocked R2/provider boundaries:

- transactional domain operations;
- optimistic concurrency;
- idempotency;
- tenant isolation;
- immutable revision enforcement;
- sequence allocation under concurrency;
- file completion verification;
- delivery attempts;
- rollback behavior.

### 2.3 API contract tests

Assert request/response shape, status codes, error codes, headers, pagination, and authorization behavior.

### 2.4 Integration tests

Use local Cloudflare runtime bindings where practical:

- Pages/Worker request routing;
- D1 migrations;
- R2 uploads and signed downloads;
- artifact generation pipeline;
- authentication adapter;
- email provider sandbox;
- background job queue when introduced.

### 2.5 End-to-end tests

Browser tests cover the critical user journeys:

1. create project;
2. configure routing;
3. draft RFI;
4. upload attachment;
5. mark ready;
6. issue;
7. record response;
8. close;
9. export log;
10. retrieve artifact and timeline.

Submittal E2E covers expected item through resubmission and approval.

### 2.6 Visual regression tests

The renderer and application UI are product assets with separate visual baselines.

Controlled-document references include:

- RFI cover/form;
- RFI with long question and continuation pages;
- submittal transmittal;
- submittal package index;
- formal logs in portrait and landscape;
- controlled document;
- package cover and contents.

Application references include:

- global shell and mobile drawer;
- Dashboard and Project Overview;
- Projects, Records, and RFI registers;
- RFI, Record, and Revision workspaces;
- create/edit dialogs and validation;
- loading, first-use empty, filtered empty, error, permission, saving, failed, and conflict states;
- UI Lab shared components at desktop, tablet, and mobile widths.

Visual changes require explicit approval, not automatic snapshot replacement. Controlled-document baselines and application baselines remain distinct so application CSS changes cannot silently authorize document-output changes.

## 3. Required test fixtures

Maintain deterministic fixtures for:

- BASE Construction organization;
- OHPA Conway project;
- routing contacts from the Notion workflow;
- open, closed, potential, and overdue RFIs;
- approved, approved-as-noted, and revise/resubmit submittals;
- files in queued, ready, failed, and quarantined states;
- records with multiple revisions;
- users with each role;
- a second organization used exclusively to test tenant isolation.

No production data or credentials belong in fixtures.

## 4. Numbering tests

Sequence allocation is a high-risk area.

Required tests:

- drafts do not consume numbers;
- first issue receives `001`;
- concurrent issue requests receive unique sequential numbers;
- idempotent replay returns the original number;
- failed issue transactions do not leave a half-issued record;
- voided numbers are never reused;
- project sequences remain independent;
- RFI and submittal sequences remain independent;
- imported historical numbers advance counters safely;
- display formatting is independent from stored integer sequence.

## 5. Immutability tests

- issued revision rows reject update/delete operations;
- official artifacts are append-only;
- replacement files create new file records;
- historical project/contact snapshots remain unchanged after source metadata changes;
- a template update does not mutate existing record revisions;
- audit events cannot be modified through ordinary application APIs.

## 6. Authorization tests

For every protected service and endpoint test:

- no session;
- inactive membership;
- wrong organization;
- organization member without project access;
- project viewer;
- project contributor;
- project manager;
- organization administrator;
- expired secure share;
- revoked secure share;
- secure share with wrong recipient identity.

Use deny-by-default behavior.

## 7. Migration tests

Each migration must be tested against:

- empty database;
- current production-like schema;
- representative existing documents;
- partially populated rows;
- repeated migration invocation where supported;
- rollback or forward-fix instructions.

Migration tests must prove existing shared-library records remain readable.

## 8. Import tests

Notion/import validation includes:

- project identity and multiple project-number labels;
- RFI sequence and sender ID reconciliation;
- missing returned dates;
- status normalization;
- duplicate records;
- attachments in properties versus page bodies;
- submittal revisions represented as separate rows;
- ambiguous `Sent` values;
- vendor relation mapping;
- import source IDs retained for traceability;
- repeatable dry run without duplicate creation.

## 9. Renderer tests

- every published definition validates;
- pagination is deterministic for the same renderer version and input;
- unsupported blocks fail visibly in validation rather than disappearing;
- long text does not overlap controls;
- table headers repeat where required;
- issued artifact metadata contains record and revision identity;
- generated files are non-empty and downloadable;
- artifact checksum is stored;
- renderer version is recorded with each artifact.

## 10. File tests

- allowed MIME types;
- extension/MIME mismatch;
- size limit;
- interrupted upload;
- completion before object exists;
- duplicate file checksum handling;
- cross-project file attachment denial;
- unauthorized download;
- signed URL expiration;
- quarantine path;
- retention behavior for issued records.

## 11. Delivery tests

- recipient snapshot correctness;
- multiple recipients and CC;
- provider success;
- provider temporary failure and retry;
- permanent failure;
- duplicate-send protection;
- audit events per attempt;
- artifact list exactly matches confirmation preview;
- delivery after share revocation remains historically visible.

## 12. AI tests

- strict output schema;
- citation/source references where required;
- prompt version captured;
- low-confidence output marked;
- unsupported claims rejected or surfaced;
- no direct official transition capability;
- user acceptance required before draft mutation;
- redaction and data-boundary rules;
- regression set for RFI drafting and submittal extraction.

## 12A. Application UI foundation tests

Shared application components and migrated routes require:

- component behavior tests for explicit variants and states;
- keyboard and focus tests for dialogs, menus, tabs, drawers, and accepted register controls;
- route parity and browser history tests during shell migration;
- server-capability and denied-action tests;
- adapter lifecycle/edit/save/conflict tests only if a future register has a separately accepted grid adapter;
- URL-backed search/filter/sort restoration;
- first-use empty versus filtered-empty distinction;
- desktop, tablet, and mobile visual evidence;
- accessibility scans plus manual critical keyboard journeys;
- tests or lint rules preventing raw feature-specific visual conventions and direct Tabulator use;
- renderer and legacy-route regressions during application/document CSS separation.

A UI migration is not accepted because it looks cleaner. Behavioral parity, accessibility, authoritative permissions, failure recovery, and documentation closeout are required.

### 12A-i. UI-3 component library test coverage (implemented)

The UI-3 BASE component library satisfies the §12A component requirements with
six Happy DOM + Testing Library suites (opted in per file with
`// @vitest-environment happy-dom`; shared setup in
`tests/helpers/setup-component-dom.ts` registers jest-dom, auto-cleanup, and the
Radix pointer/observer polyfills):

- `tests/unit/base-components-behavior.test.tsx` — explicit variants/states
  (button click/type/loading, keyboard checkbox toggle, Field id/required/
  aria-invalid/aria-describedby/error wiring), plus a "Field control id
  consistency" section proving Field's `controlId` prop is the one
  authoritative id for both the label and the child control — a caller `id`
  set directly on TextInput/TextArea/Select/DateInput can never disconnect the
  label — while a standalone control (outside Field) still honours its own
  `id`.
- `tests/unit/base-components-keyboard.test.tsx` — keyboard and focus for
  dialogs, drawers, tabs, menus, and the command palette (labelling, focus trap,
  Escape, focus restoration, arrow navigation, activation), plus a "CommandMenu
  robustness" section: two simultaneously mounted instances never collide on
  DOM id (`useId()`-derived), the active index clamps correctly when `items`
  shrinks while open, the active item recovers when it disappears under
  filtering, an empty items collection never produces a negative/dangling
  active index or `aria-controls`/`aria-activedescendant` reference, and the
  search input's accessible name (default and overridden via `label`).
- `tests/unit/base-components-accessibility.test.tsx` — accessible names for
  icon-only controls, decorative-vs-meaningful icons, text-not-colour status,
  labelled groups/landmarks, and error/save live regions.
- `tests/unit/base-component-tokens.test.ts` — token/lint enforcement: no raw
  colour literals in component or lab CSS, every `--app-*` token registered and
  declared, brand tokens read only through documented fallbacks, and
  `lucide-react`/`radix-ui` imported only from their single allowed locations.
- `tests/unit/base-status-badges.test.tsx` — proves each status vocabulary
  (`RFI_STATUS_VOCABULARY`/`RECORD_STATUS_VOCABULARY`/
  `REVISION_STATUS_VOCABULARY`) is authoritative against its domain source:
  the map's keys exactly equal the domain constant
  (`RFI_STATUSES`/`RECORD_STATUSES`/`REVISION_STATUSES` from `src/domain`), no
  non-authoritative alias (`responded`/`issued`/`in_review`) is present, the
  calculated `due_soon`/`overdue` attention conditions never overlap the
  stored RFI status enum, and every authoritative status/condition renders a
  readable label (`it.each` over every domain value — 19 assertions).
- `tests/unit/ui-lab-catalog.test.tsx` — the UI Lab renders the real production
  components across every required state (default/hover/focus/selected/disabled/
  loading/error/long-text/empty) without throwing.

Committed desktop and mobile UI Lab captures provide the visual evidence for the
shared patterns (`docs/evidence/ui-3/`). An automated pixel-baseline
visual-regression harness remains UI-10 scope.

### 12A-ii. UI-6A Projects register coverage (implemented)

UI-6A adds focused Happy DOM/Testing Library and Worker integration coverage
for the native `/projects` route: authorized rendering and identity hierarchy;
active/number/name/ID ordering; semantic table and dedicated mobile cards;
search/status filtering and result announcements; URL parsing, normalization,
replace/push behavior, hash preservation, and Back/Forward restoration; shared
mobile disclosure attributes/counts; safe row, modifier-link, and
text-selection navigation; loading, first-use empty, filtered empty,
retry/request ID, and background refresh; exhaustive authoritative project
status badges; and absence of role inference, Tabulator, `BaseDataGrid`,
`role="grid"`, and redundant Actions/Open columns.

The native Create Project workflow is covered for server-derived capability
presence/absence, initial focus and focus restoration, Escape, inline client
validation, pending submission, server validation/error/request ID recovery,
confirmed success, and canonical Overview navigation without optimistic
insertion. API integration tests prove `meta.capabilities.createProject` for
each relevant role while retaining the list `data` array contract and legacy
rollback tests. Deterministic evidence under `docs/evidence/ui-6a/` covers all
required desktop/mobile and async/empty/error states.

### 12A-iii. UI-6B Document Register coverage (merged — `315de55`, PR #47)

UI-6B adds 72 unit tests across three suites plus 2 shared `Drawer` tests.

`records-register-react.test.tsx` (51) covers authorized rendering and the
project-scoped query key (a route change never shows another project's rows);
Record/Revision/File identity — authoritative `currentRevision` only, a draft
never masquerading as current, the revision number visible alongside a label,
"No revision", the draft-in-progress indication, total file count, archived
marking, an honest missing legacy record number, and no database id as
user-facing identity; the six semantic column headers with no grid role and no
Actions/Open column; dedicated mobile cards with no nested interactive
controls; a semantic `<time>` element; search visible on mobile and an
active-filter count that ignores the search query; search, type, discipline,
revision-status, no-revision, archived, and sort behaviour; controlled options
only; filter chips and individual removal; Clear semantics; replace-on-search
and push-on-filter/sort history; direct URL restoration, Back/Forward, hash
preservation, and invalid-value normalization; title-link, safe-row-area,
modifier-click, text-selection, and mobile-card navigation; and loading,
refreshing, first-use empty, no-active-but-archived, filtered empty,
permission (403 and 404 alike), and error-with-request-ID states.

The Add Document workflow is covered for capability gating, the shared detail
Drawer size and side, initial focus on the first choice, Escape with focus
restoration to the trigger, the two real entry choices, required validation,
the controlled discipline vocabulary, the absence of any Record-number field,
no optimistic insertion before server confirmation, the confirmed
Record → Revision → upload sequence with canonical Revision navigation, cache
refresh from confirmed server data, and all three failure paths —
Record-create failure creating nothing, draft-Revision failure after Record
success, and upload failure after both — each asserting the request ID, the
recovery link, and that a retry re-attempts only the failed stage without
duplicating a Record or Revision.

`records-register-route-integration.test.tsx` (4) proves the native route
mounts and the legacy `records` controller is never loaded, the shell keeps the
only `<h1>` and the selected Documents tab, Records are requested only after
project access is confirmed, and Record and Revision detail stay
compatibility-mounted.

`records-register-contract.test.ts` (17) enforces the static boundaries: no
role-string inference, no Tabulator/`BaseDataGrid`/grid role/raw SVG/direct
Radix or Lucide import, exactly six declared columns, no draft-derived current
revision, no nested controls in the card, the shared 760px/460px breakpoints
only, the shared Drawer instead of a local modal or focus trap, no feature
focus rings or shared-control appearance, reuse of the shared status
vocabularies and the one controlled discipline source, a label for every
controlled record type, no client-generated Record number, the preserved URL
parameter names, no raw colour literals, only registered tokens, and retention
of both legacy rollback modules.

Three UI-4 shell suites that used `/projects/p1/records` as their example
compatibility-mounted route were repointed at routes still on that path
(`record-detail`, `overview`) — the same adjustment UI-6A made for `/projects`.
No assertion was weakened, and the legacy `records-ui` rollback tests are
untouched.

Deterministic evidence under `docs/evidence/ui-6b/` covers all required
desktop, tablet (834px), and mobile (390px, 360px) states. Each capture waits
for a selector that only exists once the documented state has rendered, asserts
its CSS viewport, and fails if the page overflows horizontally.

### 12A-iv. UI-7 detail workspace coverage (implemented)

UI-7 and its reviewed follow-up corrections now add 161 unit tests across six
suites. All are DOM suites under Happy DOM except the parity suite, which is a
pure Node comparison.

`record-workspace-react.test.tsx` (21) covers the required workspace hierarchy
and its order; Record identity in the header versus Record facts in the metadata
strip (and the absence of revision facts there); no database id as user-facing
identity; an honest "Unnumbered document"; a draft never standing in for the
authoritative current revision, with the current version keeping its own panel;
multiple drafts listed rather than reduced; file name/type/size and the
authenticated content endpoint; draft-with-no-files distinguished from
version-with-no-file; the absence of every mutation action when the server grants
none; the archived lifecycle reason; publish offered only for a publishable
draft that has a file; publication as a confirmed transition that sends nothing
before confirmation and announces only after the server confirms; a failed
publication keeping its confirmation and request ID; edit/archive/create-revision
workflows including client validation that sends no request and creation that
navigates only after confirmation and never supplies a revision number; and
loading, generic 403/404 not-found, retry-with-request-id, and long-content
states.

`revision-workspace-react.test.tsx` (17) covers exact revision context and the
breadcrumb trail to its document; current-version labelling and its absence for a
draft; revision facts separate from record facts; the change summary as its own
section; published, superseded, and archived immutability notices with archived
taking precedence; upload to the exact revision announced only after
confirmation; a disabled submit standing in for an impossible empty upload; the
server-reconciled upload-failure path (refetch before retry, preserved filename,
request ID); publish gating, confirmation, and 409 conflict recovery; and the
async states.

`rfi-workspace-react.test.tsx` (33) covers the shared hierarchy applied to a
structured record; no official number before issue and never a database id;
legacy-incomplete reconciliation labelling with no Issued date presented as
fact; draft editing carrying `lockVersion` and never sending status or number;
client validation without a request; 409 conflict reloading authoritative values
into the editor; a 403 reporting lost permission without retrying; read-only
content when `updateDraft` is false, with Assigned to / Response due moving into
the metadata strip only then; role-explicit attachments with their exact draft
revision and authenticated downloads; role-carrying upload and the reconciled
retry; the response as its own section separated from the question, its absence
for a draft, capability-gated recording, and the awaiting-response state; the
deferred full issuance dialog; capability-gated Return to draft confirmation;
published current-version compatibility; immutable original-issue evidence and
the authorized official-PDF download after reload; confirmed close and
destructive void; no actions at all when the server grants none; an honest
document-view unavailable message; activity rendering only mapped labels and
structured details (never raw JSON); and the async states.

`workspace-route-integration.test.tsx` (9) proves each of the three routes
mounts its native workspace and never loads its legacy controller, that the
shell keeps exactly one `h1` and the correct descendant project tab, that no
workspace read model is requested before project access is confirmed, that a
403 project shows the shell's generic not-found before any workspace request,
and that every migrated route still resolves to its `featureDescriptor` so the
documented rollback path remains wired.

`workspace-accessibility.test.tsx` (12) proves one `h2` identity title above
`h3` sections with no feature-owned `h1`, a labelled breadcrumb trail with
`aria-current`, named icon-only controls, textual status, validation messages
associated to their field, keyboard opening of the overflow menu with focus
restoration on Escape, focus trapped in and restored from both confirmation and
form dialogs, a keyboard-operable document-view disclosure, and live
announcements for saves, failures, and background refresh.

`workspace-format-parity.test.ts` (66) compares every label the workspaces
ported from `public/app-format.js` — media type, activity action, RFI field,
attachment role, number label, actor, and activity detail — plus the file-size
formatter carried inline by the legacy detail views, so the ported vocabulary
cannot drift from the rollback modules while both exist.

The legacy rollback suites (`record-detail-ui`, `revision-detail-ui`,
`rfi-ui`) are retained unchanged. Four shell suites
(`react-shell`, `react-shell-history-parity`,
`react-shell-project-revalidation`, and the two register route-integration
suites) were updated because their fixture route is no longer
compatibility-mounted; they exercise the same shell behaviour through
`project-overview`/`dashboard` or assert the native workspace.

### 12A-v. UI-7 RFI workspace layout correction

A follow-up correction (§5G/§5H in `UI_PROGRAM_STATUS.md`) replaced the RFI
workspace's full-width stacked layout with an opt-in `WorkspacePage`
`layout="rail"` mode and closed a dead-end "Document view" control and a
`ButtonLink` modifier-click bug. It grows three of the six suites above by 8
tests (151 → 159); the subsequent Slice 2A contract integration adds two RFI
workspace tests (159 → 161):

`rfi-workspace-react.test.tsx` (26 → 31) adds an "RFI workspace — rail
layout" block: the workspace renders `.base-workspace--rail` with a
`.base-workspace__grid` containing `.base-workspace__rail-top`,
`.base-workspace__body`, and `.base-workspace__secondary` as siblings;
editable-draft facts (Assigned to, Response due) are absent from
`.base-workspace__rail-top`; the same facts appear there once the RFI is
read-only; and activity renders inside `.base-workspace__secondary`, never
`.base-workspace__body`. The prior single "document view" test is now two:
one proving the no-renderer state renders no `Show document view` button at
all (only the restrained note), and one proving the interactive
`Collapsible` still opens and reports `aria-expanded` correctly once a
`globalThis.BASE` renderer runtime is mocked.

`record-workspace-react.test.tsx` (21 → 23) adds a "Record workspace —
navigation safety" block: a plain click on the primary action's `ButtonLink`
navigates through the shell, while a ctrl-clicked primary action leaves the
native `MouseEvent.defaultPrevented` `false` and never calls `shell.navigate`
— the regression check for the modifier-click fix, following the same
pattern already used by `projects-register-react.test.tsx`.

`workspace-accessibility.test.tsx` (12 → 13): the existing keyboard-operable
Collapsible test now mocks a renderer runtime (the interactive control no
longer exists without one), and a new test asserts the renderer-unavailable
note has no interactive descendant (`button, a, [tabindex]`) — a control that
can only report itself unavailable must not be focusable at all.

`scripts/capture-ui7-evidence.mjs` grew from 27 to 29 captures: a
`rfiWorkspaceFixture=long` fixture (long subject, three-paragraph question,
eight-event activity list) captured at 1280px and 390px, exercising the
constrained main column and the non-sticky activity rail under worst-case
content; and the document-view capture's scenario was updated to assert no
toggle exists in the unavailable state, rather than clicking one that no
longer renders. `happy-dom` has no real layout engine, so the CSS
grid/rail breakpoints and the "no horizontal overflow" requirement are
verified by this capture script's existing `scrollWidth` assertion, not by a
new unit test — a `document.documentElement.scrollWidth` check under
`happy-dom` would not reflect real layout.

The Slice 2A UI integration adds two more RFI workspace tests (31 → 33) for
the server-authorized Return to draft confirmation and the persisted immutable
`RfiOfficialIssueSummary`/official-PDF surface. The issued fixture uses a
`published` `currentVersion`; its top-level `rfi.status` is deliberately
different from the immutable evidence to prove current authority is not derived
from the original issue.

It also adds a thirtieth deterministic capture: an authorized ready RFI with
the Return to draft confirmation open. The existing issued capture now waits
for the persistent official-PDF download evidence instead of only a generic
read-only facts surface.

### 12A-vi. RFI Slice 2B issuance UI coverage

RFI Slice 2B adds **94 unit tests across six new suites** (735 → 829). Every
existing UI-7 and Slice 2A suite is retained and passing; the only change to an
existing assertion is `rfi-workspace-react.test.tsx`'s official-PDF link name,
which follows the evidence section's redesigned download action.

`rfi-issue-api.test.ts` (6) proves the API layer against the accepted Slice 2A
contract: the exact `POST .../ready` and `POST .../issue` paths and methods with
correct encoding; a body-less ready call; the exact JSON issue body with no
client-supplied number, status, or unknown field; the exact `Idempotency-Key`
header; request-ID extraction from the envelope and the `x-request-id` header;
the typed `RfiOfficialIssueResult`; every documented server failure
(`IDEMPOTENCY_KEY_REQUIRED`, `VALIDATION_FAILED`, `AUTHENTICATION_REQUIRED`,
`RFI_ILLEGAL_TRANSITION`, `RFI_ALREADY_ISSUED`, `IDEMPOTENCY_KEY_REUSED`,
`RFI_ISSUE_VALIDATION_FAILED`, `RFI_READY_VALIDATION_FAILED`,
`RFI_ARTIFACT_RENDER_FAILED`, `RFI_STORAGE_UNAVAILABLE`,
`RFI_ISSUE_COMMIT_FAILED`, `RFI_ARTIFACT_RECONCILIATION_REQUIRED`) propagating
its status, code, message, and request ID; and an unreachable server surfacing as
status 0 rather than a refusal, because a failed fetch does not prove the request
never arrived.

`rfi-issue-idempotency.test.ts` (16) proves the rules where they are decided:
`crypto.randomUUID` is used when available and the fallback produces a
cryptographic RFC 4122 v4 value (never `Math.random`); distinct attempts get
distinct keys within the 200-character limit; the canonical payload is stable for
an identical request and differs for any changed recipient, CC, due date, or file
set; a key is reused for a retry of the same payload in `pending`, `retryable`,
and `uncertain` states; a key is never reused once the payload changed or the
server definitively refused; the payload is locked while `pending`, `uncertain`,
or `reconcile`; an unused key is spent on edit while an unresolved one is never
silently dropped; and the failure classifier maps each documented code to
retryable, uncertain, reconcile, or rejected.

`rfi-mark-ready-react.test.tsx` (20) proves `capabilities.markReady` gates the
action, a clean draft shows **Mark ready** and a dirty draft **Save and mark
ready**, the confirmation explains the lock/absent number/return path/separate
final action, a clean draft is marked ready with no PATCH, a dirty draft saves
first with its `lockVersion` and re-reads the authoritative workspace before
`/ready`, a save failure prevents `/ready` and says the draft was not saved, a
409 conflict prevents `/ready` and reloads, a 422 refusal keeps the RFI editable
and shows the request ID, a save that succeeded while `/ready` failed says so,
client validation sends nothing at all, no local number is invented, all four
read models are invalidated, Issue RFI is primary in `ready_to_issue` with Return
to draft in the overflow, Return to draft is promoted (and not duplicated) when
`issue` is unauthorized, an issued and numbered RFI offers no Return to draft,
and an unauthorized user sees no actions at all.

`rfi-issue-dialog-react.test.tsx` (30) proves the prefilled responsible contact,
the at-least-one-recipient rule, optional CC, non-overlapping To/CC in both
directions, a real calendar due date, the prefilled due date, eligible files by
role selected by default, exclusion of another revision's attachment, the exact
selected file IDs, the record-only notice with no delivery control of any kind,
the canonical review payload, the **Issue official RFI** label (and the absence
of Save/Submit/Publish/Send), Back without issuing, one request for a triple
click, retry with the identical key and body, no second key after a network
failure, a status check that is a read rather than a second POST, a locked
payload while the outcome is unknown, a new key only after a pre-submission
payload change, a non-disclosing idempotency conflict, refetch-confirmed success
from both a network failure and `RFI_ALREADY_ISSUED`, no blind retry on
reconciliation-required, a definitive validation error staying in the workflow,
a permission loss removing the action after refetch, no false success or false
failure, dialog/field/error labelling, initial focus on the first recipient,
focus restoration to the Issue RFI trigger, refused dismissal while in flight,
and the announced pending state.

`rfi-issued-evidence-react.test.tsx` (11) proves the official PDF uses the
authenticated attachment content path and exposes no storage key, R2 URL, or
SHA-256; the issued version, issuance, dates, and To/CC snapshots render; included
files carry their role and stay distinct from the generated artifact; an empty
included list says so plainly; the evidence survives a remount; current status
and the rail read from top-level `rfi.status` (with the number and status kept
once, in the identity header); a present `officialIssue` never re-enables issue
or return-to-draft on a closed RFI; heading hierarchy stays correct with the
evidence section present; modifier-click behaviour on the download anchor is left
to the browser; long filenames, companies, and subjects render in wrapping
containers; and the register shows the server-assigned number, Open status,
party, and dates after a live issue without a manual refresh and without losing
its search/filter/sort URL state.

`rfi-issue-layout-tokens.test.ts` (11) enforces the static boundaries: no raw
colour literals, only registered `--app-*` tokens, the review grid collapsing to
one column at 760px, a full-width touch target for the official PDF on mobile,
`overflow-wrap: anywhere` on every long-value container, every grid track able to
shrink below its content, no `min-width` above 390px, the shared
`FormDialog`/`Checkbox`/`DateInput`/`Field`/`AlertDialog` rather than a
feature-local modal, no direct Radix or Lucide import, no feature-owned portal,
focus trap, focus ring, or z-index, the retained UI-7 rail layout, and that the
idempotency key, a storage key, a predicted `RFI-` number, and `localStorage` are
never rendered or used.

As with UI-6B and UI-7, `happy-dom` has no layout engine, so the 390px/430px/
834px "no horizontal overflow" requirement is proven by
`npm run evidence:rfi2b`'s `scrollWidth` assertion rather than by a unit test.
That script produced **26 deterministic captures** into `docs/evidence/rfi-2b/`;
each waits for a selector that only exists once the documented state has
rendered, asserts its CSS viewport, and fails the run on horizontal overflow.
Every failure state is produced by the real components reacting to a real server
response through the real API layer — including the pending, retryable,
reconciliation-required, and live end-to-end issue captures.

### 12B. RFI Slice 1 reconciliation evidence

Before production approval, run the guarded remote rehearsal in
`RFI_SLICE_1_ROLLOUT.md`. It must prove a populated pre-0014 migration through
0014 with resolved and unresolved Party values, response/attachment metadata,
stable IDs, zero orphans, retired legacy tables, and an exact 14-entry ledger.
Pages preview additionally requires an Access-authorized synthetic fixture and
manual Dashboard, Project Overview, register, workspace, response, Records,
navigation, mobile, Studio, and Document Library checks.

### 12C. RFI Slice 2A official issuance coverage

The Slice 2A gate includes:

- mark-ready completeness, active same-project responsible-contact, and exact
  usable template validation; complete ready success; draft-only PATCH
  enforcement;
- authorized `ready_to_issue -> draft`, edit-and-ready-again, issued/numbered
  rejection, unauthorized rejection, activity, capability, and committed-issue
  concurrency coverage;
- strict template-compiler parity/rejection, multiline/long-token/page-break,
  deterministic server-PDF, and resource-scoped canonical-idempotency tests;
- empty-database and populated post-0014 migration rehearsals through schema
  version 13 with foreign-key checks;
- successful number/revision/artifact/issuance/file/recipient/activity/API
  assertions and authorized artifact download;
- authentication, role, tenant, project, contact, file, template, request, and
  lifecycle validation;
- same-key replay, changed-request conflict, cross-RFI/project conflict,
  tenant isolation, manager non-disclosure, same-RFI concurrency, and
  same-project numbering concurrency;
- workspace reload evidence, `Current Draft`/`Original Issue` labels,
  discoverable authorized artifact download identity, and a dedicated immutable
  `RfiOfficialIssueSummary` that excludes status/capabilities while top-level
  lifecycle state advances;
- included-object matching, missing, wrong, or unavailable SHA/head evidence;
- injected renderer, R2 write/verify, sequence, revision, issuance, recipient,
  activity, D1 commit, post-commit response loss, authoritative query
  success/absence/unavailability, and compensation-delete failures;
- post-issue project, RFI-detail, contact, template-version, and renderer
  changes, plus database immutability-trigger assertions.

No successful or potentially successful issue may lose its artifact. A
confirmed absent commit may compensate; partial/unavailable evidence must
retain the object and leave explicit pending reconciliation.

## 13. Performance targets

Internal pilot targets under normal load:

- authenticated application shell: p95 under 2.5 seconds on broadband;
- project log API: p95 under 500 ms for 500 records;
- record detail API: p95 under 400 ms excluding file rendering;
- search: p95 under 800 ms for pilot dataset;
- issue transaction excluding PDF render: p95 under 1 second;
- synchronous preview render: p95 under 3 seconds;
- upload initiation: p95 under 500 ms.

Artifact generation may be asynchronous if it cannot reliably meet the UI timeout. The user must see progress and final status.

## 14. Reliability and failure injection

Test failures at each issue-transaction boundary:

- number allocated but revision insert fails;
- revision inserted but render fails;
- artifact upload fails;
- delivery provider fails;
- activity event insert fails.
- recipient snapshot or guarded D1 batch fails;
- R2 verification or compensation deletion fails.

The design must either roll back the transaction or leave a recoverable explicit state. Silent partial success is prohibited.

## 15. CI gates

Every pull request must pass:

- formatting/lint;
- type checking;
- unit tests;
- service/API tests;
- migration validation;
- build;
- security dependency scan;
- secret scan;
- visual/accessibility artifacts for affected application UI when the foundation introduces them;
- documentation tracker checks for UI program work.

Changes touching renderer output also run visual regression. Changes touching schema or authorization require the corresponding focused suite.

## 16. Release gates

Before a phase release:

- all acceptance criteria mapped to tests;
- zero open critical/high security findings;
- migration dry run completed;
- rollback/forward-fix plan reviewed;
- backup verified;
- production configuration validated;
- pilot reconciliation signed off;
- support runbook updated.

## 17. Defect severity

- **Critical:** data loss, cross-tenant exposure, unauthorized issue/publish, corrupt official numbering.
- **High:** incorrect official artifact, missing revision/history, unusable core workflow, unrecoverable delivery failure.
- **Medium:** workflow friction with safe workaround, incorrect non-authoritative display, export formatting issue.
- **Low:** cosmetic or minor usability defect without record risk.

Critical defects block release and require incident review.

## 18. Manual exploratory testing

Before pilot cutover, a project manager unfamiliar with implementation details must perform the full workflow using a prepared script while an observer records:

- confusion points;
- unexpected terminology;
- wrong defaults;
- extra steps;
- missing context;
- error recovery.

Usability findings affecting official-record safety are release blockers.

## 19. Test ownership

Developers own tests for their changes. The architect/product owner owns acceptance intent. No backlog item is complete when tests are deferred to a later “QA phase.”

## 20. Quality evidence

Store release evidence:

- commit and build identifier;
- migration version;
- test summary;
- visual baseline approval;
- known issues;
- pilot reconciliation report;
- rollback plan;
- approver and date.
