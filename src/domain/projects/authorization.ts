import type { AppSession } from "../../auth/authentication-adapter";

export type ProjectCapability =
  | "projects:create"
  | "projects:read"
  | "projects:manage"
  | "project_contacts:manage";

export class ProjectAuthorizationError extends Error {
  constructor(readonly capability: ProjectCapability) {
    super(
      "The current membership does not have the required project capability.",
    );
  }
}

export function canCreateProjects(session: AppSession): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function hasOrganizationWideProjectRead(session: AppSession): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function hasOrganizationWideProjectManagement(
  session: AppSession,
): boolean {
  return session.membershipRole === "org_admin";
}

export function hasOrganizationWideContactManagement(
  session: AppSession,
): boolean {
  return ["org_admin", "document_control_admin"].includes(
    session.membershipRole,
  );
}

export function requireProjectCreation(session: AppSession): void {
  if (!canCreateProjects(session)) {
    throw new ProjectAuthorizationError("projects:create");
  }
}
