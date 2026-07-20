export class D1RecordRevisionSequencesRepository {
  constructor(private readonly database: D1Database) {}

  ensureStatement(
    organizationId: string,
    recordId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT OR IGNORE INTO record_revision_sequences
          (record_id, organization_id, last_number)
         SELECT ?, ?, 0
         WHERE EXISTS (
           SELECT 1 FROM records
           WHERE id = ? AND organization_id = ? AND status = 'active'
         )`,
      )
      .bind(recordId, organizationId, recordId, organizationId);
  }

  advanceStatement(
    organizationId: string,
    recordId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `UPDATE record_revision_sequences
         SET last_number = last_number + 1
         WHERE record_id = ? AND organization_id = ?
           AND EXISTS (
             SELECT 1 FROM records
             WHERE id = ? AND organization_id = ? AND status = 'active'
           )`,
      )
      .bind(recordId, organizationId, recordId, organizationId);
  }
}
