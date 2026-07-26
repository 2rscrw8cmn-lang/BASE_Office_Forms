# Architecture Decisions

**Status:** Architecture v1.0 — implementation source of truth  
**Version date:** 2026-07-19

These decisions are binding unless replaced by a later recorded decision.

## ADR-001 — Preserve the renderer

**Decision:** Keep `public/engine.js`, `public/base.css`, and the JSON definition model as the presentation layer.

**Reason:** The current renderer is the strongest completed part of the product and already supports the necessary RFI/submittal blocks.

**Consequence:** Domain services compile record data into render definitions rather than rebuilding document layout in a second system.

## ADR-002 — Projects are first-class records

**Decision:** A project is a relational entity, not a library folder.

**Reason:** Folders cannot enforce numbering, lifecycle, permissions, contacts, due dates, logs, or revisions.

## ADR-003 — Project records are separate from templates

**Decision:** Templates create records; they are not copied and treated as the entire record authority.

**Reason:** Workflow, audit, and revisions require stable identity beyond presentation JSON.

## ADR-004 — Hybrid relational and JSON data

**Decision:** Use relational common/typed fields plus flexible JSON for secondary fields.

**Reason:** Logs and workflows need indexed columns; a fully generic field system would reduce integrity and usability.

## ADR-005 — Typed first record extensions

**Decision:** Implement `rfi_details` and `submittal_details`.

**Reason:** Construction workflows are the launch product and deserve explicit constraints and queryability.

## ADR-006 — Issued revisions are immutable

**Decision:** A revision cannot be edited after issue/submit.

**Reason:** Document control requires a reliable record of what was distributed.

## ADR-007 — Separate lock version from business revision

**Decision:** Optimistic save counters are named `lock_version`; business issue numbers are record revisions.

**Reason:** The current `documents.version` is not a controlled revision.

## ADR-008 — D1 for metadata, R2 for files

**Decision:** Store files and artifacts in R2.

**Reason:** D1 and definition JSON are not appropriate for large submittal packages.

## ADR-009 — Direct-to-R2 uploads

**Decision:** Large file uploads bypass normal Worker request bodies.

**Reason:** Reliability, size, and cost.

## ADR-010 — Cloudflare Access for internal pilot

**Decision:** Use an authentication adapter backed by Cloudflare Access for the BASE pilot.

**Reason:** Fast internal security without forcing premature customer identity design.

**Consequence:** Domain tables remain provider-neutral for later OIDC/SAML identity.

## ADR-011 — Secure links before email client

**Decision:** Build scoped share links and delivery records before full email functionality.

**Reason:** Controlled distribution is required; inbox/threading is not.

## ADR-012 — Delivery is an event, not a checkbox

**Decision:** Replace ambiguous “Sent” state with recipient and timestamped delivery records.

**Reason:** Auditability and retries.

## ADR-013 — Status and disposition are separate

**Decision:** Workflow status and reviewer disposition use separate fields.

**Reason:** “Under review” and “Approved” answer different questions.

## ADR-014 — Server-side numbering

**Decision:** Official numbers are assigned atomically by the API at first issue/submit.

**Reason:** Client-generated sequences create collision and audit risk.

## ADR-015 — Drafts may be unnumbered

**Decision:** RFI drafts do not reserve official numbers by default.

**Reason:** Avoid gaps from abandoned drafts while preserving issue integrity.

## ADR-016 — Submittal stable item plus revisions

**Decision:** Submittal base number remains stable; resubmissions increment revision.

**Reason:** This matches the current `06-6410-01-00` operating pattern and preserves review history.

## ADR-017 — Logs are queries

**Decision:** Working logs are generated from records.

**Reason:** Manually maintained log documents duplicate the source data.

## ADR-018 — Additive migration

**Decision:** Keep current `folders` and `documents` during transition.

**Reason:** Avoid breaking the useful shared library and renderer workflow.

## ADR-019 — AI cannot execute official actions

**Decision:** AI produces proposals only.

**Reason:** Numbering, issue, approval, publication, permission, and deletion require deterministic control and explicit user action.

## ADR-020 — Task-specific AI interface

**Decision:** Launch AI as defined actions rather than a general chatbot.

**Reason:** Better context control, structured output, evaluation, and user trust.

## ADR-021 — Separate application UI from controlled-document styling

**Decision:** The authenticated application uses application-owned styles and components. `public/base.css` remains controlled-document styling and is not the application design system.

**Reason:** Loading generic document and application rules together causes collisions, context-dependent components, and visual drift.

**Consequence:** Neutral brand tokens may be shared, but selectors, resets, layout rules, controls, and responsive behavior remain separated. Renderer output must remain compatible.

## ADR-022 — Incrementally adopt React, TypeScript, and Vite for the application workspace

**Decision:** Migrate the application workspace incrementally to React + TypeScript + Vite while preserving current routes, APIs, Cloudflare deployment, and legacy renderer/library compatibility.

**Reason:** The framework-free modules have established the product architecture but now reproduce routing, forms, dialogs, state, focus, and component behavior across features. Incremental adoption reduces continued custom framework work without requiring a domain rewrite.

**Consequence:** React controls application composition; `public/engine.js` remains the controlled presentation engine. Migration occurs by reviewable route groups with compatibility mounting until parity is complete.

