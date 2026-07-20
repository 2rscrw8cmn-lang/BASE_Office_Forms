import type {
  AppSession,
  MembershipRole,
} from "../../auth/authentication-adapter";
import { requireOrganizationCapability } from "../../domain/identity/authorization";
import {
  D1MembershipsRepository,
  type OrganizationMembership,
} from "../../infrastructure/db/d1/memberships-repository";

/**
 * Membership mutations are deliberately service-only in PR 2; no invitation or
 * member-management HTTP endpoint is exposed until that workflow is designed.
 */
export class MembershipService {
  constructor(private readonly memberships: D1MembershipsRepository) {}

  async addMember(
    actor: AppSession,
    input: { userId: string; role: MembershipRole; correlationId: string },
  ): Promise<OrganizationMembership> {
    requireOrganizationCapability(actor, "members:manage");
    return this.memberships.createWithActivity(
      {
        organizationId: actor.organizationId,
        userId: input.userId,
        role: input.role,
      },
      {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "organization_membership",
        action: "membership.created",
        priorState: null,
        correlationId: input.correlationId,
      },
    );
  }
}
