import type { AppSession } from "../../auth/authentication-adapter";
import { RecordNotFoundError } from "../../domain/records/errors";
import { assertRecordIsActive } from "../../domain/records/validation";
import type { Record } from "../../domain/records/record";
import { RevisionNotFoundError } from "../../domain/revisions/errors";
import { publishStatus } from "../../domain/revisions/lifecycle";
import type {
  Revision,
  RevisionWriteInput,
} from "../../domain/revisions/revision";
import { D1RecordRevisionsRepository } from "../../infrastructure/db/d1/record-revisions-repository";
import { D1RecordsRepository } from "../../infrastructure/db/d1/records-repository";
import { ProjectService } from "../projects/project-service";

export interface RevisionMutationInput extends RevisionWriteInput {
  correlationId: string;
}

export class RevisionService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RecordsRepository,
    private readonly revisions: D1RecordRevisionsRepository,
  ) {}

  async list(
    actor: AppSession,
    projectId: string,
    recordId: string,
  ): Promise<Revision[]> {
    await this.projects.requireRevisionAccess(actor, projectId);
    const record = await this.findRecord(actor, projectId, recordId);
    return this.revisions.list(actor.organizationId, record.id);
  }

  async get(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
  ): Promise<Revision> {
    await this.projects.requireRevisionAccess(actor, projectId);
    const record = await this.findRecord(actor, projectId, recordId);
    return this.findRevision(actor, record.id, revisionId);
  }

  async createDraft(
    actor: AppSession,
    projectId: string,
    recordId: string,
    input: RevisionMutationInput,
  ): Promise<Revision> {
    await this.projects.requireRevisionManagement(
      actor,
      projectId,
      "revisions:create_draft",
    );
    const record = await this.findRecord(actor, projectId, recordId);
    assertRecordIsActive(record.status, "be edited");
    return this.revisions.createDraftWithActivity(record, actor.userId, input, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "revision",
      action: "revision.created",
      priorState: null,
      metadata: {},
      correlationId: input.correlationId,
    });
  }

  async publish(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
    correlationId: string,
  ): Promise<Revision> {
    await this.projects.requireRevisionManagement(
      actor,
      projectId,
      "revisions:publish",
    );
    const record = await this.findRecord(actor, projectId, recordId);
    assertRecordIsActive(record.status, "be edited");
    const revision = await this.findRevision(actor, record.id, revisionId);
    publishStatus(revision.status);
    return this.revisions.publishWithActivity(record, revision, {
      actorUserId: actor.userId,
      actorType: "user",
      correlationId,
    });
  }

  private async findRecord(
    actor: AppSession,
    projectId: string,
    recordId: string,
  ): Promise<Record> {
    const record = await this.records.findById(
      actor.organizationId,
      projectId,
      recordId,
    );
    if (!record) throw new RecordNotFoundError();
    return record;
  }

  private async findRevision(
    actor: AppSession,
    recordId: string,
    revisionId: string,
  ): Promise<Revision> {
    const revision = await this.revisions.findById(
      actor.organizationId,
      recordId,
      revisionId,
    );
    if (!revision) throw new RevisionNotFoundError();
    return revision;
  }
}
