import type { AppSession } from "../../auth/authentication-adapter";
import type { ExternalIdentity } from "../../infrastructure/db/d1/users-repository";
import { D1MembershipsRepository } from "../../infrastructure/db/d1/memberships-repository";
import { D1UsersRepository } from "../../infrastructure/db/d1/users-repository";

export type SessionResolutionResult =
  | { resolved: true; session: AppSession }
  | {
      resolved: false;
      reason:
        | "USER_DISABLED"
        | "MEMBERSHIP_REQUIRED"
        | "MEMBERSHIP_INACTIVE"
        | "ORGANIZATION_SELECTION_REQUIRED";
    };

export class SessionResolutionService {
  constructor(
    private readonly users: D1UsersRepository,
    private readonly memberships: D1MembershipsRepository,
  ) {}

  async resolve(identity: ExternalIdentity): Promise<SessionResolutionResult> {
    const user = await this.users.upsertExternalIdentity(identity);
    if (user.status === "disabled") {
      return { resolved: false, reason: "USER_DISABLED" };
    }

    const activeMemberships = await this.memberships.listActiveForUser(user.id);
    if (activeMemberships.length === 1) {
      const [activeMembership] = activeMemberships;
      return {
        resolved: true,
        session: {
          userId: user.id,
          organizationId: activeMembership.organizationId,
          membershipRole: activeMembership.role,
          projectPermissions: [],
        },
      };
    }

    if (activeMemberships.length > 1) {
      return { resolved: false, reason: "ORGANIZATION_SELECTION_REQUIRED" };
    }

    const membership = await this.memberships.findForUser(user.id);
    return {
      resolved: false,
      reason: membership ? "MEMBERSHIP_INACTIVE" : "MEMBERSHIP_REQUIRED",
    };
  }
}
