import type { Revision } from "../revisions/revision";
import { IssuanceEligibilityError } from "./errors";
import type { RevisionSnapshot } from "./issuance";

export function buildRevisionSnapshot(
  revision: Revision,
  issuedByDisplayName?: string,
): RevisionSnapshot {
  if (revision.status !== "published") {
    throw new IssuanceEligibilityError(
      "Only a published revision can be issued.",
    );
  }
  return {
    id: revision.id,
    organizationId: revision.organizationId,
    projectId: revision.projectId,
    recordId: revision.recordId,
    revisionNumber: revision.revisionNumber,
    revisionLabel: revision.revisionLabel,
    status: revision.status,
    title: revision.title,
    description: revision.description,
    discipline: revision.discipline,
    source: revision.source,
    changeSummary: revision.changeSummary,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
    ...(issuedByDisplayName ? { issuedByDisplayName } : {}),
  };
}

export function serializeRevisionSnapshot(snapshot: RevisionSnapshot): string {
  return JSON.stringify(snapshot);
}
