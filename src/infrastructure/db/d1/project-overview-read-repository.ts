import type { RfiStatus } from "../../../domain/rfis/rfi";

/**
 * Read-only query layer for a single authorized project's Overview read model.
 * The caller resolves project access before calling in, so every query is
 * scoped by organization and the one requested project ID. All SQL is
 * parameterized and definitions match the cross-project dashboard exactly.
 */

export interface ProjectOverviewCounts {
  records: number;
  draftRevisions: number;
  publishedRevisions: number;
  files: number;
  issuances: number;
  activeRfis: number;
  teamMembers: number;
}

export interface OverviewDraftRevision {
  revisionId: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  recordId: string;
  recordNumber: string | null;
  recordTitle: string;
  createdAt: string;
}

export interface OverviewReadyToIssue extends OverviewDraftRevision {
  fileCount: number;
}

export interface OverviewActiveRfi {
  rfiId: string;
  rfiNumber: string | null;
  title: string;
  status: Extract<RfiStatus, "issued" | "answered">;
  dueDate: string | null;
  createdAt: string;
}

export interface OverviewActivityEvent {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  actorUserId: string | null;
  actorType: "user" | "system";
  actorDisplayName: string | null;
  occurredAt: string;
}

const ATTENTION_LIMIT = 5;
const ACTIVITY_LIMIT = 10;

export class D1ProjectOverviewReadRepository {
  constructor(private readonly database: D1Database) {}

