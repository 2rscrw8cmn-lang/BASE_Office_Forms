import type {
  Issuance,
  IssuanceFile,
  IssuancePurpose,
  IssuanceSummary,
  RevisionSnapshot,
} from "../../../domain/issuances/issuance";
import { D1ProjectIssuanceSequencesRepository } from "./project-issuance-sequences-repository";

interface IssuanceRow {
  id: string;
  organization_id: string;
  project_id: string;
  record_id: string;
  revision_id: string;
  issue_number: string;
  issue_sequence: number;
  purpose: IssuancePurpose;
  notes: string | null;
  revision_snapshot_json: string;
  issued_by: string;
  issued_at: string;
  correlation_id: string;
}

interface IssuanceFileRow {
  issuance_id: string;
  organization_id: string;
  project_id: string;
  record_id: string;
  revision_id: string;
  file_id: string;
  original_filename: string;
  media_type: string;
  byte_size: number;
  sha256: string;
  storage_key: string;
  display_order: number;
}

interface IssuanceSummaryRow {
  id: string;
  issue_number: string;
  record_id: string;
  revision_id: string;
  purpose: IssuancePurpose;
  issued_by: string;
  issued_at: string;
  file_count: number;
}

const ISSUANCE_COLUMNS = `id, organization_id, project_id, record_id, revision_id,
  issue_number, issue_sequence, purpose, notes, revision_snapshot_json, issued_by,
  issued_at, correlation_id`;
const ISSUANCE_FILE_COLUMNS = `issuance_id, organization_id, project_id, record_id,
  revision_id, file_id, original_filename, media_type, byte_size, sha256, storage_key,
  display_order`;

function mapFile(row: IssuanceFileRow): IssuanceFile {
  return {
    issuanceId: row.issuance_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    recordId: row.record_id,
    revisionId: row.revision_id,
    fileId: row.file_id,
    originalFilename: row.original_filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    storageKey: row.storage_key,
    displayOrder: row.display_order,
  };
}

function mapIssuance(row: IssuanceRow, files: IssuanceFile[]): Issuance {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    recordId: row.record_id,
    revisionId: row.revision_id,
    issueNumber: row.issue_number,
    issueSequence: row.issue_sequence,
    purpose: row.purpose,
    notes: row.notes,
    revisionSnapshot: JSON.parse(
      row.revision_snapshot_json,
    ) as RevisionSnapshot,
    issuedBy: row.issued_by,
    issuedAt: row.issued_at,
    correlationId: row.correlation_id,
    files,
  };
}

export interface NewIssuance {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  purpose: IssuancePurpose;
  notes: string | null;
  revisionSnapshotJson: string;
  issuedBy: string;
  issuedAt: string;
  correlationId: string;
  files: IssuanceFile[];
}

