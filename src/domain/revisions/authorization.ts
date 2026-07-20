import type { AppSession } from "../../auth/authentication-adapter";
import { RevisionAuthorizationError, type RevisionCapability } from "./errors";

export function hasOrganizationWideRevisionManagement(
  session: AppSession,
): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireRevisionManagement(
  session: AppSession,
  capability: RevisionCapability,
  isAssignedProjectManager: boolean,
): void {
  if (
    !hasOrganizationWideRevisionManagement(session) &&
    !(session.membershipRole === "project_manager" && isAssignedProjectManager)
  ) {
    throw new RevisionAuthorizationError(capability);
  }
}
