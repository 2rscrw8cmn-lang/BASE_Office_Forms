import type { AppSession } from "../../auth/authentication-adapter";
import { RevisionNotFoundError } from "../../domain/revisions/errors";
import type { RecordWorkspaceReadModelService } from "./record-workspace-service";

export class RevisionWorkspaceReadModelService {
  constructor(private readonly records: RecordWorkspaceReadModelService) {}

  async load(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
  ) {
    const workspace = await this.records.load(actor, projectId, recordId);
    const revision = workspace.revisions.find((item) => item.id === revisionId);
    if (!revision) throw new RevisionNotFoundError();
    return {
      record: workspace.record,
      revision,
      currentRevisionId: workspace.currentRevision?.id ?? null,
    };
  }
}