export class D1IssuancesRepository {
  constructor(
    private readonly database: D1Database,
    private readonly sequences: D1ProjectIssuanceSequencesRepository,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
  ): Promise<IssuanceSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT i.id, i.issue_number, i.record_id, i.revision_id, i.purpose,
                i.issued_by, i.issued_at, COUNT(f.file_id) AS file_count
         FROM issuances AS i
         LEFT JOIN issuance_files AS f ON f.issuance_id = i.id
         WHERE i.organization_id = ? AND i.project_id = ?
         GROUP BY i.id, i.issue_number, i.issue_sequence, i.record_id, i.revision_id,
                  i.purpose, i.issued_by, i.issued_at
         ORDER BY i.issue_sequence DESC, i.id ASC`,
      )
      .bind(organizationId, projectId)
      .all<IssuanceSummaryRow>();
    return result.results.map((row) => ({
      id: row.id,
      issueNumber: row.issue_number,
      recordId: row.record_id,
      revisionId: row.revision_id,
      purpose: row.purpose,
      issuedBy: row.issued_by,
      issuedAt: row.issued_at,
      fileCount: row.file_count,
    }));
  }

  async findById(
    organizationId: string,
    projectId: string,
    issuanceId: string,
  ): Promise<Issuance | null> {
    const row = await this.database
      .prepare(
        `SELECT ${ISSUANCE_COLUMNS} FROM issuances
         WHERE organization_id = ? AND project_id = ? AND id = ?`,
      )
      .bind(organizationId, projectId, issuanceId)
      .first<IssuanceRow>();
    if (!row) return null;
    const files = await this.database
      .prepare(
        `SELECT ${ISSUANCE_FILE_COLUMNS} FROM issuance_files
         WHERE issuance_id = ? AND organization_id = ? AND project_id = ?
         ORDER BY display_order ASC`,
      )
      .bind(issuanceId, organizationId, projectId)
      .all<IssuanceFileRow>();
    return mapIssuance(row, files.results.map(mapFile));
  }

  async createWithFilesAndActivity(input: NewIssuance): Promise<Issuance> {
    const statements: D1PreparedStatement[] = [
      this.sequences.ensureStatement(input.organizationId, input.projectId),
      this.database
        .prepare(
          `INSERT INTO issuances (${ISSUANCE_COLUMNS})
           SELECT ?, ?, ?, ?, ?,
             'ISS-' || printf('%03d', sequence.next_sequence),
             sequence.next_sequence, ?, ?, ?, ?, ?, ?
           FROM project_issuance_sequences AS sequence
           WHERE sequence.project_id = ? AND sequence.organization_id = ?
             AND EXISTS (
               SELECT 1 FROM records
               WHERE id = ? AND organization_id = ? AND project_id = ? AND status = 'active'
             )
             AND EXISTS (
               SELECT 1 FROM record_revisions
               WHERE id = ? AND organization_id = ? AND project_id = ?
                 AND record_id = ? AND status = 'published'
             )`,
        )
        .bind(
          input.id,
          input.organizationId,
          input.projectId,
          input.recordId,
          input.revisionId,
          input.purpose,
          input.notes,
          input.revisionSnapshotJson,
          input.issuedBy,
          input.issuedAt,
          input.correlationId,
          input.projectId,
          input.organizationId,
          input.recordId,
          input.organizationId,
          input.projectId,
          input.revisionId,
          input.organizationId,
          input.projectId,
          input.recordId,
        ),
      this.sequences.advanceStatement(
        input.organizationId,
        input.projectId,
        input.id,
      ),
    ];

    for (const file of input.files) {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO issuance_files (${ISSUANCE_FILE_COLUMNS})
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            file.issuanceId,
            file.organizationId,
            file.projectId,
            file.recordId,
            file.revisionId,
            file.fileId,
            file.originalFilename,
            file.mediaType,
            file.byteSize,
            file.sha256,
            file.storageKey,
            file.displayOrder,
          ),
      );
    }

    const activityIndex = statements.length;
    statements.push(
      this.database
        .prepare(
          `INSERT INTO activity_events
            (id, organization_id, actor_user_id, actor_type, object_type, object_id,
             action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
           VALUES (?, ?, ?, 'user', 'issuance', ?, 'issuance.created', NULL,
             (SELECT json_object(
               'id', issuance.id,
               'organizationId', issuance.organization_id,
               'projectId', issuance.project_id,
               'recordId', issuance.record_id,
               'revisionId', issuance.revision_id,
               'issueNumber', issuance.issue_number,
               'issueSequence', issuance.issue_sequence,
               'purpose', issuance.purpose,
               'notes', issuance.notes,
               'revisionSnapshot', json(issuance.revision_snapshot_json),
               'issuedBy', issuance.issued_by,
               'issuedAt', issuance.issued_at,
               'files', json((
                 SELECT json_group_array(json_object(
                   'fileId', selected.file_id,
                   'originalFilename', selected.original_filename,
                   'mediaType', selected.media_type,
                   'byteSize', selected.byte_size,
                   'sha256', selected.sha256,
                   'displayOrder', selected.display_order
                 ))
                 FROM (
                   SELECT file_id, original_filename, media_type, byte_size,
                          sha256, display_order
                   FROM issuance_files
                   WHERE issuance_id = ?
                   ORDER BY display_order ASC
                 ) AS selected
               ))
             ) FROM issuances AS issuance WHERE issuance.id = ?),
             '{}', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.organizationId,
          input.issuedBy,
          input.id,
          input.id,
          input.id,
          input.correlationId,
          input.issuedAt,
        ),
    );

    const results = await this.database.batch(statements);
    const fileResults = results.slice(3, activityIndex);
    if (
      results[1].meta.changes !== 1 ||
      results[2].meta.changes !== 1 ||
      fileResults.some((result) => result.meta.changes !== 1) ||
      results[activityIndex].meta.changes !== 1
    ) {
      throw new Error("The atomic issuance write did not affect every row.");
    }
    const created = await this.findById(
      input.organizationId,
      input.projectId,
      input.id,
    );
    if (!created) throw new Error("Created issuance could not be loaded.");
    return created;
  }
}
