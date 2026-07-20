import type { Record } from "../../../domain/records/record";
import { RecordArchivedError } from "../../../domain/records/errors";
import { RevisionIllegalTransitionError } from "../../../domain/revisions/errors";
import type {
  Revision,
  RevisionStatus,
  RevisionWriteInput,
} from "../../../domain/revisions/revision";
import type { NewActivityEvent } from "./activity-events-repository";
import { D1RecordRevisionSequencesRepository } from "./record-revision-sequences-repository";

interface RevisionRow {
  id: string;
  organization_id: string;
  project_id: string;
  record_id: string;
  revision_number: number;
  revision_label: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  change_summary: string;
  status: RevisionStatus;
  created_by: string;
  created_at: string;
}

const REVISION_COLUMNS = `id, organization_id, project_id, record_id, revision_number,
  revision_label, title, description, discipline, source, change_summary, status,
  created_by, created_at`;

function mapRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    recordId: row.record_id,
    revisionNumber: row.revision_number,
    revisionLabel: row.revision_label,
    title: row.title,
    description: row.description,
    discipline: row.discipline,
    source: row.source,
    changeSummary: row.change_summary,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function state(revision: Revision): { [key: string]: unknown } {
  return {
    projectId: revision.projectId,
    recordId: revision.recordId,
    revisionNumber: revision.revisionNumber,
    revisionLabel: revision.revisionLabel,
    title: revision.title,
    description: revision.description,
    discipline: revision.discipline,
    source: revision.source,
    changeSummary: revision.changeSummary,
    status: revision.status,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
  };
}

interface EventTarget {
  id: string;
  organizationId: string;
  recordId: string;
  status: RevisionStatus;
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
  target: EventTarget,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
         action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, json_object(
         'projectId', project_id,
         'recordId', record_id,
         'revisionNumber', revision_number,
         'revisionLabel', revision_label,
         'title', title,
         'description', description,
         'discipline', discipline,
         'source', source,
         'changeSummary', change_summary,
         'status', status,
         'createdBy', created_by,
         'createdAt', created_at
       ), ?, ?, ?
       FROM record_revisions
       WHERE id = ? AND organization_id = ? AND record_id = ?
         AND status = ? AND changes() = 1`,
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
      target.id,
      target.organizationId,
      target.recordId,
      target.status,
    );
}

export interface RevisionActor {
  actorUserId: string | null;
  actorType: "user" | "system";
  correlationId: string;
}

export class D1RecordRevisionsRepository {
  constructor(
    private readonly database: D1Database,
    private readonly sequences: D1RecordRevisionSequencesRepository,
  ) {}

  async list(organizationId: string, recordId: string): Promise<Revision[]> {
    const result = await this.database
      .prepare(
        `SELECT ${REVISION_COLUMNS} FROM record_revisions
         WHERE organization_id = ? AND record_id = ?
         ORDER BY revision_number DESC, id ASC`,
      )
      .bind(organizationId, recordId)
      .all<RevisionRow>();
    return result.results.map(mapRevision);
  }

  async findById(
    organizationId: string,
    recordId: string,
    revisionId: string,
  ): Promise<Revision | null> {
    const row = await this.database
      .prepare(
        `SELECT ${REVISION_COLUMNS} FROM record_revisions
         WHERE organization_id = ? AND record_id = ? AND id = ?`,
      )
      .bind(organizationId, recordId, revisionId)
      .first<RevisionRow>();
    return row ? mapRevision(row) : null;
  }

  private async findPublished(
    organizationId: string,
    recordId: string,
  ): Promise<Revision | null> {
    const row = await this.database
      .prepare(
        `SELECT ${REVISION_COLUMNS} FROM record_revisions
         WHERE organization_id = ? AND record_id = ? AND status = 'published'`,
      )
      .bind(organizationId, recordId)
      .first<RevisionRow>();
    return row ? mapRevision(row) : null;
  }

  async createDraftWithActivity(
    record: Record,
    createdBy: string,
    input: RevisionWriteInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<Revision> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const results = await this.database.batch([
      this.sequences.ensureStatement(record.organizationId, record.id),
      this.sequences.advanceStatement(record.organizationId, record.id),
      this.database
        .prepare(
          `INSERT INTO record_revisions
            (id, organization_id, project_id, record_id, revision_number, revision_label,
             title, description, discipline, source, change_summary, status, created_by, created_at)
           SELECT ?, ?, ?, ?, (
             SELECT last_number FROM record_revision_sequences
             WHERE record_id = ? AND organization_id = ?
           ), ?, ?, ?, ?, ?, ?, 'draft', ?, ?
           WHERE EXISTS (
             SELECT 1 FROM records WHERE id = ? AND organization_id = ? AND status = 'active'
           )`,
        )
        .bind(
          id,
          record.organizationId,
          record.projectId,
          record.id,
          record.id,
          record.organizationId,
          input.revisionLabel,
          input.title,
          input.description,
          input.discipline,
          input.source,
          input.changeSummary,
          createdBy,
          now,
          record.id,
          record.organizationId,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: record.organizationId,
          objectId: id,
          newState: null,
        },
        {
          id,
          organizationId: record.organizationId,
          recordId: record.id,
          status: "draft",
        },
      ),
    ]);
    if (results[2].meta.changes !== 1 || results[3].meta.changes !== 1) {
      throw new RecordArchivedError("be edited");
    }
    const created = await this.findById(record.organizationId, record.id, id);
    if (!created) throw new Error("Created revision could not be loaded.");
    return created;
  }

  async publishWithActivity(
    record: Record,
    draft: Revision,
    actor: RevisionActor,
  ): Promise<Revision> {
    const priorPublished = await this.findPublished(
      record.organizationId,
      record.id,
    );
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    // The prior-published lookup above is a plain read outside the atomic
    // batch, so it can be stale under concurrent publishes. The supersede
    // statement below re-checks `status = 'published'` at execution time
    // (inside the same transaction as the publish that follows), so a stale
    // read only ever causes this statement to affect zero rows -- it can
    // never incorrectly supersede a revision that something else already
    // superseded. The partial unique index on `record_revisions(record_id)
    // WHERE status = 'published'` is the final backstop: it guarantees at
    // most one published revision per record even if two requests race with
    // neither having read a prior published revision at all.
    let supersedeIndex = -1;
    let supersedeEventIndex = -1;
    if (priorPublished) {
      statements.push(
        this.database
          .prepare(
            `UPDATE record_revisions SET status = 'superseded'
             WHERE id = ? AND organization_id = ? AND record_id = ? AND status = 'published'`,
          )
          .bind(priorPublished.id, record.organizationId, record.id),
      );
      supersedeIndex = statements.length - 1;
      statements.push(
        eventStatement(
          this.database,
          {
            organizationId: record.organizationId,
            actorUserId: actor.actorUserId,
            actorType: actor.actorType,
            objectType: "revision",
            objectId: priorPublished.id,
            action: "revision.superseded",
            priorState: state(priorPublished),
            newState: null,
            metadata: {},
            correlationId: actor.correlationId,
          },
          {
            id: priorPublished.id,
            organizationId: record.organizationId,
            recordId: record.id,
            status: "superseded",
          },
        ),
      );
      supersedeEventIndex = statements.length - 1;
    }

