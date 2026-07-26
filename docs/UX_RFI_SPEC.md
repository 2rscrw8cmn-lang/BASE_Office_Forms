# RFI UX Specification (Vertical Slice Addendum)

Status: binding for the RFI vertical slice. This document is an addendum to
`UX_PRODUCT_SPEC.md`, which explicitly excluded the full RFI redesign from the
earlier Records/Revisions slice. Where this document and the general UX spec
overlap, this document governs RFIs specifically. It does not contradict the
general spec; it extends it.

## 1. Product model (one source of truth)

An RFI is a **structured project record**, not a PDF and not an uploaded
document. The register table, the full workspace editor, the rendered document
view, the attachments, and the eventual response all operate on the **same**
authoritative RFI record.

The generated PDF is an artifact produced at issue — never the editable source.

The following are stored once on the RFI record and are never duplicated as
independently editable copies: subject, question, contractor suggestion, drawing
/ specification references, requested response date, responsible party, response,
cost impact, schedule impact.

## 2. Template versus record

An RFI is created **from** the approved BASE RFI template (`base-rfi`). The
project user fills the RFI. The project user never edits template structure,
block layout, labels, company branding, the renderer definition, or the
document-control structure. Users are never redirected to Studio to complete an
RFI. Studio remains the global administrative tool for designing reusable
templates.

The template binding is stored on the RFI as `template_version_id`, resolved
from the organization's published `base-rfi` template version (seeded on first
use). See §9 for the governance gap this defers.

## 3. RFI register — `/projects/:projectId/rfis`

The primary operational RFI screen.

- **Desktop**: a semantic, comfortably compact data table.
- **Mobile**: dedicated RFI cards. The desktop table is never horizontally
  squeezed onto a phone.

Approved desktop columns (binding, per §13): RFI, Subject, Status, Assigned
to, Due, Updated, and an accessible visually unlabeled Actions column. Draft
identity uses the shared `Draft` badge; issued rows use the authoritative
official number. Subject carries a restrained question summary. Editable drafts
expose an overflow menu ordered `Edit details`, then `Open RFI`; locked/issued
rows expose only `Open RFI`.
No standalone sort dropdown or RFI-number filter is added.

Rules:

- The official RFI number remains blank before issue and the register shows a
  **Draft** badge instead. Numbers are never generated in the browser.
- The database UUID is never displayed as an ID number.
- An optional imported legacy source ID may be displayed only when it already
  exists (migration/reconciliation). It is visibly secondary and never competes
  with the official RFI number.

Supported controls: search, status filtering, responsible-party filtering,
overdue filtering (server-computed), sorting, a clear filtered-empty state, a
loading state, an error state, and an authorization (missing) state. Filter and
sort state are preserved in the URL query string.

The whole authorized list loads in **one** server read model
(`GET /projects/:id/rfis`); search/filter/sort run in the browser over that
already-authorized data and are never an authorization boundary.

## 4. Register editing boundaries

Convenient draft editing is offered through one shared responsive Drawer (see
§13), never a spreadsheet cell editor or inline table row. It opens from Add
RFI, a draft row's primary area, or `Edit draft`; it is a right-side panel on
desktop/tablet and full-screen on mobile. It covers every currently mutable
structured field: Subject, Assigned to, Response due, Question, Contractor
recommendation, Drawing references, and Specification references. The two
reference fields live in a shared `Collapsible` labeled Additional
information.

Boundaries:

- Edit eligibility comes from the server (`row.capabilities.updateDraft`), never
  inferred from role names in the browser.
- Status is never a free-form editable field. Status changes use explicit domain
  actions.
- Submit/Issued Date and RFI Number are never typed manually.
- Only one draft Drawer is open at a time; closing returns focus to the
  originating row action or Add RFI control.
- Its footer provides secondary `Open` (with the shared `file-text` icon) and
  `Close`. `Open` blurs the focused field, reuses its changed-only commit, and
  waits for pending work; it navigates to the workspace only after no change or
  a successful save. Validation, 403, failed-save, and 409 conflict feedback
  retain the Drawer for correction or retry.

