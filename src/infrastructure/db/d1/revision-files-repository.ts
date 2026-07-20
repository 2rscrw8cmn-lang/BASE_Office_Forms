import { RecordArchivedError } from "../../../domain/records/errors";
import type { RevisionFile } from "../../../domain/files/file";
import type { NewActivityEvent } from "./activity-events-repository";

interface FileRow {
  id: string;
  organization_id: string;
  project_id: string;
  record_id: string;
  revision_id: string;
  storage_key: string;
  original_filename: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string;
}

const FILE_COLUMNS = `id, organization_id, project_id, record_id, revision_id,
  storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at`;

function mapFile(row: FileRow): RevisionFile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    recordId: row.record_id,
    revisionId: row.revision_id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

interface EventTarget {
  id: string;
  organizationId: string;
  revisionId: string;
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
         'revisionId', revision_id,
         'storageKey', storage_key,
         'originalFilename', original_filename,
         'mediaType', media_type,
         'byteSize', byte_size,
         'sha256', sha256,
         'uploadedBy', uploaded_by,
         'uploadedAt', uploaded_at
       ), ?, ?, ?
       FROM revision_files
       WHERE id = ? AND organization_id = ? AND revision_id = ? AND changes() = 1`,
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
      target.revisionId,
    );
}

export class D1RevisionFilesRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    revisionId: string,
  ): Promise<RevisionFile[]> {
    const result = await this.database
      .prepare(
        `SELECT ${FILE_COLUMNS} FROM revision_files
         WHERE organization_id = ? AND revision_id = ?
         ORDER BY uploaded_at ASC, id ASC`,
      )
      .bind(organizationId, revisionId)
      .all<FileRow>();
    return result.results.map(mapFile);
  }

  async findById(
    organizationId: string,
    revisionId: string,
    fileId: string,
  ): Promise<RevisionFile | null> {
    const row = await this.database
      .prepare(
        `SELECT ${FILE_COLUMNS} FROM revision_files
         WHERE organization_id = ? AND revision_id = ? AND id = ?`,
      )
      .bind(organizationId, revisionId, fileId)
      .first<FileRow>();
    return row ? mapFile(row) : null;
  }

  /**
   * Persists the file row and its `file.uploaded` activity event in one
   * batch (one D1 transaction). The insert is guarded by the parent record
   * still being active, defending against a record being archived between
   * the caller's own check and this write; if either statement is blocked
   * or the batch itself fails (for example an activity-append trigger), the
   * whole transaction rolls back and the caller is responsible for removing
   * the already-written R2 object.
   */
  async createWithActivity(
    file: RevisionFile,
    event: Omit<
      NewActivityEvent,
      "organizationId" | "objectId" | "priorState" | "newState"
    >,
  ): Promise<RevisionFile> {
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO revision_files (${FILE_COLUMNS})
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM records WHERE id = ? AND organization_id = ? AND status = 'active'
           )`,
        )
        .bind(
          file.id,
          file.organizationId,
          file.projectId,
          file.recordId,
          file.revisionId,
          file.storageKey,
          file.originalFilename,
          file.mediaType,
          file.byteSize,
          file.sha256,
          file.uploadedBy,
          file.uploadedAt,
          file.recordId,
          file.organizationId,
        ),
      eventStatement(
        this.database,
        {
          ...event,
          organizationId: file.organizationId,
          objectId: file.id,
          priorState: null,
          newState: null,
        },
        {
          id: file.id,
          organizationId: file.organizationId,
          revisionId: file.revisionId,
        },
      ),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new RecordArchivedError("be edited");
    }
    return file;
  }
}
