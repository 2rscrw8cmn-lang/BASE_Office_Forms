import type { RfiResponse } from "../../../domain/rfis/rfi";

interface RfiResponseRow {
  id: string;
  organization_id: string;
  rfi_id: string;
  response: string;
  responded_by: string | null;
  created_at: string;
}

function mapResponse(row: RfiResponseRow): RfiResponse {
  return {
    id: row.id,
    organizationId: row.organization_id,
    rfiId: row.rfi_id,
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
        `SELECT id, organization_id, rfi_id, response, responded_by, created_at
         FROM rfi_responses
         WHERE organization_id = ? AND rfi_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .bind(organizationId, rfiId)
      .all<RfiResponseRow>();
    return result.results.map(mapResponse);
  }

  createResponse(
    organizationId: string,
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

  createForIssuedRfiStatement(response: RfiResponse): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT INTO rfi_responses
          (id, organization_id, rfi_id, response, responded_by, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM rfi_records
           WHERE id = ? AND organization_id = ?
             AND status IN ('open', 'returned_for_clarification')
         )`,
      )
      .bind(
        response.id,
        response.organizationId,
        response.rfiId,
        response.response,
        response.respondedBy,
        response.createdAt,
        response.rfiId,
        response.organizationId,
      );
  }
}
