import type { RfiStatus } from "./rfi";
import { RfiIllegalTransitionError } from "./errors";

function requireStatus(
  status: RfiStatus,
  expected: RfiStatus,
  action: string,
): void {
  if (status !== expected) throw new RfiIllegalTransitionError(status, action);
}

export function assertCanUpdateDraft(status: RfiStatus): void {
  requireStatus(status, "draft", "be edited");
}

export function issueStatus(status: RfiStatus): RfiStatus {
  requireStatus(status, "draft", "be issued");
  return "issued";
}

export function respondStatus(status: RfiStatus): RfiStatus {
  requireStatus(status, "issued", "be responded to");
  return "answered";
}

export function closeStatus(status: RfiStatus): RfiStatus {
  requireStatus(status, "answered", "be closed");
  return "closed";
}

export function reopenStatus(status: RfiStatus): RfiStatus {
  requireStatus(status, "closed", "be reopened");
  return "answered";
}
