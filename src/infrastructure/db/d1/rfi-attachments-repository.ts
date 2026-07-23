import type {
  RfiAttachment,
  RfiAttachmentRole,
} from "../../../domain/rfis/rfi";
import type { NewActivityEvent } from "./activity-events-repository";

interface RfiAttachmentRow {
  id: string;
  organization_id: string;
  project_id: string;
  record_id: string;
  revision_id: string;
  role: RfiAttachmentRole;
  storage_key: string;
  original_filename: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string;
}

const ATTACHMENT_COLUMNS = `id, organization_id, project_id, record_id, revision_id, role, storage_key,
  original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at`;

function mapAttachment(row: RfiAttachmentRow): RfiAttachment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    rfiId: row.record_id,
    revisionId: row.revision_id,
    role: row.role,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
         action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE changes() = 1`,
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
      event.newState ? JSON.stringify(event.newState) : null,
      JSON.stringify(event.metadata ?? {}),
      event.correlationId,
      new Date().toISOString(),
    );
}

export class D1RfiAttachmentsRepository {
  constructor(private readonly database: D1Database) {}

  async list(organizationId: string, rfiId: string): Promise<RfiAttachment[]> {
    const result = await this.database
      .prepare(
        `SELECT ${ATTACHMENT_COLUMNS} FROM revision_files
         WHERE organization_id = ? AND record_id = ?
           AND role IN ('supporting_attachment', 'reference_drawing', 'response_attachment', 'generated_artifact')
         ORDER BY role ASC, uploaded_at ASC, id ASC`,
      )
      .bind(organizationId, rfiId)
      .all<RfiAttachmentRow>();
    return result.results.map(mapAttachment);
  }

  async findById(
    organizationId: string,
    rfiId: string,
    attachmentId: string,
  ): Promise<RfiAttachment | null> {
    const row = await this.database
      .prepare(
        `SELECT ${ATTACHMENT_COLUMNS} FROM revision_files
         WHERE organization_id = ? AND record_id = ? AND id = ?
           AND role IN ('supporting_attachment', 'reference_drawing', 'response_attachment', 'generated_artifact')`,
      )
      .bind(organizationId, rfiId, attachmentId)
      .first<RfiAttachmentRow>();
    return row ? mapAttachment(row) : null;
  }

  /**
   * Persists the attachment row and its `rfi.attachment_added` activity event in
   * one batch. The insert is guarded by the parent RFI still being in an
   * attachable pre-issue state, so an attachment cannot be added to an issued or
   * closed RFI even if the actor's own check raced. On failure the whole
   * transaction rolls back and the caller removes the already-written R2 object.
   */
  async createWithActivity(
    attachment: RfiAttachment,
    event: Omit<
      NewActivityEvent,
      "organizationId" | "objectId" | "priorState" | "newState"
    >,
  ): Promise<RfiAttachment> {
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO revision_files (${ATTACHMENT_COLUMNS})
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM records record
             JOIN record_revisions revision
               ON revision.id = ? AND revision.record_id = record.id
              AND revision.organization_id = record.organization_id
              AND revision.project_id = record.project_id
             WHERE record.id = ? AND record.organization_id = ?
               AND record.project_id = ? AND record.record_type_key = 'rfi'
               AND record.workflow_status IN ('draft', 'ready_to_issue')
               AND revision.status = 'draft'
           )`,
        )
        .bind(
          attachment.id,
          attachment.organizationId,
          attachment.projectId,
          attachment.rfiId,
          attachment.revisionId,
          attachment.role,
          attachment.storageKey,
          attachment.originalFilename,
          attachment.mediaType,
          attachment.byteSize,
          attachment.sha256,
          attachment.uploadedBy,
          attachment.uploadedAt,
          attachment.revisionId,
          attachment.rfiId,
          attachment.organizationId,
          attachment.projectId,
        ),
      eventStatement(this.database, {
        ...event,
        organizationId: attachment.organizationId,
        objectId: attachment.rfiId,
        priorState: null,
        newState: null,
      }),
    ]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      throw new RfiAttachmentRejectedError();
    }
    return attachment;
  }
}

// The RFI was not in an attachable state when the write ran (issued/closed/void),
// so the attachment and its event were both rolled back.
export class RfiAttachmentRejectedError extends Error {
  constructor() {
    super("Attachments can only be added to a draft RFI.");
  }
}
