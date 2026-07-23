# Engineering Standards

**Status:** Architecture v1.0 — binding implementation rules

## 1. Guiding rule

Code must make the official-record invariants obvious. Clever abstractions that hide authorization, state transitions, transaction boundaries, or storage behavior are discouraged.

## 2. Target repository structure

```text
public/                       Current client and renderer assets
functions/                    Cloudflare request entrypoints
src/
  domain/                     Entities, values, invariants, state machines
  application/                Use cases and transaction orchestration
  infrastructure/
    db/                       D1 repositories and migrations
    storage/                  R2 implementation
    auth/                     Identity adapter
    rendering/                Renderer adapter and artifact service
    delivery/                 Email/share implementations
    ai/                       Provider adapters and job runners
  http/                       Route handlers, schemas, response mapping
  ui/                         Modular client code as migration allows
tests/
  fixtures/
  unit/
  service/
  integration/
  e2e/
```

The current application may be migrated incrementally. New domain behavior must not be added only inside a large catch-all Pages Function.

## 3. Dependency direction

- Domain code depends on no Cloudflare, database, UI, or provider APIs.
- Application services depend on domain interfaces.
- Infrastructure implements interfaces.
- HTTP/UI layers call application services.
- The renderer is accessed through an adapter with explicit input/output types.

Do not call D1 directly from UI code. Do not embed authorization decisions only in route handlers.

## 4. TypeScript rules

- Strict mode enabled.
- Avoid `any`; use `unknown` and validate.
- Domain IDs use branded/string wrapper types where practical.
- Enumerations are closed unions with conversion at boundaries.
- Dates are explicit `LocalDate` strings or UTC timestamps; do not mix them.
- Money uses integer minor units.
- Functions returning fallible results use explicit typed errors or result objects where appropriate.
- Exhaustive switches are required for workflow states.

## 5. Validation

Validate at two layers:

1. boundary/schema validation for shape and primitive constraints;
2. domain validation for state, authorization context, relationships, and invariants.

Client-side validation improves UX but never substitutes for server validation.

## 6. Domain services

Official transitions must be implemented as named use cases, such as:

- `IssueRfi`
- `RecordRfiResponse`
- `CloseRfi`
- `SubmitSubmittalRevision`
- `ReturnSubmittalRevision`
- `PublishTemplateVersion`

Do not implement official transitions as a generic `updateRecord(status)` operation.

## 7. Transactions

Use one database transaction for all relational steps that must succeed together. External side effects occur through an outbox/job pattern where necessary.

An issue operation must not send email inside a transaction and then roll back the database. Persist the official issue and delivery intent, commit, then process delivery idempotently.

## 8. Repository interfaces

Repositories expose domain-oriented methods, not generic arbitrary SQL access to application services. Examples:

- `findProjectForUpdate`
- `allocateSequence`
- `insertRecordRevision`
- `appendActivityEvent`
- `listRfisForLog`

Raw SQL remains in infrastructure.

## 9. Database standards

- `TEXT` UUID primary keys.
- `organization_id` on tenant-owned tables.
- Foreign keys enabled.
- Explicit indexes for common filters and joins.
- Check constraints for stable enumerations where migrations remain manageable.
- `created_at`, `created_by`, and appropriate update metadata.
- Immutable tables protected by repository/service policy and tests.
- Soft-delete only where domain semantics support it; issued records use void/supersede states.
- JSON columns are allowed for snapshots and renderer definitions, not as a replacement for queryable domain fields.

## 10. Migration standards

- One numbered migration per coherent schema change.
- Never edit an applied migration.
- Migrations are additive when possible.
- Destructive changes require a staged expand/migrate/contract plan.
- Backfills must be restartable and observable.
- Each migration includes operational notes in the pull request.
- Existing `documents` records remain readable throughout the platform migration.

## 11. API handler standards

Handlers perform:

1. authentication/context resolution;
2. request schema parsing;
3. application-service invocation;
4. error-to-HTTP mapping;
5. response serialization.

Handlers do not contain multi-step business logic.

## 12. Error taxonomy

Create stable error codes for:

- authentication;
- authorization;
- validation;
- not found;
- version conflict;
- invalid transition;
- numbering conflict;
- file unavailable;
- renderer failure;
- delivery failure;
- provider unavailable.

Log internal context, but return safe messages.

## 13. Logging

Structured logs include:

- request ID;
- organization ID;
- user ID;
- project ID when applicable;
- record ID when applicable;
- operation;
- outcome;
- duration;
- safe error code.

Never log edit tokens, share tokens, authentication credentials, full document contents, response bodies, or confidential file URLs.

## 14. Audit events

Audit/domain events are not ordinary debug logs. They are durable application data with stable event names and safe payload schemas. Event payload changes require backward-compatible versioning.

## 15. Security coding rules

