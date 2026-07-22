import {
  RfiConflictError,
  RfiIllegalTransitionError,
} from "../../../domain/rfis/errors";
import { canUpdateDraft } from "../../../domain/rfis/lifecycle";
import type {
  Rfi,
  RfiResponse,
  RfiStatus,
  RfiWriteInput,
} from "../../../domain/rfis/rfi";
import type { NewActivityEvent } from "./activity-events-repository";
import {
  D1RfiResponsesRepository,
  type RfiResponseWriteInput,
} from "./rfi-responses-repository";

interface RfiRow {
  id: string;
  organization_id: string;
  project_id: string;
  template_version_id: string | null;
  rfi_number: string | null;
  issued_number_sequence: number | null;
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
  cost_impact: string | null;
  schedule_impact: string | null;
  issued_at: string | null;
  response_received_at: string | null;
  closed_at: string | null;
  lock_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  draft_revision_id: string;
  issuance_reconciliation_state: "not_issued" | "legacy_incomplete";
}

const RFI_COLUMNS = `
  record.id AS id,
  record.organization_id AS organization_id,
  record.project_id AS project_id,
  record.template_version_id AS template_version_id,
  record.record_number AS rfi_number,
  record.sequence_no AS issued_number_sequence,
  details.legacy_reference AS legacy_reference,
  record.workflow_status AS status,
  record.title AS subject,
  details.question AS question,
  details.contractor_suggestion AS contractor_suggestion,
  details.drawing_references AS drawing_references,
  details.specification_references AS specification_references,
  record.current_responsible_contact_id AS responsible_party_id,
  contact.contact_name AS responsible_party,
  record.responsible_party_legacy_text AS responsible_party_legacy_text,
  details.submitted_by_legacy_text AS submitted_by,
  record.due_date AS requested_response_date,
  details.cost_impact_legacy_text AS cost_impact,
  details.schedule_impact_legacy_text AS schedule_impact,
  record.issued_at AS issued_at,
  details.response_received_at AS response_received_at,
  record.closed_at AS closed_at,
  record.lock_version AS lock_version,
  record.created_by AS created_by,
  record.created_at AS created_at,
  record.updated_at AS updated_at,
  record.current_revision_id AS draft_revision_id,
  details.issuance_reconciliation_state AS issuance_reconciliation_state`;

const RFI_FROM = `records record
  JOIN rfi_details details
    ON details.record_id = record.id
   AND details.organization_id = record.organization_id
   AND details.project_id = record.project_id
  LEFT JOIN project_contacts contact
    ON contact.id = record.current_responsible_contact_id
   AND contact.organization_id = record.organization_id
   AND contact.project_id = record.project_id
   AND contact.archived_at IS NULL`;

const STATE_JSON_OBJECT = `json_object(
  'projectId', record.project_id,
  'templateVersionId', record.template_version_id,
  'rfiNumber', record.record_number,
  'status', record.workflow_status,
  'subject', record.title,
  'question', details.question,
  'contractorSuggestion', details.contractor_suggestion,
  'drawingReferences', details.drawing_references,
  'specificationReferences', details.specification_references,
  'responsiblePartyId', record.current_responsible_contact_id,
  'responsibleParty', COALESCE(contact.contact_name, record.responsible_party_legacy_text),
  'requestedResponseDate', record.due_date,
  'issuedAt', record.issued_at,
  'responseReceivedAt', details.response_received_at,
  'closedAt', record.closed_at,
  'lockVersion', record.lock_version
)`;

