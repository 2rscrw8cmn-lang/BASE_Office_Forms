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
- keyboard and focus tests for dialogs, menus, tabs, drawers, and grids;
- route parity and browser history tests during shell migration;
- server-capability and denied-action tests;
- BaseDataGrid mount/destroy, editing, validation, rollback, save-state, and conflict-refresh tests;
- URL-backed search/filter/sort restoration;
- first-use empty versus filtered-empty distinction;
- desktop, tablet, and mobile visual evidence;
- accessibility scans plus manual critical keyboard journeys;
- tests or lint rules preventing raw feature-specific visual conventions and direct Tabulator use;
- renderer and legacy-route regressions during application/document CSS separation.

A UI migration is not accepted because it looks cleaner. Behavioral parity, accessibility, authoritative permissions, failure recovery, and documentation closeout are required.

### 12A-i. UI-3 component library test coverage (implemented)

The UI-3 BASE component library satisfies the §12A component requirements with
five Happy DOM + Testing Library suites (opted in per file with
`// @vitest-environment happy-dom`; shared setup in
`tests/helpers/setup-component-dom.ts` registers jest-dom, auto-cleanup, and the
Radix pointer/observer polyfills):

- `tests/unit/base-components-behavior.test.tsx` — explicit variants/states
  (button click/type/loading, keyboard checkbox toggle, Field id/required/
  aria-invalid/aria-describedby/error wiring).
- `tests/unit/base-components-keyboard.test.tsx` — keyboard and focus for
  dialogs, drawers, tabs, menus, and the command palette (labelling, focus trap,
  Escape, focus restoration, arrow navigation, activation).
- `tests/unit/base-components-accessibility.test.tsx` — accessible names for
  icon-only controls, decorative-vs-meaningful icons, text-not-colour status,
  labelled groups/landmarks, and error/save live regions.
- `tests/unit/base-component-tokens.test.ts` — token/lint enforcement: no raw
  colour literals in component or lab CSS, every `--app-*` token registered and
  declared, brand tokens read only through documented fallbacks, and
  `lucide-react`/`radix-ui` imported only from their single allowed locations.
- `tests/unit/ui-lab-catalog.test.tsx` — the UI Lab renders the real production
  components across every required state (default/hover/focus/selected/disabled/
  loading/error/long-text/empty) without throwing.

Committed desktop and mobile UI Lab captures provide the visual evidence for the
shared patterns (`docs/evidence/ui-3/`). An automated pixel-baseline
visual-regression harness remains UI-10 scope.

### 12B. RFI Slice 1 reconciliation evidence

Before production approval, run the guarded remote rehearsal in
`RFI_SLICE_1_ROLLOUT.md`. It must prove a populated pre-0014 migration through
0014 with resolved and unresolved Party values, response/attachment metadata,
stable IDs, zero orphans, retired legacy tables, and an exact 14-entry ledger.
Pages preview additionally requires an Access-authorized synthetic fixture and
manual Dashboard, Project Overview, register, workspace, response, Records,
navigation, mobile, Studio, and Document Library checks.

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