- Deny by default.
- Resolve resource ownership from the database; do not trust client-provided organization IDs.
- Use constant-time comparison for secrets/tokens.
- Store only token hashes.
- Short-lived signed URLs.
- Content Security Policy and secure headers.
- Sanitize rendered user content according to renderer rules.
- Parameterized SQL only.
- Explicit CORS policy; same-origin by default.
- Rate-limit public and expensive endpoints.
- No secrets in client bundles or repository.

## 16. Renderer integration

- Preserve existing definition compatibility.
- Validate definition before rendering.
- Snapshot all render inputs used for official artifacts.
- Record renderer version.
- Rendering must not fetch mutable project data after a revision snapshot is created.
- Browser preview and official artifact must use equivalent rendering rules.
- Official artifacts are generated server-side or by a controlled job—not trusted as arbitrary browser uploads.

## 17. Front-end and application UI rules

- Use semantic HTML and the approved application component library.
- Centralize API calls and error handling.
- Do not duplicate workflow rules in multiple views; use capabilities returned by the API plus client UX checks.
- Avoid destructive icon-only controls.
- Preserve unsaved drafts on recoverable navigation when practical.
- Clearly distinguish draft, editing, saving, saved, failed, offline, and conflict states.
- Do not optimistically claim official issuance before server confirmation.
- Follow `APP_UI_FOUNDATION.md` and the active phase in `UI_IMPLEMENTATION_PLAYBOOK.md`.
- Keep application UI styles separate from controlled-document styles. Application feature code does not add rules to `public/base.css`.
- Shared problems use shared components. Feature code does not create local button, badge, dialog, field, page-header, filter-toolbar, empty-state, or focus systems.
- Use semantic application tokens rather than raw colors. Approved data visualizations are documented exceptions.
- Use the approved icon family through one icon component.
- Tabulator is instantiated only through the approved `BaseDataGrid` adapter after the spike exit gate.
- Client code never infers authorization from role-name strings.
- Desktop, tablet, and mobile behavior are deliberate and tested.
- UI changes cover loading, populated, first-use empty, filtered empty, error/retry, permission, validation, and conflict states as applicable.

## 18. Feature flags

Use organization/project-scoped flags for risky phase rollout:

- new project workspace;
- RFI native workflow;
- R2 files;
- submittals;
- external shares;
- AI capabilities.

Flags are temporary rollout tools, not permanent branching architecture.

## 19. Pull request standards

Each PR includes:

- problem and scope;
- architecture and current-structure references;
- UI-foundation and active-phase references for UI work;
- schema/API impact;
- security and tenant-isolation impact;
- dependency and license impact;
- migration, deployment, reconciliation, and rollback notes;
- tests and checks;
- desktop/mobile screenshots or a factual explanation when capture is unavailable;
- accessibility and keyboard evidence for interactive UI;
- documentation updated, including `UI_PROGRAM_STATUS.md` for UI work;
- known limitations and the exact next recommended action.

Keep PRs vertically coherent and reviewable. Do not mix broad refactors with workflow features.

## 20. Commit standards

Use concise imperative/semantic messages. Every commit on a shared branch must build or be intentionally marked as intermediate within a PR branch. Do not commit generated secrets, local databases, or production exports.

## 21. Documentation standards

- Architecture docs are versioned with code.
- Significant decisions add or update an ADR.
- API contract changes update `API_CONTRACTS.md`.
- Workflow changes update `WORKFLOWS.md` and tests.
- Schema changes update `DATA_MODEL.md`.
- Runtime, route, dependency, style, component, or file-location changes update `CURRENT_APPLICATION_STRUCTURE.md`.
- Every UI-related PR updates `UI_PROGRAM_STATUS.md` with completion evidence, limitations, and the next action.
- New source-of-truth documents are linked from the root README and this documentation index.
- Temporary implementation notes and chat summaries do not override binding architecture or the living repository handoff.

## 22. Dependency policy

Prefer small, well-maintained dependencies with clear licenses. Before adding a dependency, document:

- purpose;
- why platform/native code is insufficient;
- maintenance activity;
- bundle/runtime impact;
- security posture;
- replacement strategy.

Avoid adopting a large framework solely to solve one small concern.

## 23. Definition of done

A code change is done only when:

- behavior matches architecture and acceptance criteria;
- tests exist and pass;
- authorization is covered;
- audit effects are covered;
- migration is safe;
- UI follows approved application patterns and handles loading, first-use empty, filtered empty, error, permission, validation, and conflict states as applicable;
- desktop, tablet, mobile, keyboard, focus, and visual evidence are complete for UI changes;
- documentation and living program trackers are updated;
- the final handoff identifies branch/PR, checks, screenshots, limitations, rollback, and next action;
- observability is sufficient for support;
- no critical TODO is deferred silently.