function mapRfi(row: RfiRow): Rfi {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
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
    costImpact: row.cost_impact,
    scheduleImpact: row.schedule_impact,
    issuedNumberSequence: row.issued_number_sequence,
    draftRevisionId: row.draft_revision_id,
    issuanceReconciliationState: row.issuance_reconciliation_state,
    issuedAt: row.issued_at,
    responseReceivedAt: row.response_received_at,
    closedAt: row.closed_at,
    lockVersion: row.lock_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function priorState(rfi: Rfi): Record<string, unknown> {
  return {
    projectId: rfi.projectId,
    templateVersionId: rfi.templateVersionId,
    rfiNumber: rfi.rfiNumber,
    status: rfi.status,
    subject: rfi.subject,
    question: rfi.question,
    contractorSuggestion: rfi.contractorSuggestion,
    drawingReferences: rfi.drawingReferences,
    specificationReferences: rfi.specificationReferences,
    responsiblePartyId: rfi.responsiblePartyId,
    requestedResponseDate: rfi.requestedResponseDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
    issuedAt: rfi.issuedAt,
    responseReceivedAt: rfi.responseReceivedAt,
    closedAt: rfi.closedAt,
    lockVersion: rfi.lockVersion,
  };
}

type ActivityInput = Omit<
  NewActivityEvent,
  "organizationId" | "objectId" | "priorState" | "newState"
>;

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
  rfi: Pick<Rfi, "id" | "organizationId" | "projectId">,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
         action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${STATE_JSON_OBJECT}, ?, ?, ?
       FROM ${RFI_FROM}
       WHERE record.id = ? AND record.organization_id = ? AND record.project_id = ?
         AND changes() = 1`,
    )
    .bind(
      crypto.randomUUID(),
      event.organizationId,
      event.actorUserId,
      event.actorType,
      event.objectType,
      event.objectId,
      event.action,
      event.priorState ? JSON.stringify(event.priorState) : null,
      JSON.stringify(event.metadata ?? {}),
      event.correlationId,
      new Date().toISOString(),
      rfi.id,
      rfi.organizationId,
      rfi.projectId,
    );
}

export interface RfiCreateInput extends RfiWriteInput {
  templateVersionId: string;
  createdBy: string;
}

export class D1RfiRecordsRepository {
  constructor(
    private readonly database: D1Database,
    private readonly responses: D1RfiResponsesRepository,
  ) {}

  async list(organizationId: string, projectId: string): Promise<Rfi[]> {
    const result = await this.database
      .prepare(
        `SELECT ${RFI_COLUMNS} FROM ${RFI_FROM}
         WHERE record.organization_id = ? AND record.project_id = ?
           AND record.record_type_key = 'rfi'
         ORDER BY CASE WHEN record.record_number IS NULL THEN 1 ELSE 0 END,
           record.record_number ASC, record.created_at DESC, record.id ASC`,
      )
      .bind(organizationId, projectId)
      .all<RfiRow>();
    return result.results.map(mapRfi);
  }

  async findById(
    organizationId: string,
    projectId: string,
    rfiId: string,
  ): Promise<Rfi | null> {
    const row = await this.database
      .prepare(
        `SELECT ${RFI_COLUMNS} FROM ${RFI_FROM}
         WHERE record.organization_id = ? AND record.project_id = ?
           AND record.id = ? AND record.record_type_key = 'rfi'`,
      )
      .bind(organizationId, projectId, rfiId)
      .first<RfiRow>();
    return row ? mapRfi(row) : null;
  }

  async createWithActivity(
    organizationId: string,
    projectId: string,
    input: RfiCreateInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<Rfi> {
    const id = crypto.randomUUID();
    const revisionId = `${id}:rfi-draft-v1`;
    const now = new Date().toISOString();
    const shell: Pick<Rfi, "id" | "organizationId" | "projectId"> = {
      id,
      organizationId,
      projectId,
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO records (
             id, organization_id, project_id, record_type, record_type_key,
             record_number, title, description, status, workflow_status,
             discipline, source, created_by, current_revision_id, archived_at,
             template_version_id, sequence_no, current_responsible_contact_id,
             responsible_party_legacy_text, due_date, issued_at, returned_at,
             closed_at, lock_version, created_at, updated_at
           ) VALUES (
             ?, ?, ?, 'other', 'rfi', NULL, ?, NULL, 'active', 'draft',
             NULL, 'rfi', ?, NULL, NULL, ?, NULL, ?, NULL, ?, NULL, NULL,
             NULL, 1, ?, ?
           )`,
        )
        .bind(
          id,
          organizationId,
          projectId,
          input.subject,
          input.createdBy,
          input.templateVersionId,
          input.responsiblePartyId,
          input.requestedResponseDate,
          now,
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO rfi_details (
             record_id, organization_id, project_id, question,
             contractor_suggestion, drawing_references,
             specification_references, submitted_by_legacy_text,
             response, response_by_user_id, response_by_contact_id,
             response_received_at, cost_impact_legacy_text,
             schedule_impact_legacy_text, closure_notes, legacy_reference,
             legacy_workflow_status, issuance_reconciliation_state
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?,
             NULL, NULL, NULL, 'not_issued')`,
        )
        .bind(
          id,
          organizationId,
          projectId,
          input.question,
          input.contractorSuggestion,
          input.drawingReferences,
          input.specificationReferences,
          input.submittedBy,
          input.costImpact,
          input.scheduleImpact,
        ),
      this.database
        .prepare(
          `INSERT INTO record_revisions (
             id, organization_id, project_id, record_id, revision_number,
             revision_label, title, description, discipline, source,
             change_summary, status, created_by, created_at
           ) VALUES (?, ?, ?, ?, 1, 'Draft', ?, ?, NULL, 'rfi',
             'Initial RFI draft', 'draft', ?, ?)`,
        )
        .bind(
          revisionId,
          organizationId,
          projectId,
          id,
          input.subject,
          input.question,
          input.createdBy,
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO record_revision_sequences (record_id, organization_id, last_number)
           VALUES (?, ?, 1)`,
        )
        .bind(id, organizationId),
      this.database
        .prepare(
          `UPDATE records SET current_revision_id = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_type_key = 'rfi'`,
        )
        .bind(revisionId, id, organizationId, projectId),
      eventStatement(
        this.database,
        { ...event, organizationId, objectId: id, newState: null },
        shell,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new Error("The RFI draft could not be created atomically.");
    }
    const created = await this.findById(organizationId, projectId, id);
    if (!created) throw new Error("Created RFI could not be loaded.");
    return created;
  }

  async updateDraftWithActivity(
    rfi: Rfi,
    input: RfiWriteInput,
    expectedLockVersion: number,
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const nextLock = expectedLockVersion + 1;
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE rfi_details SET question = ?, contractor_suggestion = ?,
             drawing_references = ?, specification_references = ?,
             submitted_by_legacy_text = ?, cost_impact_legacy_text = ?,
             schedule_impact_legacy_text = ?
           WHERE record_id = ? AND organization_id = ? AND project_id = ?
             AND EXISTS (
               SELECT 1 FROM records record
               JOIN record_revisions revision
                 ON revision.id = record.current_revision_id
                AND revision.record_id = record.id
               WHERE record.id = rfi_details.record_id
                 AND record.organization_id = rfi_details.organization_id
                 AND record.project_id = rfi_details.project_id
                 AND record.record_type_key = 'rfi'
                 AND record.workflow_status = 'draft'
                 AND record.lock_version = ?
                 AND revision.status = 'draft'
             )`,
        )
        .bind(
          input.question,
          input.contractorSuggestion,
          input.drawingReferences,
          input.specificationReferences,
          input.submittedBy,
          input.costImpact,
          input.scheduleImpact,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          expectedLockVersion,
        ),
      this.database
        .prepare(
          `UPDATE records SET title = ?, current_responsible_contact_id = ?,
             responsible_party_legacy_text = NULL, due_date = ?,
             lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_type_key = 'rfi' AND workflow_status = 'draft'
             AND lock_version = ?
             AND EXISTS (SELECT 1 FROM rfi_details WHERE record_id = records.id)
             AND EXISTS (
               SELECT 1 FROM record_revisions revision
               WHERE revision.id = records.current_revision_id
                 AND revision.record_id = records.id AND revision.status = 'draft'
             )`,
        )
        .bind(
          input.subject,
          input.responsiblePartyId,
          input.requestedResponseDate,
          nextLock,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          expectedLockVersion,
        ),
      this.database
        .prepare(
          `UPDATE record_revisions SET title = ?, description = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_id = ? AND status = 'draft'
             AND EXISTS (
               SELECT 1 FROM records record
               WHERE record.id = record_revisions.record_id
                 AND record.lock_version = ? AND record.workflow_status = 'draft'
             )`,
        )
        .bind(
          input.subject,
          input.question,
          rfi.draftRevisionId,
          rfi.organizationId,
          rfi.projectId,
          rfi.id,
          nextLock,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: rfi.organizationId,
          objectId: rfi.id,
          priorState: priorState(rfi),
          newState: null,
        },
        rfi,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      await this.throwWriteFailure(rfi, "be edited", expectedLockVersion);
    }
    const updated = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (!updated) throw new Error("Updated RFI could not be loaded.");
    return updated;
  }

  async respondWithActivity(
    rfi: Rfi,
    input: RfiResponseWriteInput,
    event: ActivityInput,
  ): Promise<{ rfi: Rfi; response: RfiResponse }> {
    const response = this.responses.createResponse(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
      input,
    );
    const now = new Date().toISOString();
    const nextLock = rfi.lockVersion + 1;
    const results = await this.database.batch([
      this.responses.createForIssuedRfiStatement(response, rfi.projectId),
      this.database
        .prepare(
          `UPDATE rfi_details SET response = ?, response_by_user_id = ?,
             response_received_at = ?
           WHERE record_id = ? AND organization_id = ? AND project_id = ?
             AND EXISTS (
               SELECT 1 FROM records WHERE id = rfi_details.record_id
                 AND workflow_status IN ('open', 'returned_for_clarification')
                 AND lock_version = ?
             )`,
        )
        .bind(
          response.response,
          response.respondedBy,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.lockVersion,
        ),
      this.database
        .prepare(
          `UPDATE records SET workflow_status = 'response_received',
             returned_at = ?, lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND workflow_status IN ('open', 'returned_for_clarification')
             AND lock_version = ?`,
        )
        .bind(
          now,
          nextLock,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.lockVersion,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: rfi.organizationId,
          objectId: rfi.id,
          priorState: priorState(rfi),
          newState: null,
          metadata: { ...event.metadata, responseId: response.id },
        },
        rfi,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      await this.throwWriteFailure(rfi, "be responded to");
    }
    const updated = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (!updated) throw new Error("Responded RFI could not be loaded.");
    return { rfi: updated, response };
  }

  async transitionWithActivity(
    rfi: Rfi,
    toStatus: RfiStatus,
    action: string,
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const nextLock = rfi.lockVersion + 1;
    const closedAt =
      toStatus === "closed" ? now : toStatus === "open" ? null : rfi.closedAt;
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE records SET workflow_status = ?, closed_at = ?,
             lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_type_key = 'rfi' AND workflow_status = ?
             AND lock_version = ?`,
        )
        .bind(
          toStatus,
          closedAt,
          nextLock,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.status,
          rfi.lockVersion,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          action,
          organizationId: rfi.organizationId,
          objectId: rfi.id,
          priorState: priorState(rfi),
          newState: null,
        },
        rfi,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      await this.throwWriteFailure(rfi, `transition to ${toStatus}`);
    }
    const updated = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (!updated) throw new Error("Transitioned RFI could not be loaded.");
    return updated;
  }

  private async throwWriteFailure(
    rfi: Rfi,
    action: string,
    expectedLockVersion: number = rfi.lockVersion,
  ): Promise<never> {
    const current = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (current && current.lockVersion !== expectedLockVersion) {
      throw new RfiConflictError();
    }
    if (
      current &&
      action === "be edited" &&
      canUpdateDraft(current.status) &&
      current.lockVersion === expectedLockVersion
    ) {
      throw new RfiConflictError();
    }
    throw new RfiIllegalTransitionError(rfi.status, action);
  }
}
