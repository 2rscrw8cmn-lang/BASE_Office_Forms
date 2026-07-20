import type { AppSession } from "../../auth/authentication-adapter";
import { FileAuthorizationError, type FileCapability } from "./errors";

export function hasOrganizationWideFileManagement(
  session: AppSession,
): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireFileManagement(
  session: AppSession,
  capability: FileCapability,
  isAssignedProjectManager: boolean,
): void {
  if (
    !hasOrganizationWideFileManagement(session) &&
    !(session.membershipRole === "project_manager" && isAssignedProjectManager)
  ) {
    throw new FileAuthorizationError(capability);
  }
}
