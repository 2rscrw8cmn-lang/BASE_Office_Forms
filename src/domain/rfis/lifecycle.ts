import type { RfiStatus } from "./rfi";
import { RfiIllegalTransitionError } from "./errors";

// Binding RFI lifecycle (docs/WORKFLOWS.md §5). Every transition validates the
// current state here before the repository applies it under an atomic guard.
//
//   draft ─┬─▶ ready_to_issue ─▶ open ─▶ response_received ─┬─▶ closed
//          │                       ▲            │            │
//          │                       └────────────┘            └─▶ returned_for_clarification ─▶ open
//          └────────────── void ◀── (draft | ready_to_issue | open | response_received)
//
// Only `draft` fields are editable. Official numbering happens at `issue` only.

const EDITABLE_STATUSES: readonly RfiStatus[] = ["draft"];

const VOIDABLE_STATUSES: readonly RfiStatus[] = [
  "draft",
  "ready_to_issue",
  "open",
  "response_received",
  "returned_for_clarification",
];

export function canUpdateDraft(status: RfiStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function assertCanUpdateDraft(status: RfiStatus): void {
  if (!canUpdateDraft(status)) {
    throw new RfiIllegalTransitionError(status, "be edited");
  }
}

export function canAttach(status: RfiStatus): boolean {
  // Attachments belong to the pre-issue draft/revision context.
  return status === "draft" || status === "ready_to_issue";
}

export function canMarkReady(status: RfiStatus): boolean {
  return status === "draft";
}

export function markReadyStatus(status: RfiStatus): RfiStatus {
  if (!canMarkReady(status)) {
    throw new RfiIllegalTransitionError(status, "be marked ready to issue");
  }
  return "ready_to_issue";
}

export function canIssue(status: RfiStatus): boolean {
  return status === "draft" || status === "ready_to_issue";
}

export function issueStatus(status: RfiStatus): RfiStatus {
  if (!canIssue(status)) {
    throw new RfiIllegalTransitionError(status, "be issued");
  }
  return "open";
}

export function canRespond(status: RfiStatus): boolean {
  return status === "open" || status === "returned_for_clarification";
}

export function respondStatus(status: RfiStatus): RfiStatus {
  if (!canRespond(status)) {
    throw new RfiIllegalTransitionError(status, "be responded to");
  }
  return "response_received";
}

export function canReturnForClarification(status: RfiStatus): boolean {
  return status === "response_received";
}

export function returnForClarificationStatus(status: RfiStatus): RfiStatus {
  if (!canReturnForClarification(status)) {
    throw new RfiIllegalTransitionError(
      status,
      "be returned for clarification",
    );
  }
  return "returned_for_clarification";
}

export function canClose(status: RfiStatus): boolean {
  return status === "response_received";
}

export function closeStatus(status: RfiStatus): RfiStatus {
  if (!canClose(status)) {
    throw new RfiIllegalTransitionError(status, "be closed");
  }
  return "closed";
}

export function canReopen(status: RfiStatus): boolean {
  return status === "closed";
}

export function reopenStatus(status: RfiStatus): RfiStatus {
  if (!canReopen(status)) {
    throw new RfiIllegalTransitionError(status, "be reopened");
  }
  return "open";
}

export function canVoid(status: RfiStatus): boolean {
  return VOIDABLE_STATUSES.includes(status);
}

export function voidStatus(status: RfiStatus): RfiStatus {
  if (!canVoid(status)) {
    throw new RfiIllegalTransitionError(status, "be voided");
  }
  return "void";
}