A successful field update persists through the authoritative RFI update service,
updates the row without losing table context, writes the required activity
event, shows saved/error feedback, and uses optimistic concurrency via
`lockVersion` (a stale write returns `409 RFI_VERSION_CONFLICT`, the browser
reloads the latest authorized values while preserving URL filters/sort, and the
editor shows a clear conflict/review-and-retry message).

## 5. Create draft RFI

A capability-gated **"Add RFI"** action (`capabilities.createRfi`) creates one
unnumbered structured RFI record from the default approved RFI template
binding directly from the register.

- The draft is created with placeholder Subject/Question text ready to edit;
  no separate creation form is shown.
- No official RFI number is assigned during creation.
- After creation, the new row is added to the register, incompatible
  search/status filtering is cleared, the new draft Drawer (§13) opens
  automatically, focus moves to the Subject field, and the change is
  announced.
- Supporting attachments and long-form fields remain fully editable from the
  register editor or, for full context, the RFI workspace (§6); creation does
  not navigate to the workspace.

## 6. RFI workspace — `/projects/:projectId/rfis/:rfiId`

Route-addressable and connected to the register (returning preserves prior
search/filter/sort/scroll where practical, via browser history and URL state).

Structure:

- **Header**: RFI Number or "Unnumbered Draft", Subject, project identity,
  workflow status, responsible party, requested response date, and the primary
  lifecycle action when authorized.
- **RFI information**: Subject, Question, Contractor Suggestion, Drawing/spec
  references, Responsible party, Requested response date. Long-form fields are
  edited here (draft only) through the same authoritative update service and
  `lockVersion`.
- **Project-populated information**: project name, BASE internal project number,
  client/architect/owner numbers where configured, project address, organization
  identity, and routing. These come from the project/organization records and are
  never duplicated as manually typed RFI fields.
- **Supporting attachments**: use the RFI attachment system, each with an
  explicit role (`supporting_attachment`, `reference_drawing`). Files remain
  associated with the exact RFI draft/revision context.
- **Document view**: a read-only, template-bound rendering of the current RFI and
  project values. The user edits structured RFI fields, never the template
  definition. No separate RFI PDF upload workflow exists.
- **Activity**: the timeline of meaningful events (created, subject changed,
  question changed, responsible party changed, response date changed, attachment
  added). Raw activity JSON is never exposed.

## 7. Table/detail shared-data rule

The register row and the workspace read the **same** authoritative RFI record
through two task-shaped read models (one list, one workspace). Editing a field in
the register is immediately reflected in the workspace and vice versa. Read
models never implement a second lifecycle; transactional endpoints remain the
write authority.

## 8. Lifecycle, numbering, issue / response / export sequence

Binding workflow states:

```
draft → ready_to_issue → open → response_received → closed
```

Additional states: `returned_for_clarification`, `void`. Overdue and due-soon are
**calculated** conditions, never manually selected statuses.

- Official numbering occurs only during **issue**, server-side and
  project-scoped (`RFI-001`). Issued revisions and artifacts are immutable.
- Every transition validates current state and authorization, writes an activity
  event, and uses idempotency where required.

Sequence across the vertical slice (this slice delivers the register + draft
workspace; later slices build on the preserved architecture):

- **Slice 2A backend — Issue (implemented, review/rollout pending)**:
  ready-to-issue validation, sequential numbering,
  project/routing snapshot, immutable issued revision, generated official PDF,
  issuance record, durable idempotency, and D1/R2 compensation. The shared
  revision is presented as `Original Issue`; only `record_only` is supported.
- **Slice 2B UI/delivery**: capability-gated Issue dialog and result/artifact
  presentation against the Slice 2A API contract. Email/share delivery remains
  later work.
- **Slice 3 — Response/Close**: response text/responder/returned date, response
  attachments, immutable response snapshot, cost/schedule impacts, close /
  clarification / reopen / void.
