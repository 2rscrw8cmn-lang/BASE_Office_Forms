export class D1ProjectIssuanceSequencesRepository {
  constructor(private readonly database: D1Database) {}

  ensureStatement(
    organizationId: string,
    projectId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT OR IGNORE INTO project_issuance_sequences
          (project_id, organization_id, next_sequence)
         SELECT ?, ?, 1
         WHERE EXISTS (
           SELECT 1 FROM projects WHERE id = ? AND organization_id = ?
         )`,
      )
      .bind(projectId, organizationId, projectId, organizationId);
  }

  advanceStatement(
    organizationId: string,
    projectId: string,
    issuanceId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `UPDATE project_issuance_sequences
         SET next_sequence = next_sequence + 1
         WHERE project_id = ? AND organization_id = ?
           AND EXISTS (
             SELECT 1 FROM issuances
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND issue_sequence = project_issuance_sequences.next_sequence
           )`,
      )
      .bind(projectId, organizationId, issuanceId, organizationId, projectId);
  }
}
