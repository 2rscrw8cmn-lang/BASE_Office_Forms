export class D1ProjectMembershipsRepository {
  constructor(private readonly database: D1Database) {}

  async listActiveProjectIds(
    organizationId: string,
    userId: string,
  ): Promise<string[]> {
    const result = await this.database
      .prepare(
        `SELECT project_id FROM project_memberships
         WHERE organization_id = ? AND user_id = ? AND status = 'active'
         ORDER BY project_id`,
      )
      .bind(organizationId, userId)
      .all<{ project_id: string }>();
    return result.results.map((row) => row.project_id);
  }

  async isActiveMember(
    organizationId: string,
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.database
        .prepare(
          `SELECT 1 FROM project_memberships
           WHERE organization_id = ? AND project_id = ? AND user_id = ? AND status = 'active'`,
        )
        .bind(organizationId, projectId, userId)
        .first(),
    );
  }
}