## ADR-023 — Use shared BASE components and Radix behavior primitives

**Decision:** Reusable application controls and patterns are BASE-owned components. Radix may provide complex accessible behavior, and Lucide is the application icon family.

**Reason:** A coherent component contract prevents feature-specific buttons, dialogs, menus, fields, badges, focus behavior, and icon families.

**Consequence:** Default third-party visual themes are not the product design. BASE tokens, variants, accessibility, testing, and UI Lab examples remain authoritative.

## ADR-024 — Use Tabulator only through BaseDataGrid

**Decision:** Tabulator is not adopted for the RFI register. If a future
high-volume register adopts Tabulator, it uses one `BaseDataGrid` adapter;
feature modules do not instantiate or theme Tabulator directly.

**Reason:** Spike 0 found that Tabulator's documented interaction model cannot
preserve the RFI register's required click-to-select, Enter/type-to-edit, and
non-editing arrow-key navigation. The RFI list is also too small for
virtualization to justify the additional ~102 KB gzip dependency. Direct
per-feature integrations would still create inconsistent save, conflict,
keyboard, responsive, styling, and lifecycle behavior.

**Consequence:** The RFI register stays on its controlled custom table.
`BaseDataGrid` remains the sole permitted adapter boundary for any later
accepted use and owns mount/destroy, theme, keyboard contract,
capability-based editability, async state, rollback, conflict refresh,
accessibility, responsive behavior, and test utilities. The API remains
authoritative.

## ADR-025 — Repository documentation is the durable agent handoff

**Decision:** Agents must use and update repository source-of-truth documents, current-state trackers, tests, and PR evidence before handoff.

**Reason:** Branching chats and disconnected coding sessions lose context and repeatedly restart or diverge from completed work.

**Consequence:** `AGENTS.md`, `CURRENT_APPLICATION_STRUCTURE.md`, applicable program trackers, and PR closeout evidence are mandatory. Chat summaries do not supersede repository state.

## ADR-026 — React compatibility host before feature migration

**Decision:** The authenticated entry mounts a React/Vite host that boots the
existing `createAppShell()` implementation. Feature routes remain in their
browser modules until their scheduled migration phase.

**Reason:** This establishes a deterministic application asset/runtime boundary
without duplicating route, API, focus, session, or feature behavior.

**Consequence:** The host owns only bootstrap, error, and unmount lifecycle in
UI-2. It must not import renderer definitions or recreate domain behavior in
React.

## ADR-027 — Neutral brand token bridge

**Decision:** Only shared BASE color and type values live in
`public/brand-tokens.css`. The authenticated entry loads that bridge plus
application CSS; controlled-document pages load it through `public/base.css`.
Document geometry and renderer selectors remain in `base.css`.

**Reason:** The application previously inherited generic document rules and
document-level body behavior from `base.css`. An explicit, small token bridge
separates the systems without changing official output.

**Consequence:** Token values must remain synchronized until a later cleanup
has approved visual evidence to retire the legacy renderer import.

## ADR-028 — Reject Tabulator for the RFI register after Spike 0

**Reconciliation note (2026-07-23):** PR #36 preserves the controlled semantic
RFI table and approved expandable draft-editor model. No RFI route is pending
Tabulator adoption; any future high-volume register reconsideration requires a
new ADR and interaction/accessibility proof.

**Decision:** Reject Tabulator for the production RFI register. Retain the
existing controlled custom table and revisit Tabulator only for a future
high-volume register, log, or export surface.

**Reason:** The spike reproduced saves, validation, conflicts, URL state, and
mobile cards, but documented Tabulator APIs could not reproduce the required
keyboard workflow without unsupported internals. Its scale advantage begins
well beyond expected RFI list sizes.

**Consequence:** UI-5 must not make RFI delivery depend on Tabulator. A future
proposal needs a fresh acceptance decision, assistive-technology evidence, a
select-versus-edit interaction decision, and a bundle-splitting plan.

## ADR-029 — Promote the shared RFI revision and commit R2 before D1 issue state

**Decision:** The first official RFI issue promotes the existing authoritative
shared revision 1 from `draft` to `published` and presents it as `Original
Issue`. It does not introduce revision 0 or a second RFI revision spine.
Official artifact generation uses a provider-neutral server renderer port.
The operation writes and verifies the deterministic private R2 artifact before
one guarded D1 batch commits numbering, revision, issuance, snapshots, activity,
and idempotency.

**Reason:** `records.current_revision_id` and the shared revision invariant are
already authoritative. D1 and R2 cannot participate in one transaction, and an
official D1 row must never point to an absent artifact. R2-first permits object
verification before official state; deterministic keys and delete/orphan
compensation make failure explicit and retry-safe.

**Consequence:** The issue route is allowed only from `ready_to_issue`.
Committed RFI and issuance numbers are never reused. A failed D1 batch deletes
the new R2 object; failed deletion creates a durable reconciliation row.
Official issue snapshots and completed idempotency results are immutable.
`record_only` is the only Slice 2A delivery mode.

## Deferred decisions

These choices are intentionally deferred until their roadmap phase:

- commercial identity provider
- email delivery provider
- server-side PDF rendering provider/runtime
- malware scanning provider
- billing provider
- final product name
- customer-specific retention defaults

Deferred vendor choices must conform to the interfaces and domain rules in this package.
