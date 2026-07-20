import type { RevisionStatus } from "./revision";
import { RevisionIllegalTransitionError } from "./errors";

function requireStatus(
  status: RevisionStatus,
  expected: RevisionStatus,
  action: string,
): void {
  if (status !== expected) {
    throw new RevisionIllegalTransitionError(status, action);
  }
}

export function assertIsDraft(status: RevisionStatus): void {
  requireStatus(status, "draft", "be edited");
}

export function publishStatus(status: RevisionStatus): RevisionStatus {
  requireStatus(status, "draft", "be published");
  return "published";
}

export function supersedeStatus(status: RevisionStatus): RevisionStatus {
  requireStatus(status, "published", "be superseded");
  return "superseded";
}