  async counts(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectOverviewCounts> {
    const row = await this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM records
             WHERE organization_id = ?1 AND project_id = ?2 AND status = 'active') AS records,
           (SELECT COUNT(*) FROM record_revisions rev
             JOIN records rec
               ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
             WHERE rev.organization_id = ?1 AND rev.project_id = ?2
               AND rev.status = 'draft' AND rec.status = 'active') AS draft_revisions,
           (SELECT COUNT(*) FROM record_revisions rev
             JOIN records rec
               ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
             WHERE rev.organization_id = ?1 AND rev.project_id = ?2
               AND rev.status = 'published' AND rec.status = 'active') AS published_revisions,
           (SELECT COUNT(*) FROM revision_files
             WHERE organization_id = ?1 AND project_id = ?2) AS files,
           (SELECT COUNT(*) FROM issuances
             WHERE organization_id = ?1 AND project_id = ?2) AS issuances,
           (SELECT COUNT(*) FROM rfi_records
             WHERE organization_id = ?1 AND project_id = ?2
               AND status IN ('issued', 'answered')) AS active_rfis,
           (SELECT COUNT(*) FROM project_memberships
             WHERE organization_id = ?1 AND project_id = ?2 AND status = 'active') AS team_members`,
      )
      .bind(organizationId, projectId)
      .first<{
        records: number;
        draft_revisions: number;
        published_revisions: number;
        files: number;
        issuances: number;
        active_rfis: number;
        team_members: number;
      }>();
    return {
      records: row?.records ?? 0,
      draftRevisions: row?.draft_revisions ?? 0,
      publishedRevisions: row?.published_revisions ?? 0,
      files: row?.files ?? 0,
      issuances: row?.issuances ?? 0,
      activeRfis: row?.active_rfis ?? 0,
      teamMembers: row?.team_members ?? 0,
    };
  }

  async draftRevisions(
    organizationId: string,
    projectId: string,
  ): Promise<OverviewDraftRevision[]> {
    const result = await this.database
      .prepare(
        `SELECT rev.id AS revision_id, rev.revision_number, rev.revision_label,
                rev.title, rev.record_id, rec.record_number, rec.title AS record_title,
                rev.created_at
         FROM record_revisions rev
         JOIN records rec
           ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
         WHERE rev.organization_id = ? AND rev.project_id = ?
           AND rev.status = 'draft' AND rec.status = 'active'
         ORDER BY rev.created_at DESC, rev.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, projectId)
      .all<{
        revision_id: string;
        revision_number: number;
        revision_label: string | null;
        title: string;
        record_id: string;
        record_number: string | null;
        record_title: string;
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
      createdAt: row.created_at,
    }));
  }

  async readyToIssue(
    organizationId: string,
    projectId: string,
  ): Promise<OverviewReadyToIssue[]> {
    const result = await this.database
      .prepare(
        `SELECT rev.id AS revision_id, rev.revision_number, rev.revision_label,
                rev.title, rev.record_id, rec.record_number, rec.title AS record_title,
                rev.created_at, COUNT(f.id) AS file_count
         FROM record_revisions rev
         JOIN records rec
           ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id
         JOIN revision_files f
           ON f.revision_id = rev.id AND f.organization_id = rev.organization_id
         WHERE rev.organization_id = ? AND rev.project_id = ?
           AND rev.status = 'published' AND rec.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM issuances i
             WHERE i.organization_id = rev.organization_id AND i.revision_id = rev.id
           )
         GROUP BY rev.id, rev.revision_number, rev.revision_label, rev.title,
                  rev.record_id, rec.record_number, rec.title, rev.created_at
         ORDER BY rev.created_at DESC, rev.id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, projectId)
      .all<{
        revision_id: string;
        revision_number: number;
        revision_label: string | null;
        title: string;
        record_id: string;
        record_number: string | null;
        record_title: string;
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
      createdAt: row.created_at,
      fileCount: row.file_count,
    }));
  }

  async activeRfis(
    organizationId: string,
    projectId: string,
  ): Promise<OverviewActiveRfi[]> {
    const result = await this.database
      .prepare(
        `SELECT id AS rfi_id, rfi_number, title, status, due_date, created_at
         FROM rfi_records
         WHERE organization_id = ? AND project_id = ?
           AND status IN ('issued', 'answered')
         ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
                  due_date ASC, created_at DESC, id ASC
         LIMIT ${String(ATTENTION_LIMIT)}`,
      )
      .bind(organizationId, projectId)
      .all<{
        rfi_id: string;
        rfi_number: string | null;
        title: string;
        status: Extract<RfiStatus, "issued" | "answered">;
        due_date: string | null;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      rfiId: row.rfi_id,
      rfiNumber: row.rfi_number,
      title: row.title,
      status: row.status,
      dueDate: row.due_date,
      createdAt: row.created_at,
    }));
  }

  /**
   * Project-scoped activity feed. Events are attributed to the project by
   * joining each object type back to the row it references, never by parsing
   * stored state JSON, so no raw prior/new state or metadata is exposed.
   */
  async recentActivity(
    organizationId: string,
    projectId: string,
  ): Promise<OverviewActivityEvent[]> {
    const result = await this.database
      .prepare(
        `SELECT e.id, e.action, e.object_type, e.object_id, e.actor_user_id,
                e.actor_type, u.display_name AS actor_display_name, e.created_at
         FROM activity_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.organization_id = ?1
           AND (
             (e.object_type = 'project' AND e.object_id = ?2)
             OR (e.object_type = 'record' AND e.object_id IN (
               SELECT id FROM records WHERE organization_id = ?1 AND project_id = ?2))
             OR (e.object_type = 'revision' AND e.object_id IN (
               SELECT id FROM record_revisions WHERE organization_id = ?1 AND project_id = ?2))
             OR (e.object_type = 'file' AND e.object_id IN (
               SELECT id FROM revision_files WHERE organization_id = ?1 AND project_id = ?2))
             OR (e.object_type = 'issuance' AND e.object_id IN (
               SELECT id FROM issuances WHERE organization_id = ?1 AND project_id = ?2))
             OR (e.object_type = 'rfi' AND e.object_id IN (
               SELECT id FROM rfi_records WHERE organization_id = ?1 AND project_id = ?2))
             OR (e.object_type = 'project_contact' AND e.object_id IN (
               SELECT id FROM project_contacts WHERE organization_id = ?1 AND project_id = ?2))
           )
         ORDER BY e.created_at DESC, e.id ASC
         LIMIT ${String(ACTIVITY_LIMIT)}`,
      )
      .bind(organizationId, projectId)
      .all<{
        id: string;
        action: string;
        object_type: string;
        object_id: string;
        actor_user_id: string | null;
        actor_type: "user" | "system";
        actor_display_name: string | null;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      action: row.action,
      objectType: row.object_type,
      objectId: row.object_id,
      actorUserId: row.actor_user_id,
      actorType: row.actor_type,
      actorDisplayName: row.actor_display_name,
      occurredAt: row.created_at,
    }));
  }
}
