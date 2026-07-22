export class D1ProjectRecordSequencesRepository {
  constructor(private readonly database: D1Database) {}

  ensureStatement(
    organizationId: string,
    projectId: string,
    updatedAt: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT OR IGNORE INTO project_record_sequences
          (organization_id, project_id, last_number, updated_at)
         SELECT ?, ?, COALESCE((
           SELECT MAX(CAST(record_number AS INTEGER))
           FROM records
           WHERE organization_id = ? AND project_id = ?
             AND record_number <> ''
             AND record_number NOT GLOB '*[^0-9]*'
         ), 0), ?
         WHERE EXISTS (
           SELECT 1 FROM projects
           WHERE id = ? AND organization_id = ?
         )`,
      )
      .bind(
        organizationId,
        projectId,
        organizationId,
        projectId,
        updatedAt,
        projectId,
        organizationId,
      );
  }

  advanceStatement(
    organizationId: string,
    projectId: string,
    updatedAt: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `UPDATE project_record_sequences
         SET last_number = last_number + 1, updated_at = ?
         WHERE organization_id = ? AND project_id = ?`,
      )
      .bind(updatedAt, organizationId, projectId);
  }
}
