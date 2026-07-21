import type { AppSession } from "../../auth/authentication-adapter";
import { RecordNotFoundError } from "../../domain/records/errors";
import type {
  D1RecordWorkspaceReadRepository,
  RecordWorkspaceData,
  RecordWorkspaceRevision,
} from "../../infrastructure/db/d1/record-workspace-read-repository";
import type { ProjectService } from "../projects/project-service";

export interface RecordWorkspaceReadModel extends RecordWorkspaceData {
  currentRevision: RecordWorkspaceRevision | null;
  capabilities: {
    updateRecord: boolean;
    archiveRecord: boolean;
    createRevision: boolean;
  };
}

export interface RecordWorkspaceRevisionCapabilities {
  uploadFile: boolean;
  publishRevision: boolean;
}

export class RecordWorkspaceReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reads: D1RecordWorkspaceReadRepository,
  ) {}

  async load(
    actor: AppSession,
    projectId: string,
    recordId: string,
  ): Promise<RecordWorkspaceReadModel> {
    const recordAccess = await this.projects.resolveRecordAccess(
      actor,
      projectId,
    );
    const revisionAccess = await this.projects.resolveRevisionAccess(
      actor,
      projectId,
    );
    const fileAccess = await this.projects.resolveFileAccess(actor, projectId);
    const data = await this.reads.find(
      actor.organizationId,
      recordAccess.project.id,
      recordId,
    );
    if (!data) throw new RecordNotFoundError();
    const active = data.record.status === "active";
    const revisions = data.revisions.map((revision) => ({
      ...revision,
      capabilities: {
        uploadFile:
          active && revision.status === "draft" && fileAccess.canManage,
        publishRevision:
          active && revision.status === "draft" && revisionAccess.canManage,
      } satisfies RecordWorkspaceRevisionCapabilities,
    }));
    return {
      ...data,
      revisions,
      currentRevision: revisions.find((revision) => revision.isCurrent) ?? null,
      capabilities: {
        updateRecord: active && recordAccess.canManage,
        archiveRecord: active && recordAccess.canManage,
        createRevision: active && revisionAccess.canManage,
      },
    };
  }
}
