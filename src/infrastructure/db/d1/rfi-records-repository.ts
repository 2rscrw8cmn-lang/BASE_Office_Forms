import { RfiIllegalTransitionError } from "../../../domain/rfis/errors";
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
  rfi_number: string | null;
  status: RfiStatus;
  title: string;
  question: string;
  suggested_resolution: string | null;
  submitted_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  cost_impact: string | null;
  schedule_impact: string | null;
  issued_at: string | null;
  answered_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

const RFI_COLUMNS = `id, organization_id, project_id, rfi_number, status, title, question,
  suggested_resolution, submitted_by, assigned_to, due_date, cost_impact, schedule_impact,
  issued_at, answered_at, closed_at, created_at, updated_at`;

function mapRfi(row: RfiRow): Rfi {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    rfiNumber: row.rfi_number,
    status: row.status,
    title: row.title,
    question: row.question,
    suggestedResolution: row.suggested_resolution,
    submittedBy: row.submitted_by,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    costImpact: row.cost_impact,
    scheduleImpact: row.schedule_impact,
    issuedAt: row.issued_at,
    answeredAt: row.answered_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function state(rfi: Rfi): Record<string, unknown> {
  return {
    projectId: rfi.projectId,
    rfiNumber: rfi.rfiNumber,
    status: rfi.status,
    title: rfi.title,
    question: rfi.question,
    suggestedResolution: rfi.suggestedResolution,
    submittedBy: rfi.submittedBy,
    assignedTo: rfi.assignedTo,
    dueDate: rfi.dueDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
    issuedAt: rfi.issuedAt,
    answeredAt: rfi.answeredAt,
    closedAt: rfi.closedAt,
  };
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
  rfi: Rfi,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
         action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, json_object(
         'projectId', project_id,
         'rfiNumber', rfi_number,
         'status', status,
         'title', title,
         'question', question,
         'suggestedResolution', suggested_resolution,
         'submittedBy', submitted_by,
         'assignedTo', assigned_to,
         'dueDate', due_date,
         'costImpact', cost_impact,
         'scheduleImpact', schedule_impact,
         'issuedAt', issued_at,
         'answeredAt', answered_at,
         'closedAt', closed_at
       ), ?, ?, ?
       FROM rfi_records
       WHERE id = ? AND organization_id = ? AND project_id = ?
         AND status = ? AND updated_at = ? AND changes() = 1`,
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
      rfi.status,
      rfi.updatedAt,
    );
}

type ActivityInput = Omit<
  NewActivityEvent,
  "organizationId" | "objectId" | "priorState" | "newState"
>;

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
    input: RfiWriteInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const rfi: Rfi = {
      id: crypto.randomUUID(),
      organizationId,
      projectId,
      rfiNumber: null,
      status: "draft",
      ...input,
      issuedAt: null,
      answeredAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO rfi_records (${RFI_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.rfiNumber,
          rfi.status,
          rfi.title,
          rfi.question,
          rfi.suggestedResolution,
          rfi.submittedBy,
          rfi.assignedTo,
          rfi.dueDate,
          rfi.costImpact,
          rfi.scheduleImpact,
          rfi.issuedAt,
          rfi.answeredAt,
          rfi.closedAt,
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

  async updateDraftWithActivity(rfi: Rfi, input: RfiWriteInput): Promise<Rfi> {
    const updated: Rfi = {
      ...rfi,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.database
      .prepare(
        `UPDATE rfi_records SET title = ?, question = ?, suggested_resolution = ?,
          submitted_by = ?, assigned_to = ?, due_date = ?, cost_impact = ?,
          schedule_impact = ?, updated_at = ?
         WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'draft'`,
      )
      .bind(
        updated.title,
        updated.question,
        updated.suggestedResolution,
        updated.submittedBy,
        updated.assignedTo,
        updated.dueDate,
        updated.costImpact,
        updated.scheduleImpact,
        updated.updatedAt,
        updated.id,
        updated.organizationId,
        updated.projectId,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new RfiIllegalTransitionError(rfi.status, "be edited");
    }
    return updated;
  }

  async issueWithActivity(rfi: Rfi, event: ActivityInput): Promise<Rfi> {
    const now = new Date().toISOString();
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
           SET status = 'issued',
             rfi_number = 'RFI-' || printf('%03d', (
               SELECT last_number FROM rfi_number_sequences
               WHERE project_id = ? AND organization_id = ?
             )),
             issued_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'draft'`,
        )
        .bind(
          rfi.projectId,
          rfi.organizationId,
          now,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: rfi.organizationId,
          objectId: rfi.id,
          priorState: state(rfi),
          newState: null,
        },
        { ...rfi, status: "issued", issuedAt: now, updatedAt: now },
      ),
    ]);
    if (results[2].meta.changes !== 1 || results[3].meta.changes !== 1) {
      throw new RfiIllegalTransitionError(rfi.status, "be issued");
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
    const answered: Rfi = {
      ...rfi,
      status: "answered",
      answeredAt: now,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.responses.createForIssuedRfiStatement(response),
      this.database
        .prepare(
          `UPDATE rfi_records
           SET status = 'answered', answered_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'issued'
             AND EXISTS (SELECT 1 FROM rfi_responses WHERE id = ?)`,
        )
        .bind(
          answered.answeredAt,
          answered.updatedAt,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          response.id,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: answered.organizationId,
          objectId: answered.id,
          priorState: state(rfi),
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
      throw new RfiIllegalTransitionError(rfi.status, "be responded to");
    }
    return { rfi: answered, response };
  }

  async transitionWithActivity(
    rfi: Rfi,
    status: Exclude<RfiStatus, "draft" | "issued"> | "answered",
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const answeredAt = status === "answered" ? now : rfi.answeredAt;
    const closedAt = status === "closed" ? now : null;
    const updated: Rfi = {
      ...rfi,
      status,
      answeredAt,
      closedAt,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE rfi_records
           SET status = ?, answered_at = ?, closed_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = ?`,
        )
        .bind(
          status,
          answeredAt,
          closedAt,
          now,
          rfi.id,
          rfi.organizationId,
          rfi.projectId,
          rfi.status,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: updated.organizationId,
          objectId: updated.id,
          priorState: state(rfi),
          newState: null,
        },
        updated,
      ),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new RfiIllegalTransitionError(
        rfi.status,
        `transition to ${status}`,
      );
    }
    return updated;
  }
}
