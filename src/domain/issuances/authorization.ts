import type { AppSession } from "../../auth/authentication-adapter";
import { IssuanceAuthorizationError, type IssuanceCapability } from "./errors";

export function hasOrganizationWideIssuanceManagement(
  session: AppSession,
): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireIssuanceManagement(
  session: AppSession,
  capability: IssuanceCapability,
  isAssignedProjectManager: boolean,
): void {
  if (
    !hasOrganizationWideIssuanceManagement(session) &&
    !(session.membershipRole === "project_manager" && isAssignedProjectManager)
  ) {
    throw new IssuanceAuthorizationError(capability);
  }
}
