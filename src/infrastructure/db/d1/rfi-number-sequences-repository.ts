export class D1RfiNumberSequencesRepository {
  constructor(private readonly database: D1Database) {}

  ensureForIssueStatement(
    organizationId: string,
    projectId: string,
    rfiId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT OR IGNORE INTO rfi_number_sequences
          (project_id, organization_id, last_number)
         SELECT ?, ?, 0
         WHERE EXISTS (
           SELECT 1 FROM rfi_records
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND status IN ('draft', 'ready_to_issue')
         )`,
      )
      .bind(projectId, organizationId, rfiId, organizationId, projectId);
  }

  advanceForIssueStatement(
    organizationId: string,
    projectId: string,
    rfiId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `UPDATE rfi_number_sequences
         SET last_number = last_number + 1
         WHERE project_id = ? AND organization_id = ?
           AND EXISTS (
             SELECT 1 FROM rfi_records
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND status IN ('draft', 'ready_to_issue')
           )`,
      )
      .bind(projectId, organizationId, rfiId, organizationId, projectId);
  }
}
