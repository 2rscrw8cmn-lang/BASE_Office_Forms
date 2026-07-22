import type { RfiResponse } from "../../../domain/rfis/rfi";

interface RfiResponseRow {
  id: string;
  organization_id: string;
  record_id: string;
  response: string;
  responded_by: string | null;
  created_at: string;
}

function mapResponse(row: RfiResponseRow): RfiResponse {
  return {
    id: row.id,
    organizationId: row.organization_id,
    rfiId: row.record_id,
    response: row.response,
    respondedBy: row.responded_by,
    createdAt: row.created_at,
  };
}

export interface RfiResponseWriteInput {
  response: string;
  respondedBy: string | null;
}

export class D1RfiResponsesRepository {
  constructor(private readonly database: D1Database) {}

  async list(organizationId: string, rfiId: string): Promise<RfiResponse[]> {
    const result = await this.database
      .prepare(
        `SELECT id, organization_id, record_id, response, responded_by, created_at
         FROM rfi_responses
         WHERE organization_id = ? AND record_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .bind(organizationId, rfiId)
      .all<RfiResponseRow>();
    return result.results.map(mapResponse);
  }

  createResponse(
    organizationId: string,
    _projectId: string,
    rfiId: string,
    input: RfiResponseWriteInput,
  ): RfiResponse {
    return {
      id: crypto.randomUUID(),
      organizationId,
      rfiId,
      ...input,
      createdAt: new Date().toISOString(),
    };
  }

  createForIssuedRfiStatement(
    response: RfiResponse,
    projectId: string,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT INTO rfi_responses
          (id, organization_id, project_id, record_id, response, responded_by, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM records
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_type_key = 'rfi'
             AND workflow_status IN ('open', 'returned_for_clarification')
         )`,
      )
      .bind(
        response.id,
        response.organizationId,
        projectId,
        response.rfiId,
        response.response,
        response.respondedBy,
        response.createdAt,
        response.rfiId,
        response.organizationId,
        projectId,
      );
  }
}
