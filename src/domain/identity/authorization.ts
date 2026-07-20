import type {
  AppSession,
  MembershipRole,
} from "../../auth/authentication-adapter";

export type OrganizationCapability = "members:read" | "members:manage";

const ROLE_CAPABILITIES: Readonly<
  Record<MembershipRole, readonly OrganizationCapability[]>
> = {
  org_admin: ["members:read", "members:manage"],
  document_control_admin: ["members:read"],
  project_manager: ["members:read"],
  contributor: ["members:read"],
  viewer: ["members:read"],
};

export class AuthorizationError extends Error {
  constructor(readonly capability: OrganizationCapability) {
    super("The current membership does not have the required capability.");
  }
}

export function hasOrganizationCapability(
  role: MembershipRole,
  capability: OrganizationCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function requireOrganizationCapability(
  session: AppSession,
  capability: OrganizationCapability,
): void {
  if (!hasOrganizationCapability(session.membershipRole, capability)) {
    throw new AuthorizationError(capability);
  }
}
