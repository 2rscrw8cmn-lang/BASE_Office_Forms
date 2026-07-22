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
import { D1RfiNumberSequencesRepository } from "./rfi-number-sequences-repository";
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
  legacy_reference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  contractor_suggestion: string | null;
  drawing_references: string | null;
  specification_references: string | null;
  responsible_party: string | null;
  submitted_by: string | null;
  requested_response_date: string | null;
  cost_impact: string | null;
  schedule_impact: string | null;
  issued_number_sequence: number | null;
  project_snapshot_json: string | null;
  issued_at: string | null;
  response_received_at: string | null;
  closed_at: string | null;
  lock_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const RFI_COLUMNS = `id, organization_id, project_id, template_version_id, rfi_number,
  legacy_reference, status, subject, question, contractor_suggestion,
  drawing_references, specification_references, responsible_party, submitted_by,
  requested_response_date, cost_impact, schedule_impact, issued_number_sequence,
  project_snapshot_json, issued_at, response_received_at, closed_at, lock_version,
  created_by, created_at, updated_at`;

// Column projection for activity `new_state` snapshots. Kept in sync with the
// row shape so every event captures the authoritative post-write state.
const STATE_JSON_OBJECT = `json_object(
  'projectId', project_id,
  'templateVersionId', template_version_id,
  'rfiNumber', rfi_number,
  'status', status,
  'subject', subject,
  'question', question,
  'contractorSuggestion', contractor_suggestion,
  'drawingReferences', drawing_references,
  'specificationReferences', specification_references,
  'responsibleParty', responsible_party,
  'submittedBy', submitted_by,
  'requestedResponseDate', requested_response_date,
  'costImpact', cost_impact,
  'scheduleImpact', schedule_impact,
  'issuedAt', issued_at,
  'responseReceivedAt', response_received_at,
  'closedAt', closed_at,
  'lockVersion', lock_version
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
    responsibleParty: row.responsible_party,
    submittedBy: row.submitted_by,
    requestedResponseDate: row.requested_response_date,
    costImpact: row.cost_impact,
    scheduleImpact: row.schedule_impact,
    issuedNumberSequence: row.issued_number_sequence,
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
    responsibleParty: rfi.responsibleParty,
    submittedBy: rfi.submittedBy,
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

// Emits the activity event only when the immediately-preceding batch statement
// changed exactly one row (`changes() = 1`), so an event is never recorded for a
// write that was rejected by its own guard.
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
       FROM rfi_records
       WHERE id = ? AND organization_id = ? AND project_id = ? AND changes() = 1`,
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
  templateVersionId: string | null;
  createdBy: string;
}

export class D1RfiRecordsRepository {
  constructor(
    private readonly database: D1Database,
    private readonly sequences: D1RfiNumberSequencesRepository,
    private readonly responses: D1RfiResponsesRepository,
  ) {}