    const publishIndex = statements.length;
    statements.push(
      this.database
        .prepare(
          `UPDATE record_revisions SET status = 'published'
           WHERE id = ? AND organization_id = ? AND record_id = ? AND status = 'draft'`,
        )
        .bind(draft.id, record.organizationId, record.id),
    );
    const publishEventIndex = statements.length;
    statements.push(
      eventStatement(
        this.database,
        {
          organizationId: record.organizationId,
          actorUserId: actor.actorUserId,
          actorType: actor.actorType,
          objectType: "revision",
          objectId: draft.id,
          action: "revision.published",
          priorState: state(draft),
          newState: null,
          metadata: {},
          correlationId: actor.correlationId,
        },
        {
          id: draft.id,
          organizationId: record.organizationId,
          recordId: record.id,
          status: "published",
        },
      ),
    );

    const recordUpdateIndex = statements.length;
    statements.push(
      this.database
        .prepare(
          `UPDATE records SET current_revision_id = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'active'`,
        )
        .bind(
          draft.id,
          now,
          record.id,
          record.organizationId,
          record.projectId,
        ),
    );

    const results = await this.database.batch(statements);

    if (
      (supersedeIndex >= 0 && results[supersedeIndex].meta.changes !== 1) ||
      (supersedeEventIndex >= 0 &&
        results[supersedeEventIndex].meta.changes !== 1) ||
      results[publishIndex].meta.changes !== 1 ||
      results[publishEventIndex].meta.changes !== 1
    ) {
      throw new RevisionIllegalTransitionError(draft.status, "be published");
    }
    if (results[recordUpdateIndex].meta.changes !== 1) {
      throw new RecordArchivedError("be edited");
    }

    const published = await this.findById(
      record.organizationId,
      record.id,
      draft.id,
    );
    if (!published) throw new Error("Published revision could not be loaded.");
    return published;
  }
}
