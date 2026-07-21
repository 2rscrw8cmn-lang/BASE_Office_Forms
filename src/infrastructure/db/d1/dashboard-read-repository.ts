import type { RfiStatus } from "../../../domain/rfis/rfi";
import type { IssuancePurpose } from "../../../domain/issuances/issuance";

/**
 * Read-only query layer for the cross-project Work Dashboard. Every query is
 * scoped by organization and by the explicit set of project IDs the caller has
 * already been authorized to access, so authorization is never reconstructed
 * here or in the browser. All SQL is parameterized.
 */

export interface DashboardDraftRevision {
  revisionId: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  recordId: string;
  recordNumber: string | null;
  recordTitle: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  createdAt: string;
}

export interface DashboardReadyToIssue extends DashboardDraftRevision {
  fileCount: number;
}

export interface DashboardActiveRfi {
  rfiId: string;
  rfiNumber: string | null;
  title: string;
  status: Extract<RfiStatus, "issued" | "answered">;
  dueDate: string | null;
  projectId: string;
  projectNumber: string;
  projectName: string;
  createdAt: string;
}

export interface DashboardRecentFile {
  fileId: string;
  originalFilename: string;
  uploadedAt: string;
  revisionId: string;
  revisionNumber: number;
  recordId: string;
  recordTitle: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
}

export interface DashboardRecentIssuance {
  issuanceId: string;
  issueNumber: string;
  purpose: IssuancePurpose;
  issuedAt: string;
  issuedByName: string | null;
  fileCount: number;
  recordId: string;
  recordTitle: string;
  revisionId: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
}

export interface DashboardReadData {
  draftRevisionCount: number;
  readyToIssueCount: number;
  activeRfiCount: number;
  draftRevisions: DashboardDraftRevision[];
  readyToIssue: DashboardReadyToIssue[];
  activeRfis: DashboardActiveRfi[];
  recentFiles: DashboardRecentFile[];
  recentIssuances: DashboardRecentIssuance[];
}

