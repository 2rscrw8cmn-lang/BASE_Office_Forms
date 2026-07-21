import type { AppSession } from "../../auth/authentication-adapter";
import { TemplateAuthorizationError } from "./errors";

// Templates are organization-wide (not project-scoped), so publishing is
// gated by organization role alone -- the same roles that own numbering,
// controlled documents, and project setup in the domain model.
export function hasTemplateManagement(session: AppSession): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireTemplateManagement(session: AppSession): void {
  if (!hasTemplateManagement(session)) {
    throw new TemplateAuthorizationError("templates:publish");
  }
}
