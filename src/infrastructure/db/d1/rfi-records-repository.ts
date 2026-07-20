import { RfiIllegalTransitionError } from "../../../domain/rfis/errors";
import type { Rfi, RfiStatus, RfiWriteInput } from "../../../domain/rfis/rfi";
import type { NewActivityEvent } from "./activity-events-repository";
import { D1ActivityEventsRepository } from "./activity-events-repository";
import { D1RfiNumberSequencesRepository } from "./rfi-number-sequences-repository";

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

type ActivityInput = Omit<
  NewActivityEvent,
  "organizationId" | "objectId" | "priorState" | "newState"
>;

export class D1RfiRecordsRepository {
  private readonly activityEvents: D1ActivityEventsRepository;

  constructor(
    private readonly database: D1Database,
    private readonly sequences: D1RfiNumberSequencesRepository,
  ) {
    this.activityEvents = new D1ActivityEventsRepository(database);
  }

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
    await this.database
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
      )
      .run();
    await this.appendActivity(rfi, null, event);
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
    ]);
    if (results[2].meta.changes !== 1) {
      throw new RfiIllegalTransitionError(rfi.status, "be issued");
    }
    const issued = await this.findById(
      rfi.organizationId,
      rfi.projectId,
      rfi.id,
    );
    if (!issued) throw new Error("Issued RFI could not be loaded.");
    await this.appendActivity(issued, rfi, event);
    return issued;
  }

  async transitionWithActivity(
    rfi: Rfi,
    status: Exclude<RfiStatus, "draft" | "issued"> | "answered",
    event: ActivityInput,
  ): Promise<Rfi> {
    const now = new Date().toISOString();
    const answeredAt = status === "answered" ? now : rfi.answeredAt;
    const closedAt = status === "closed" ? now : null;
    const result = await this.database
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
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new RfiIllegalTransitionError(
        rfi.status,
        `transition to ${status}`,
      );
    }
    const updated: Rfi = {
      ...rfi,
      status,
      answeredAt,
      closedAt,
      updatedAt: now,
    };
    await this.appendActivity(updated, rfi, event);
    return updated;
  }

  private async appendActivity(
    rfi: Rfi,
    prior: Rfi | null,
    event: Omit<
      NewActivityEvent,
      "organizationId" | "objectId" | "priorState" | "newState"
    >,
  ): Promise<void> {
    await this.activityEvents.append({
      ...event,
      organizationId: rfi.organizationId,
      objectId: rfi.id,
      priorState: prior ? state(prior) : null,
      newState: state(rfi),
    });
  }
}
