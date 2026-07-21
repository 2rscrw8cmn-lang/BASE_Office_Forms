import type { RecordStatus, RecordType } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";

export interface RecordWorkspaceRecord {
  id: string;
  projectId: string;
  recordType: RecordType;
  recordNumber: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  status: RecordStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordWorkspaceRevision {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
  status: RevisionStatus;
  createdAt: string;
  fileCount: number;
  isCurrent: boolean;
}

export interface RecordWorkspaceData {
  record: RecordWorkspaceRecord;
  revisions: RecordWorkspaceRevision[];
  totalFileCount: number;
}

interface WorkspaceRow {
  record_id: string;
  project_id: string;
  record_type: RecordType;
  record_number: string | null;
  record_title: string;
  record_description: string | null;
  record_discipline: string | null;
  record_source: string | null;
  record_status: RecordStatus;
  archived_at: string | null;
  record_created_at: string;
  record_updated_at: string;
  current_revision_id: string | null;
  revision_id: string | null;
  revision_number: number | null;
  revision_label: string | null;
  revision_title: string | null;
  revision_description: string | null;
  revision_discipline: string | null;
  revision_source: string | null;
  change_summary: string | null;
  revision_status: RevisionStatus | null;
  revision_created_at: string | null;
  file_count: number;
}

/** One scoped query returns the record, every revision, and aggregate file counts. */
export class D1RecordWorkspaceReadRepository {
  constructor(private readonly database: D1Database) {}

  async find(
    organizationId: string,
    projectId: string,
    recordId: string,
  ): Promise<RecordWorkspaceData | null> {
    const result = await this.database
      .prepare(
        `SELECT r.id AS record_id, r.project_id, r.record_type, r.record_number,
           r.title AS record_title, r.description AS record_description,
           r.discipline AS record_discipline, r.source AS record_source,
           r.status AS record_status, r.archived_at,
           r.created_at AS record_created_at, r.updated_at AS record_updated_at,
           r.current_revision_id, rev.id AS revision_id, rev.revision_number,
           rev.revision_label, rev.title AS revision_title,
           rev.description AS revision_description,
           rev.discipline AS revision_discipline, rev.source AS revision_source,
           rev.change_summary, rev.status AS revision_status,
           rev.created_at AS revision_created_at, COUNT(f.id) AS file_count
         FROM records r
         LEFT JOIN record_revisions rev
           ON rev.organization_id = r.organization_id
          AND rev.project_id = r.project_id AND rev.record_id = r.id
         LEFT JOIN revision_files f
           ON f.organization_id = r.organization_id
          AND f.project_id = r.project_id AND f.record_id = r.id
          AND f.revision_id = rev.id
         WHERE r.organization_id = ?1 AND r.project_id = ?2 AND r.id = ?3
         GROUP BY r.id, rev.id
         ORDER BY rev.revision_number DESC, rev.id ASC`,
      )
      .bind(organizationId, projectId, recordId)
      .all<WorkspaceRow>();
    if (!result.results.length) return null;
    const first = result.results[0];
    const revisions = result.results.flatMap((row) =>
      row.revision_id === null ||
      row.revision_number === null ||
      row.revision_status === null ||
      row.revision_created_at === null
        ? []
        : [
            {
              id: row.revision_id,
              revisionNumber: row.revision_number,
              revisionLabel: row.revision_label,
              title: row.revision_title ?? "",
              description: row.revision_description,
              discipline: row.revision_discipline,
              source: row.revision_source,
              changeSummary: row.change_summary ?? "",
              status: row.revision_status,
              createdAt: row.revision_created_at,
              fileCount: row.file_count,
              isCurrent: row.revision_id === row.current_revision_id,
            },
          ],
    );
    return {
      record: {
        id: first.record_id,
        projectId: first.project_id,
        recordType: first.record_type,
        recordNumber: first.record_number,
        title: first.record_title,
        description: first.record_description,
        discipline: first.record_discipline,
        source: first.record_source,
        status: first.record_status,
        archivedAt: first.archived_at,
        createdAt: first.record_created_at,
        updatedAt: first.record_updated_at,
      },
      revisions,
      totalFileCount: revisions.reduce(
        (sum, revision) => sum + revision.fileCount,
        0,
      ),
    };
  }
}
