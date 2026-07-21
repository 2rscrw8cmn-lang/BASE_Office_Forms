import type { RecordStatus, RecordType } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";

/**
 * Read-only query layer for a single authorized project's Records register. The
 * caller resolves project access before calling in, so every query is scoped by
 * organization and the one requested project ID. All SQL is parameterized.
 *
 * The whole list summary is assembled in one query per project — the current
 * revision through the record's authoritative `current_revision_id`, draft
 * presence and file counts through record-scoped aggregates — so the browser
 * never fans out per-record, per-revision, or per-file requests.
 */

export interface RecordCurrentRevisionSummary {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
  status: RevisionStatus;
  title: string;
}

export interface RecordListSummary {
  id: string;
  projectId: string;
  recordNumber: string | null;
  title: string;
  recordType: RecordType;
  discipline: string | null;
  status: RecordStatus;
  currentRevision: RecordCurrentRevisionSummary | null;
  hasDraftRevision: boolean;
  /**
   * The draft revision id, present only when exactly one draft exists. When the
   * data ever holds more than one draft for a record (a domain-invariant
   * violation), this stays null rather than silently choosing one; the caller
   * still learns a draft exists through `hasDraftRevision`.
   */
  draftRevisionId: string | null;
  /** Total files attached to every revision of this record. */
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SummaryRow {
  id: string;
  project_id: string;
  record_number: string | null;
  title: string;
  record_type: RecordType;
  discipline: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  current_revision_id: string | null;
  cur_id: string | null;
  cur_revision_number: number | null;
  cur_revision_label: string | null;
  cur_status: RevisionStatus | null;
  cur_title: string | null;
  draft_count: number;
  draft_revision_id: string | null;
  file_count: number;
}

export class D1ProjectRecordsReadRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    projectId: string,
    includeArchived: boolean,
  ): Promise<RecordListSummary[]> {
    const result = await this.database
      .prepare(
        `SELECT
           r.id, r.project_id, r.record_number, r.title, r.record_type,
           r.discipline, r.status, r.created_at, r.updated_at,
           r.current_revision_id,
           cur.id AS cur_id,
           cur.revision_number AS cur_revision_number,
           cur.revision_label AS cur_revision_label,
           cur.status AS cur_status,
           cur.title AS cur_title,
           (SELECT COUNT(*) FROM record_revisions dr
              WHERE dr.organization_id = r.organization_id
                AND dr.record_id = r.id AND dr.status = 'draft') AS draft_count,
           (SELECT dr2.id FROM record_revisions dr2
              WHERE dr2.organization_id = r.organization_id
                AND dr2.record_id = r.id AND dr2.status = 'draft'
              ORDER BY dr2.revision_number DESC, dr2.id ASC LIMIT 1) AS draft_revision_id,
           (SELECT COUNT(*) FROM revision_files f
              WHERE f.organization_id = r.organization_id
                AND f.record_id = r.id) AS file_count
         FROM records r
         LEFT JOIN record_revisions cur
           ON cur.id = r.current_revision_id
           AND cur.organization_id = r.organization_id
           AND cur.record_id = r.id
         WHERE r.organization_id = ?1 AND r.project_id = ?2
           ${includeArchived ? "" : "AND r.status = 'active'"}
         ORDER BY r.created_at DESC, r.id ASC`,
      )
      .bind(organizationId, projectId)
      .all<SummaryRow>();
    return result.results.map((row) => this.mapSummary(row));
  }

  private mapSummary(row: SummaryRow): RecordListSummary {
    const currentRevision: RecordCurrentRevisionSummary | null =
      row.cur_id !== null &&
      row.cur_revision_number !== null &&
      row.cur_status !== null
        ? {
            id: row.cur_id,
            revisionNumber: row.cur_revision_number,
            revisionLabel: row.cur_revision_label,
            status: row.cur_status,
            title: row.cur_title ?? "",
          }
        : null;
    return {
      id: row.id,
      projectId: row.project_id,
      recordNumber: row.record_number,
      title: row.title,
      recordType: row.record_type,
      discipline: row.discipline,
      status: row.status,
      currentRevision,
      hasDraftRevision: row.draft_count > 0,
      draftRevisionId: row.draft_count === 1 ? row.draft_revision_id : null,
      fileCount: row.file_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
