export interface RfiActivitySummary {
  action: string;
  actorType: "user" | "system";
  actorDisplayName: string | null;
  createdAt: string;
  // Structured, safe projection of the event — never the raw activity JSON.
  changedFields: string[];
  role: string | null;
}

interface ActivityRow {
  action: string;
  actor_type: "user" | "system";
  actor_display_name: string | null;
  created_at: string;
  metadata_json: string | null;
}

/**
 * Read-only projections for the RFI workspace that aren't already covered by the
 * RFI/attachment/response repositories: the activity timeline (with resolved
 * actor names) and the organization display identity. Raw activity JSON is never
 * surfaced — only a safe, structured summary.
 */
export class D1RfiWorkspaceReadRepository {
  constructor(private readonly database: D1Database) {}

  async listActivity(
    organizationId: string,
    rfiId: string,
    limit = 50,
  ): Promise<RfiActivitySummary[]> {
    const result = await this.database
      .prepare(
        `SELECT e.action, e.actor_type, u.display_name AS actor_display_name,
           e.created_at, e.metadata_json
         FROM activity_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.organization_id = ? AND e.object_type = 'rfi' AND e.object_id = ?
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(organizationId, rfiId, limit)
      .all<ActivityRow>();
    return result.results.map((row) => {
      let changedFields: string[] = [];
      let role: string | null = null;
      if (row.metadata_json) {
        try {
          const meta = JSON.parse(row.metadata_json) as Record<string, unknown>;
          if (Array.isArray(meta.changedFields)) {
            changedFields = meta.changedFields.filter(
              (value): value is string => typeof value === "string",
            );
          }
          if (typeof meta.role === "string") role = meta.role;
        } catch {
          // A malformed metadata blob must never break the timeline.
        }
      }
      return {
        action: row.action,
        actorType: row.actor_type,
        actorDisplayName: row.actor_display_name,
        createdAt: row.created_at,
        changedFields,
        role,
      };
    });
  }

  async findOrganizationName(organizationId: string): Promise<string | null> {
    const row = await this.database
      .prepare(`SELECT name FROM organizations WHERE id = ?`)
      .bind(organizationId)
      .first<{ name: string }>();
    return row?.name ?? null;
  }
}