  async list(organizationId: string, projectId: string): Promise<Rfi[]> {
    const result = await this.database
      .prepare(
        `SELECT ${RFI_COLUMNS} FROM rfi_records
         WHERE organization_id = ? AND project_id = ?
         ORDER BY CASE WHEN rfi_number IS NULL THEN 1 ELSE 0 END,
           rfi_number ASC, created_at DESC, id ASC`,
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
        `SELECT ${RFI_COLUMNS} FROM rfi_records
         WHERE organization_id = ? AND project_id = ? AND id = ?`,
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
    const now = new Date().toISOString();
    const rfi: Rfi = {
      id: crypto.randomUUID(),
      organizationId,
      projectId,
      templateVersionId: input.templateVersionId,
      rfiNumber: null,
      legacyReference: null,
      status: "draft",
      subject: input.subject,
      question: input.question,
      contractorSuggestion: input.contractorSuggestion,
      drawingReferences: input.drawingReferences,
      specificationReferences: input.specificationReferences,
      responsibleParty: input.responsibleParty,
      submittedBy: input.submittedBy,
      requestedResponseDate: input.requestedResponseDate,
      costImpact: input.costImpact,
      scheduleImpact: input.scheduleImpact,
      issuedNumberSequence: null,
      issuedAt: null,
      responseReceivedAt: null,
      closedAt: null,
      lockVersion: 1,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO rfi_records (${RFI_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.templateVersionId,
          rfi.rfiNumber,
          rfi.legacyReference,
          rfi.status,
          rfi.subject,
          rfi.question,
          rfi.contractorSuggestion,
          rfi.drawingReferences,
          rfi.specificationReferences,
          rfi.responsibleParty,
          rfi.submittedBy,
          rfi.requestedResponseDate,
          rfi.costImpact,
          rfi.scheduleImpact,
          rfi.issuedNumberSequence,
          null,
          rfi.issuedAt,
          rfi.responseReceivedAt,
          rfi.closedAt,
          rfi.lockVersion,
          rfi.createdBy,
          rfi.createdAt,
          rfi.updatedAt,
        ),
      eventStatement(
        this.database,
        { ...event, organizationId, objectId: rfi.id, newState: null },
        rfi,
      ),
    ]);
    return rfi;
  }

  /**
   * Applies an inline/full draft edit under optimistic concurrency. The write is
   * guarded by both the editable-draft status and the caller's lockVersion, so a
   * stale writer is rejected. A rejected write is disambiguated by re-reading:
   * a lockVersion mismatch is a conflict, anything else is an illegal transition.
   */
  async updateDraftWithActivity(
    rfi: Rfi,
    input: RfiWriteInput,
    expectedLockVersion: number,
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const nextLock = expectedLockVersion + 1;
    const updated: Rfi = {
      ...rfi,
      ...input,
      lockVersion: nextLock,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE rfi_records SET subject = ?, question = ?, contractor_suggestion = ?,
            drawing_references = ?, specification_references = ?, responsible_party = ?,
            submitted_by = ?, requested_response_date = ?, cost_impact = ?,
            schedule_impact = ?, lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND status = 'draft' AND lock_version = ?`,
        )
        .bind(
          updated.subject,
          updated.question,
          updated.contractorSuggestion,
          updated.drawingReferences,
          updated.specificationReferences,
          updated.responsibleParty,
          updated.submittedBy,
          updated.requestedResponseDate,
          updated.costImpact,
          updated.scheduleImpact,
          nextLock,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          expectedLockVersion,
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
    if (results[0].meta.changes !== 1) {
      await this.throwWriteFailure(rfi, "be edited", expectedLockVersion);
    }
    return updated;
  }

  async issueWithActivity(rfi: Rfi, event: ActivityInput): Promise<Rfi> {
    const now = new Date().toISOString();
    const nextLock = rfi.lockVersion + 1;
    const results = await this.database.batch([
      this.sequences.ensureForIssueStatement(
        rfi.organizationId,
        rfi.projectId,
        rfi.id,
      ),
      this.sequences.advanceForIssueStatement(
        rfi.organizationId,
        rfi.projectId,
        rfi.id,
      ),
      this.database
        .prepare(
          `UPDATE rfi_records
           SET status = 'open',
             issued_number_sequence = (
               SELECT last_number FROM rfi_number_sequences
               WHERE project_id = ? AND organization_id = ?
             ),
             rfi_number = 'RFI-' || printf('%03d', (
               SELECT last_number FROM rfi_number_sequences
               WHERE project_id = ? AND organization_id = ?
             )),
             issued_at = ?, lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND status IN ('draft', 'ready_to_issue') AND lock_version = ?`,
        )
        .bind(
          rfi.projectId,
          rfi.organizationId,
          rfi.projectId,
          rfi.organizationId,
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
        },
        rfi,
      ),
    ]);
    if (results[2].meta.changes !== 1 || results[3].meta.changes !== 1) {
      await this.throwWriteFailure(rfi, "be issued");
    }
    const issued = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (!issued) throw new Error("Issued RFI could not be loaded.");
    return issued;
  }

  async respondWithActivity(
    rfi: Rfi,
    input: RfiResponseWriteInput,
    event: ActivityInput,
  ): Promise<{ rfi: Rfi; response: RfiResponse }> {
    const response = this.responses.createResponse(
      rfi.organizationId,
      rfi.id,
      input,
    );
    const now = new Date().toISOString();
    const nextLock = rfi.lockVersion + 1;
    const answered: Rfi = {
      ...rfi,
      status: "response_received",
      responseReceivedAt: now,
      lockVersion: nextLock,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.responses.createForIssuedRfiStatement(response),
      this.database
        .prepare(
          `UPDATE rfi_records
           SET status = 'response_received', response_received_at = ?,
             lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND status IN ('open', 'returned_for_clarification')
             AND lock_version = ?
             AND EXISTS (SELECT 1 FROM rfi_responses WHERE id = ?)`,
        )
        .bind(
          answered.responseReceivedAt,
          nextLock,
          answered.updatedAt,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.lockVersion,
          response.id,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: answered.organizationId,
          objectId: answered.id,
          priorState: priorState(rfi),
          newState: null,
          metadata: { ...event.metadata, responseId: response.id },
        },
        answered,
      ),
    ]);
    if (
      results[0].meta.changes !== 1 ||
      results[1].meta.changes !== 1 ||
      results[2].meta.changes !== 1
    ) {
      await this.throwWriteFailure(rfi, "be responded to");
    }
    return { rfi: answered, response };
  }

  /**
   * Applies a simple lifecycle transition (mark-ready, return-for-clarification,
   * close, reopen, void) under a status + lockVersion guard, bumping lockVersion
   * so a concurrent stale edit is rejected afterwards.
   */
  async transitionWithActivity(
    rfi: Rfi,
    toStatus: RfiStatus,
    action: string,
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const nextLock = rfi.lockVersion + 1;
    const responseReceivedAt =
      toStatus === "response_received" ? now : rfi.responseReceivedAt;
    const closedAt =
      toStatus === "closed" ? now : toStatus === "open" ? null : rfi.closedAt;
    const updated: Rfi = {
      ...rfi,
      status: toStatus,
      responseReceivedAt,
      closedAt,
      lockVersion: nextLock,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE rfi_records
           SET status = ?, response_received_at = ?, closed_at = ?,
             lock_version = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND status = ? AND lock_version = ?`,
        )
        .bind(
          toStatus,
          responseReceivedAt,
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
          organizationId: updated.organizationId,
          objectId: updated.id,
          priorState: priorState(rfi),
          newState: null,
        },
        updated,
      ),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      await this.throwWriteFailure(rfi, `transition to ${toStatus}`);
    }
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
      // Same lock, still editable, yet no row changed: a genuine conflict raced
      // in and out. Treat as a conflict so the caller reloads.
      throw new RfiConflictError();
    }
    throw new RfiIllegalTransitionError(rfi.status, action);
  }
}
