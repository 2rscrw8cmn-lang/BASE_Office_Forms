import type { MembershipRole } from "../../../auth/authentication-adapter";
import type { NewActivityEvent } from "./activity-events-repository";

export type MembershipStatus = "active" | "invited" | "disabled";

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
}

export interface OrganizationMember extends OrganizationMembership {
  email: string;
  displayName: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  created_at: string;
}

interface MemberRow extends MembershipRow {
  email: string;
  display_name: string;
}

function mapMembership(row: MembershipRow): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class D1MembershipsRepository {
  constructor(private readonly database: D1Database) {}

  async listActiveForUser(userId: string): Promise<OrganizationMembership[]> {
    const result = await this.database
      .prepare(
        `SELECT membership.id, membership.organization_id, membership.user_id,
                membership.role, membership.status, membership.created_at
         FROM organization_memberships AS membership
         JOIN organizations AS organization ON organization.id = membership.organization_id
         WHERE membership.user_id = ?
           AND membership.status = 'active'
           AND organization.status = 'active'
         ORDER BY membership.created_at ASC, membership.id ASC`,
      )
      .bind(userId)
      .all<MembershipRow>();
    return result.results.map(mapMembership);
  }

  async findForUser(userId: string): Promise<OrganizationMembership | null> {
    const row = await this.database
      .prepare(
        `SELECT id, organization_id, user_id, role, status, created_at
         FROM organization_memberships
         WHERE user_id = ?
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
      )
      .bind(userId)
      .first<MembershipRow>();
    return row ? mapMembership(row) : null;
  }

  async listActiveForOrganization(
    organizationId: string,
  ): Promise<OrganizationMember[]> {
    const result = await this.database
      .prepare(
        `SELECT membership.id, membership.organization_id, membership.user_id,
                membership.role, membership.status, membership.created_at,
                user.email, user.display_name
         FROM organization_memberships AS membership
         JOIN users AS user ON user.id = membership.user_id
         WHERE membership.organization_id = ?
           AND membership.status = 'active'
           AND user.status = 'active'
         ORDER BY user.display_name COLLATE NOCASE ASC, user.id ASC`,
      )
      .bind(organizationId)
      .all<MemberRow>();

    return result.results.map((row) => ({
      ...mapMembership(row),
      email: row.email,
      displayName: row.display_name,
    }));
  }

  async create(input: {
    organizationId: string;
    userId: string;
    role: MembershipRole;
    status?: MembershipStatus;
  }): Promise<OrganizationMembership> {
    const membership: OrganizationMembership = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? "active",
      createdAt: new Date().toISOString(),
    };
    await this.database
      .prepare(
        `INSERT INTO organization_memberships
          (id, organization_id, user_id, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        membership.id,
        membership.organizationId,
        membership.userId,
        membership.role,
        membership.status,
        membership.createdAt,
      )
      .run();
    return membership;
  }

  async createWithActivity(
    input: {
      organizationId: string;
      userId: string;
      role: MembershipRole;
      status?: MembershipStatus;
    },
    activity: Omit<NewActivityEvent, "objectId" | "newState">,
  ): Promise<OrganizationMembership> {
    const membership: OrganizationMembership = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? "active",
      createdAt: new Date().toISOString(),
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO organization_memberships
            (id, organization_id, user_id, role, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          membership.id,
          membership.organizationId,
          membership.userId,
          membership.role,
          membership.status,
          membership.createdAt,
        ),
      this.database
        .prepare(
          `INSERT INTO activity_events
            (id, organization_id, actor_user_id, actor_type, object_type, object_id,
             action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          activity.organizationId,
          activity.actorUserId,
          activity.actorType,
          activity.objectType,
          membership.id,
          activity.action,
          activity.priorState ? JSON.stringify(activity.priorState) : null,
          JSON.stringify({
            userId: membership.userId,
            role: membership.role,
            status: membership.status,
          }),
          JSON.stringify(activity.metadata ?? {}),
          activity.correlationId,
          new Date().toISOString(),
        ),
    ]);
    return membership;
  }
}
