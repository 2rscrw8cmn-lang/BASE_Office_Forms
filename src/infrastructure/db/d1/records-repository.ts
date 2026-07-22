import type {
  Record,
  RecordStatus,
  RecordUpdateInput,
  RecordCreateInput,
} from "../../../domain/records/record";
import { RecordArchivedError } from "../../../domain/records/errors";
import type { NewActivityEvent } from "./activity-events-repository";
import { D1ProjectRecordSequencesRepository } from "./project-record-sequences-repository";

interface RecordRow {
  id: string;
  organization_id: string;
  project_id: string;
  record_type: Record["recordType"];
  record_number: string | null;
  title: string;
  description: string | null;
  status: RecordStatus;
  discipline: string | null;
  source: string | null;
  created_by: string;
  current_revision_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const RECORD_COLUMNS = `id, organization_id, project_id, record_type, record_number,
  title, description, status, discipline, source, created_by, current_revision_id,
  archived_at, created_at, updated_at`;

function mapRecord(row: RecordRow): Record {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    recordType: row.record_type,
    recordNumber: row.record_number,
    title: row.title,
    description: row.description,
    status: row.status,
    discipline: row.discipline,
    source: row.source,
    createdBy: row.created_by,
    currentRevisionId: row.current_revision_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function state(record: Record): { [key: string]: unknown } {
  return {
    projectId: record.projectId,
    recordType: record.recordType,
    recordNumber: record.recordNumber,
    title: record.title,
    description: record.description,
    status: record.status,
    discipline: record.discipline,
    source: record.source,
    createdBy: record.createdBy,
    currentRevisionId: record.currentRevisionId,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
  record: Record,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
         action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, json_object(
         'projectId', project_id,
         'recordType', record_type,
         'recordNumber', record_number,
         'title', title,
         'description', description,
         'status', status,
         'discipline', discipline,
         'source', source,
         'createdBy', created_by,
         'currentRevisionId', current_revision_id,
         'archivedAt', archived_at,
         'createdAt', created_at,
         'updatedAt', updated_at
       ), ?, ?, ?
       FROM records
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
      record.id,
      record.organizationId,
      record.projectId,
      record.status,
      record.updatedAt,
    );
}

type ActivityInput = Omit<
  NewActivityEvent,
  "organizationId" | "objectId" | "priorState" | "newState"
>;

export class D1RecordsRepository {
  constructor(
    private readonly database: D1Database,
    private readonly sequences: D1ProjectRecordSequencesRepository,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    includeArchived = false,
  ): Promise<Record[]> {
    const result = await this.database
      .prepare(
        `SELECT ${RECORD_COLUMNS} FROM records
         WHERE organization_id = ? AND project_id = ?
           ${includeArchived ? "" : "AND status = 'active'"}
         ORDER BY created_at DESC, id ASC`,
      )
      .bind(organizationId, projectId)
      .all<RecordRow>();
    return result.results.map(mapRecord);
  }

  async findById(
    organizationId: string,
    projectId: string,
    recordId: string,
  ): Promise<Record | null> {
    const row = await this.database
      .prepare(
        `SELECT ${RECORD_COLUMNS} FROM records
         WHERE organization_id = ? AND project_id = ? AND id = ?`,
      )
      .bind(organizationId, projectId, recordId)
      .first<RecordRow>();
    return row ? mapRecord(row) : null;
  }

  async createWithActivity(
    organizationId: string,
    projectId: string,
    createdBy: string,
    input: RecordCreateInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<Record> {
    const now = new Date().toISOString();
    const record: Record = {
      id: crypto.randomUUID(),
      organizationId,
      projectId,
      ...input,
      recordNumber: null,
      status: "active",
      createdBy,
      currentRevisionId: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.sequences.ensureStatement(organizationId, projectId, now),
      this.sequences.advanceStatement(organizationId, projectId, now),
      this.database
        .prepare(
          `INSERT INTO records (${RECORD_COLUMNS}, record_type_key)
           SELECT ?, ?, ?, ?, printf('%04d', last_number), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM project_record_sequences
           WHERE organization_id = ? AND project_id = ?`,
        )
        .bind(
          record.id,
          record.organizationId,
          record.projectId,
          record.recordType,
          record.title,
          record.description,
          record.status,
          record.discipline,
          record.source,
          record.createdBy,
          record.currentRevisionId,
          record.archivedAt,
          record.createdAt,
          record.updatedAt,
          record.recordType,
          record.organizationId,
          record.projectId,
        ),
      eventStatement(
        this.database,
        { ...event, organizationId, objectId: record.id, newState: null },
        record,
      ),
    ]);
    if (results[2].meta.changes !== 1 || results[3].meta.changes !== 1) {
      throw new Error("Record could not be created.");
    }
    const created = await this.findById(organizationId, projectId, record.id);
    if (!created) throw new Error("Created record could not be loaded.");
    return created;
  }

  async updateWithActivity(
    record: Record,
    input: RecordUpdateInput,
    event: ActivityInput,
  ): Promise<Record> {
    if (record.status !== "active") throw new RecordArchivedError("be edited");
    const updated: Record = {
      ...record,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE records SET title = ?, description = ?,
           discipline = ?, source = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'active'`,
        )
        .bind(
          updated.title,
          updated.description,
          updated.discipline,
          updated.source,
          updated.updatedAt,
          updated.id,
          updated.organizationId,
          updated.projectId,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: updated.organizationId,
          objectId: updated.id,
          priorState: state(record),
          newState: null,
        },
        updated,
      ),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new RecordArchivedError("be edited");
    }
    return updated;
  }

  async archiveWithActivity(
    record: Record,
    event: ActivityInput,
  ): Promise<Record> {
    if (record.status !== "active")
      throw new RecordArchivedError("be archived");
    const now = new Date().toISOString();
    const archived: Record = {
      ...record,
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    };
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE records SET status = 'archived', archived_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'active'`,
        )
        .bind(
          archived.archivedAt,
          archived.updatedAt,
          archived.id,
          archived.organizationId,
          archived.projectId,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: archived.organizationId,
          objectId: archived.id,
          priorState: state(record),
          newState: null,
        },
        archived,
      ),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new RecordArchivedError("be archived");
    }
    return archived;
  }
}
