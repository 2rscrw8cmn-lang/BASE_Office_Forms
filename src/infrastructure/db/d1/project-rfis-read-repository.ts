import type { RfiStatus } from "../../../domain/rfis/rfi";

export interface RfiListSummary {
  id: string;
  rfiNumber: string | null;
  legacyReference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsiblePartyId: string | null;
  responsibleParty: string | null;
  responsiblePartyLegacyText: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  issuedAt: string | null;
  responseReceivedAt: string | null;
  latestResponse: string | null;
  attachmentCount: number;
  lockVersion: number;
  draftRevisionId: string;
  issuanceReconciliationState: "not_issued" | "legacy_incomplete";
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
  contractor_suggestion: string | null;
  drawing_references: string | null;
  specification_references: string | null;
  responsible_party_id: string | null;
  responsible_party: string | null;
  responsible_party_legacy_text: string | null;
  submitted_by: string | null;
  requested_response_date: string | null;
  issued_at: string | null;
  response_received_at: string | null;
  latest_response: string | null;
  attachment_count: number;
  lock_version: number;
  draft_revision_id: string;
  issuance_reconciliation_state: "not_issued" | "legacy_incomplete";
  created_at: string;
  updated_at: string;
}

export interface RfiResponsibleContactOption {
  id: string;
  name: string;
  companyName: string | null;
}

export class D1ProjectRfisReadRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    projectId: string,
  ): Promise<RfiListSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT record.id, record.record_number AS rfi_number,
           details.legacy_reference, record.workflow_status AS status,
           record.title AS subject, details.question,
           details.contractor_suggestion, details.drawing_references,
           details.specification_references,
           record.current_responsible_contact_id AS responsible_party_id,
           contact.contact_name AS responsible_party,
           record.responsible_party_legacy_text,
           details.submitted_by_legacy_text AS submitted_by,
           record.due_date AS requested_response_date,
           record.issued_at, details.response_received_at,
           record.lock_version, record.current_revision_id AS draft_revision_id,
           details.issuance_reconciliation_state,
           record.created_at, record.updated_at,
           (SELECT resp.response FROM rfi_responses resp
              WHERE resp.organization_id = record.organization_id
                AND resp.record_id = record.id
              ORDER BY resp.created_at DESC, resp.id DESC LIMIT 1) AS latest_response,
           (SELECT COUNT(*) FROM revision_files file
              WHERE file.organization_id = record.organization_id
                AND file.record_id = record.id
                AND file.role IN ('supporting_attachment', 'reference_drawing',
                  'response_attachment', 'generated_artifact')) AS attachment_count
         FROM records record
         JOIN rfi_details details
           ON details.record_id = record.id
          AND details.organization_id = record.organization_id
          AND details.project_id = record.project_id
         LEFT JOIN project_contacts contact
           ON contact.id = record.current_responsible_contact_id
          AND contact.organization_id = record.organization_id
          AND contact.project_id = record.project_id
          AND contact.archived_at IS NULL
         WHERE record.organization_id = ? AND record.project_id = ?
           AND record.record_type_key = 'rfi'
         ORDER BY CASE WHEN record.record_number IS NULL THEN 1 ELSE 0 END,
           record.record_number ASC, record.created_at DESC, record.id ASC`,
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
      contractorSuggestion: row.contractor_suggestion,
      drawingReferences: row.drawing_references,
      specificationReferences: row.specification_references,
      responsiblePartyId: row.responsible_party_id,
      responsibleParty:
        row.responsible_party ?? row.responsible_party_legacy_text,
      responsiblePartyLegacyText: row.responsible_party_legacy_text,
      submittedBy: row.submitted_by,
      requestedResponseDate: row.requested_response_date,
      issuedAt: row.issued_at,
      responseReceivedAt: row.response_received_at,
      latestResponse: row.latest_response,
      attachmentCount: row.attachment_count,
      lockVersion: row.lock_version,
      draftRevisionId: row.draft_revision_id,
      issuanceReconciliationState: row.issuance_reconciliation_state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async listResponsibleContacts(
    organizationId: string,
    projectId: string,
  ): Promise<RfiResponsibleContactOption[]> {
    const result = await this.database
      .prepare(
        `SELECT id, contact_name, company_name FROM project_contacts
         WHERE organization_id = ? AND project_id = ? AND archived_at IS NULL
         ORDER BY contact_name COLLATE NOCASE, id`,
      )
      .bind(organizationId, projectId)
      .all<{ id: string; contact_name: string; company_name: string | null }>();
    return result.results.map((row) => ({
      id: row.id,
      name: row.contact_name,
      companyName: row.company_name,
    }));
  }
}
