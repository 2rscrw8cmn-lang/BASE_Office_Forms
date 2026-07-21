import type { AppSession } from "../../auth/authentication-adapter";
import type { ProjectService } from "../projects/project-service";
import type {
  RecordListSummary,
  D1ProjectRecordsReadRepository,
} from "../../infrastructure/db/d1/project-records-read-repository";

export interface RecordSummaryCapabilities {
  update: boolean;
  archive: boolean;
}

export interface RecordListSummaryItem extends RecordListSummary {
  capabilities: RecordSummaryCapabilities;
}

export interface RecordsListReadModel {
  records: RecordListSummaryItem[];
  capabilities: { createRecord: boolean };
}

/**
 * Assembles the project Records register read model. Project access and the
 * record-management decision come from `ProjectService.resolveRecordAccess`, so
 * an inaccessible or cross-tenant project yields the generic not-found result
 * and no record data is returned. Per-record capabilities are derived
 * server-side: management rights only unlock updates and archival on records
 * whose lifecycle still permits them (an archived record is read-only).
 */
export class ProjectRecordsReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reads: D1ProjectRecordsReadRepository,
  ) {}

  async load(
    actor: AppSession,
    projectId: string,
    includeArchived: boolean,
  ): Promise<RecordsListReadModel> {
    const { project, canManage } = await this.projects.resolveRecordAccess(
      actor,
      projectId,
    );
    const summaries = await this.reads.list(
      actor.organizationId,
      project.id,
      includeArchived,
    );
    return {
      records: summaries.map((summary) => ({
        ...summary,
        capabilities: {
          update: canManage && summary.status === "active",
          archive: canManage && summary.status === "active",
        },
      })),
      capabilities: { createRecord: canManage },
    };
  }
}
