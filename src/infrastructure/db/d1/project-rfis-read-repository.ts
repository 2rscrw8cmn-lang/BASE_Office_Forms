import type { RfiStatus } from "../../../domain/rfis/rfi";

// One task-shaped row per RFI for the register — everything the table and cards
// need without a per-row request. Long-form fields (question, latest response)
// are included as summaries; the full text lives in the workspace.
export interface RfiListSummary {
  id: string;
  rfiNumber: string | null;
  legacyReference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  responsibleParty: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  issuedAt: string | null;
  responseReceivedAt: string | null;
  latestResponse: string | null;
  attachmentCount: number;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface RfiListRow {
  id: string;
  rfi_number: string | null;
  legacy_reference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  responsible_party: string | null;
  submitted_by: string | null;
  requested_response_date: string | null;
  issued_at: string | null;
  response_received_at: string | null;
  latest_response: string | null;
  attachment_count: number;
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export class D1ProjectRfisReadRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    projectId: string,
  ): Promise<RfiListSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT r.id, r.rfi_number, r.legacy_reference, r.status, r.subject,
           r.question, r.responsible_party, r.submitted_by,
           r.requested_response_date, r.issued_at, r.response_received_at,
           r.lock_version, r.created_at, r.updated_at,
           (SELECT resp.response FROM rfi_responses resp
              WHERE resp.organization_id = r.organization_id AND resp.rfi_id = r.id
              ORDER BY resp.created_at DESC, resp.id DESC LIMIT 1) AS latest_response,
           (SELECT COUNT(*) FROM rfi_attachments a
              WHERE a.organization_id = r.organization_id AND a.rfi_id = r.id)
             AS attachment_count
         FROM rfi_records r
         WHERE r.organization_id = ? AND r.project_id = ?
         ORDER BY CASE WHEN r.rfi_number IS NULL THEN 1 ELSE 0 END,
           r.rfi_number ASC, r.created_at DESC, r.id ASC`,
      )
      .bind(organizationId, projectId)
      .all<RfiListRow>();
    return result.results.map((row) => ({
      id: row.id,
      rfiNumber: row.rfi_number,
      legacyReference: row.legacy_reference,
      status: row.status,
      subject: row.subject,
      question: row.question,
      responsibleParty: row.responsible_party,
      submittedBy: row.submitted_by,
      requestedResponseDate: row.requested_response_date,
      issuedAt: row.issued_at,
      responseReceivedAt: row.response_received_at,
      latestResponse: row.latest_response,
      attachmentCount: row.attachment_count,
      lockVersion: row.lock_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