const ATTENTION_LIMIT = 5;

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export class D1DashboardReadRepository {
  constructor(private readonly database: D1Database) {}

  async load(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardReadData> {
    if (projectIds.length === 0) {
      return {
        draftRevisionCount: 0,
        readyToIssueCount: 0,
        activeRfiCount: 0,
        draftRevisions: [],
        readyToIssue: [],
        activeRfis: [],
        recentFiles: [],
        recentIssuances: [],
      };
    }

    const [
      draftRevisionCount,
      readyToIssueCount,
      activeRfiCount,
      draftRevisions,
      readyToIssue,
      activeRfis,
      recentFiles,
      recentIssuances,
    ] = await Promise.all([
      this.countDraftRevisions(organizationId, projectIds),
      this.countReadyToIssue(organizationId, projectIds),
      this.countActiveRfis(organizationId, projectIds),
      this.listDraftRevisions(organizationId, projectIds),
      this.listReadyToIssue(organizationId, projectIds),
      this.listActiveRfis(organizationId, projectIds),
      this.listRecentFiles(organizationId, projectIds),
      this.listRecentIssuances(organizationId, projectIds),
    ]);

    return {
      draftRevisionCount,
      readyToIssueCount,
      activeRfiCount,
      draftRevisions,
      readyToIssue,
      activeRfis,
      recentFiles,
      recentIssuances,
    };
  }

  private async countDraftRevisions(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT COUNT(*) AS n
         FROM record_revisions rev
         JOIN records rec
           ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
         WHERE rev.organization_id = ?
           AND rev.status = 'draft'
           AND rec.status = 'active'
           AND rev.project_id IN (${placeholders(projectIds.length)})`,
      )
      .bind(organizationId, ...projectIds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  private async countReadyToIssue(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT rev.id
           FROM record_revisions rev
           JOIN records rec
             ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
           WHERE rev.organization_id = ?
             AND rev.status = 'published'
             AND rec.status = 'active'
             AND rev.project_id IN (${placeholders(projectIds.length)})
             AND EXISTS (
               SELECT 1 FROM revision_files f
               WHERE f.organization_id = rev.organization_id AND f.revision_id = rev.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM issuances i
               WHERE i.organization_id = rev.organization_id AND i.revision_id = rev.id
             )
         )`,
      )
      .bind(organizationId, ...projectIds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  private async countActiveRfis(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT COUNT(*) AS n
         FROM rfi_records
         WHERE organization_id = ?
           AND status IN ('issued', 'answered')
           AND project_id IN (${placeholders(projectIds.length)})`,
      )
      .bind(organizationId, ...projectIds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  private async listDraftRevisions(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardDraftRevision[]> {
    const result = await this.database
      .prepare(
        `SELECT rev.id AS revision_id, rev.revision_number, rev.revision_label,
                rev.title, rev.record_id, rec.record_number, rec.title AS record_title,
                rev.project_id, p.project_number, p.name AS project_name, rev.created_at
         FROM record_revisions rev
         JOIN records rec
           ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
         JOIN projects p
           ON p.id = rev.project_id AND p.organization_id = rev.organization_id
         WHERE rev.organization_id = ?
           AND rev.status = 'draft'
           AND rec.status = 'active'
           AND rev.project_id IN (${placeholders(projectIds.length)})
         ORDER BY rev.created_at DESC, rev.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, ...projectIds)
      .all<{
        revision_id: string;
        revision_number: number;
        revision_label: string | null;
        title: string;
        record_id: string;
        record_number: string | null;
        record_title: string;
        project_id: string;
        project_number: string;
        project_name: string;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      revisionId: row.revision_id,
      revisionNumber: row.revision_number,
      revisionLabel: row.revision_label,
      title: row.title,
      recordId: row.record_id,
      recordNumber: row.record_number,
      recordTitle: row.record_title,
      projectId: row.project_id,
      projectNumber: row.project_number,
      projectName: row.project_name,
      createdAt: row.created_at,
    }));
  }

  private async listReadyToIssue(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardReadyToIssue[]> {
    const result = await this.database
      .prepare(
        `SELECT rev.id AS revision_id, rev.revision_number, rev.revision_label,
                rev.title, rev.record_id, rec.record_number, rec.title AS record_title,
                rev.project_id, p.project_number, p.name AS project_name, rev.created_at,
                COUNT(f.id) AS file_count
         FROM record_revisions rev
         JOIN records rec
           ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
         JOIN projects p
           ON p.id = rev.project_id AND p.organization_id = rev.organization_id
         JOIN revision_files f
           ON f.revision_id = rev.id AND f.organization_id = rev.organization_id
         WHERE rev.organization_id = ?
           AND rev.status = 'published'
           AND rec.status = 'active'
           AND rev.project_id IN (${placeholders(projectIds.length)})
           AND NOT EXISTS (
             SELECT 1 FROM issuances i
             WHERE i.organization_id = rev.organization_id AND i.revision_id = rev.id
           )
         GROUP BY rev.id, rev.revision_number, rev.revision_label, rev.title,
                  rev.record_id, rec.record_number, rec.title, rev.project_id,
                  p.project_number, p.name, rev.created_at
         ORDER BY rev.created_at DESC, rev.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, ...projectIds)
      .all<{
        revision_id: string;
        revision_number: number;
        revision_label: string | null;
        title: string;
        record_id: string;
        record_number: string | null;
        record_title: string;
        project_id: string;
        project_number: string;
        project_name: string;
        created_at: string;
        file_count: number;
      }>();
    return result.results.map((row) => ({
      revisionId: row.revision_id,
      revisionNumber: row.revision_number,
      revisionLabel: row.revision_label,
      title: row.title,
      recordId: row.record_id,
      recordNumber: row.record_number,
      recordTitle: row.record_title,
      projectId: row.project_id,
      projectNumber: row.project_number,
      projectName: row.project_name,
      createdAt: row.created_at,
      fileCount: row.file_count,
    }));
  }

  private async listActiveRfis(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardActiveRfi[]> {
    const result = await this.database
      .prepare(
        `SELECT r.id AS rfi_id, r.rfi_number, r.title, r.status, r.due_date,
                r.project_id, p.project_number, p.name AS project_name, r.created_at
         FROM rfi_records r
         JOIN projects p
           ON p.id = r.project_id AND p.organization_id = r.organization_id
         WHERE r.organization_id = ?
           AND r.status IN ('issued', 'answered')
           AND r.project_id IN (${placeholders(projectIds.length)})
         ORDER BY CASE WHEN r.due_date IS NULL THEN 1 ELSE 0 END,
                  r.due_date ASC, r.created_at DESC, r.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, ...projectIds)
      .all<{
        rfi_id: string;
        rfi_number: string | null;
        title: string;
        status: Extract<RfiStatus, "issued" | "answered">;
        due_date: string | null;
        project_id: string;
        project_number: string;
        project_name: string;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      rfiId: row.rfi_id,
      rfiNumber: row.rfi_number,
      title: row.title,
      status: row.status,
      dueDate: row.due_date,
      projectId: row.project_id,
      projectNumber: row.project_number,
      projectName: row.project_name,
      createdAt: row.created_at,
    }));
  }

  private async listRecentFiles(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardRecentFile[]> {
    const result = await this.database
      .prepare(
        `SELECT f.id AS file_id, f.original_filename, f.uploaded_at,
                f.revision_id, rev.revision_number, f.record_id,
                rec.title AS record_title, f.project_id,
                p.project_number, p.name AS project_name
         FROM revision_files f
         JOIN record_revisions rev
           ON rev.id = f.revision_id AND rev.organization_id = f.organization_id
         JOIN records rec
           ON rec.id = f.record_id AND rec.organization_id = f.organization_id
         JOIN projects p
           ON p.id = f.project_id AND p.organization_id = f.organization_id
         WHERE f.organization_id = ?
           AND f.project_id IN (${placeholders(projectIds.length)})
         ORDER BY f.uploaded_at DESC, f.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, ...projectIds)
      .all<{
        file_id: string;
        original_filename: string;
        uploaded_at: string;
        revision_id: string;
        revision_number: number;
        record_id: string;
        record_title: string;
        project_id: string;
        project_number: string;
        project_name: string;
      }>();
    return result.results.map((row) => ({
      fileId: row.file_id,
      originalFilename: row.original_filename,
      uploadedAt: row.uploaded_at,
      revisionId: row.revision_id,
      revisionNumber: row.revision_number,
      recordId: row.record_id,
      recordTitle: row.record_title,
      projectId: row.project_id,
      projectNumber: row.project_number,
      projectName: row.project_name,
    }));
  }

  private async listRecentIssuances(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<DashboardRecentIssuance[]> {
    const result = await this.database
      .prepare(
        `SELECT i.id AS issuance_id, i.issue_number, i.purpose, i.issued_at,
                u.display_name AS issued_by_name, i.record_id,
                rec.title AS record_title, i.revision_id, i.project_id,
                p.project_number, p.name AS project_name,
                COUNT(fi.file_id) AS file_count
         FROM issuances i
         JOIN records rec
           ON rec.id = i.record_id AND rec.organization_id = i.organization_id
         JOIN projects p
           ON p.id = i.project_id AND p.organization_id = i.organization_id
         LEFT JOIN users u ON u.id = i.issued_by
         LEFT JOIN issuance_files fi ON fi.issuance_id = i.id
         WHERE i.organization_id = ?
           AND i.project_id IN (${placeholders(projectIds.length)})
         GROUP BY i.id, i.issue_number, i.issue_sequence, i.purpose, i.issued_at,
                  u.display_name, i.record_id, rec.title, i.revision_id,
                  i.project_id, p.project_number, p.name
         ORDER BY i.issued_at DESC, i.issue_sequence DESC, i.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, ...projectIds)
      .all<{
        issuance_id: string;
        issue_number: string;
        purpose: IssuancePurpose;
        issued_at: string;
        issued_by_name: string | null;
        record_id: string;
        record_title: string;
        revision_id: string;
        project_id: string;
        project_number: string;
        project_name: string;
        file_count: number;
      }>();
    return result.results.map((row) => ({
      issuanceId: row.issuance_id,
      issueNumber: row.issue_number,
      purpose: row.purpose,
      issuedAt: row.issued_at,
      issuedByName: row.issued_by_name,
      fileCount: row.file_count,
      recordId: row.record_id,
      recordTitle: row.record_title,
      revisionId: row.revision_id,
      projectId: row.project_id,
      projectNumber: row.project_number,
      projectName: row.project_name,
    }));
  }
}
