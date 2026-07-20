import type { AppSession } from "../../auth/authentication-adapter";
import { requireOrganizationCapability } from "../../domain/identity/authorization";
import {
  D1OrganizationsRepository,
  type Organization,
} from "../../infrastructure/db/d1/organizations-repository";
import {
  D1MembershipsRepository,
  type OrganizationMember,
} from "../../infrastructure/db/d1/memberships-repository";

export class OrganizationService {
  constructor(
    private readonly organizations: D1OrganizationsRepository,
    private readonly memberships: D1MembershipsRepository,
  ) {}

  async getCurrentOrganization(
    session: AppSession,
  ): Promise<Organization | null> {
    return this.organizations.findById(session.organizationId);
  }

  async listCurrentOrganizationMembers(
    session: AppSession,
  ): Promise<OrganizationMember[]> {
    requireOrganizationCapability(session, "members:read");
    return this.memberships.listActiveForOrganization(session.organizationId);
  }
}
