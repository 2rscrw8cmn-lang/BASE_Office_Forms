import type { AppSession } from "../../auth/authentication-adapter";
import { RfiAuthorizationError, type RfiCapability } from "./errors";

export function hasOrganizationWideRfiManagement(session: AppSession): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireRfiManagement(
  session: AppSession,
  capability: RfiCapability,
  isAssignedProjectManager: boolean,
): void {
  if (
    !hasOrganizationWideRfiManagement(session) &&
    !(session.membershipRole === "project_manager" && isAssignedProjectManager)
  ) {
    throw new RfiAuthorizationError(capability);
  }
}
