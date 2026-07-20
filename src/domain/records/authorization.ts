import type { AppSession } from "../../auth/authentication-adapter";
import { RecordAuthorizationError, type RecordCapability } from "./errors";

export function hasOrganizationWideRecordManagement(
  session: AppSession,
): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireRecordManagement(
  session: AppSession,
  capability: RecordCapability,
  isAssignedProjectManager: boolean,
): void {
  if (
    !hasOrganizationWideRecordManagement(session) &&
    !(session.membershipRole === "project_manager" && isAssignedProjectManager)
  ) {
    throw new RecordAuthorizationError(capability);
  }
}
