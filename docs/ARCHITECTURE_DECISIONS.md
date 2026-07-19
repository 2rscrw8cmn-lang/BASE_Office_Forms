# Architecture Decisions

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