- **Slice 4 — Log export**: server-side PDF/XLSX/CSV export from the filtered
  query, stored export artifact, later secure sharing.

## 9. Permissions

All project/organization boundaries are enforced server-side. The browser uses
normalized, server-derived capabilities (`createRfi`, `updateDraft`,
`uploadAttachment`, `markReady`, `issue`, `recordResponse`,
`returnForClarification`, `close`, `reopen`, `void`). Only capabilities that are
actually implemented and authoritative are returned. Cross-tenant and
inaccessible project/RFI results use the generic not-found behavior.

## 10. Desktop/mobile behavior

Uses the existing BASE application shell and visual language. Desktop uses the
available width as a clean construction-management register; rows stay compact
while Question/Response summaries wrap or truncate intentionally, with full text
in the workspace. Mobile renders RFI cards, not a compressed table. Status is
always conveyed with text (never color alone).

## 11. Architecture boundary

1. **Storage model.** Every RFI is a stable `records` row with a one-to-one
   `rfi_details` extension. Common identity, title, workflow, responsible
   contact, dates, template binding, and lock state are authoritative on the
   record. RFI-specific question, suggestion, references, response, and impact
   fields remain in the extension. Draft and supporting files use the existing
   `record_revisions` and `revision_files` spine with explicit file roles.
   Migration 0014 preserves the prior RFI id as the record id and records a
   permanent reconciliation map.

2. **Issuance boundary.** Slice 2A enables the server issue operation only from
   `ready_to_issue`. It atomically commits the immutable promoted revision,
   artifact metadata, generic issuance/file snapshots, frozen
   template/render/recipient snapshots, timestamp, activity, number, and
   idempotency result after private R2 verification. The future UI exposes the
   action only when `capabilities.issue` is true. Previously consumed legacy
   numbers remain preserved.

3. **Template governance.** Full Phase-3 template governance (versioned template
   migrations, template lifecycle management, per-project template selection) is
   not built here. The RFI slice introduces only the narrow binding boundary: an
   RFI draft binds to the published `base-rfi` template version, seeded per
   organization on first use. `RfiTemplateBindingService` is the single coupling
   point; broadening it is deferred.

## 12. Acceptance criteria

## 13. Approved Slice 1 interaction model

PR #40 approved the controlled semantic-table foundation used by draft PR #36
(`public/rfis-view.js`): ordinary cursor/text selection, per-field
save/validation states, capability-gated direct editing, and deliberate mobile
behavior. It is not a spreadsheet/grid prototype and does not adopt Tabulator.
UI-5 ports those behavioral contracts — register only, not workspace — to
`src/ui/features/rfis/` and applies the approved mockup refinement: compact
desktop table, dedicated mobile cards, and one shared responsive Drawer for Add
and draft editing. `public/rfis-view.js` remains rollback/reference coverage
until a later cleanup phase. The register and workspace retain server-derived
capabilities and lifecycle authority.

1. An authorized user can open a project RFI register.
2. The register shows factual RFI rows from one server read model.
3. An authorized user can create an unnumbered RFI draft.
4. The new draft is associated with the approved/default RFI template binding.
5. The register and full workspace display the same authoritative data.
6. All permitted structured draft fields can be edited from the register's
   shared responsive Drawer (§13), never a spreadsheet/grid cell editor or
   inline table row.
7. The RFI workspace presents the same authoritative content using the Documents
   hierarchy and a read-only renderer preview.
8. Project information populates from the project record and is not duplicated.
9. Supporting attachments remain associated with the exact RFI draft context and
   carry an explicit role.
10. A live/read-only document view uses the template without exposing Studio
    editing.
11. No official number is shown before issue.
12. Permissions and lifecycle eligibility come from the server.
13. Mobile uses RFI cards instead of a compressed desktop table.
14. Tests cover authorization, tenancy, concurrency, activity, and data
    consistency.
15. Existing document-control and legacy Studio/Library behavior continues to
    pass.
