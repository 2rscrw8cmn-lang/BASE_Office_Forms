import type { AppSession } from "../../auth/authentication-adapter";
import { RecordNotFoundError } from "../../domain/records/errors";
import type {
  Record,
  RecordCreateInput,
  RecordUpdateInput,
} from "../../domain/records/record";
import {
  assertRecordIsActive,
  validateRecordMetadata,
} from "../../domain/records/validation";
import { D1RecordsRepository } from "../../infrastructure/db/d1/records-repository";
import { ProjectService } from "../projects/project-service";

export interface RecordMutationInput extends RecordCreateInput {
  correlationId: string;
}

export interface RecordUpdateMutationInput extends RecordUpdateInput {
  correlationId: string;
}

export class RecordService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RecordsRepository,
  ) {}

  async list(
    actor: AppSession,
    projectId: string,
    includeArchived = false,
  ): Promise<Record[]> {
    await this.projects.requireRecordAccess(actor, projectId);
    return this.records.list(actor.organizationId, projectId, includeArchived);
  }

  async get(
    actor: AppSession,
    projectId: string,
    recordId: string,
  ): Promise<Record> {
    await this.projects.requireRecordAccess(actor, projectId);
    return this.find(actor, projectId, recordId);
  }

  async create(
    actor: AppSession,
    projectId: string,
    input: RecordMutationInput,
  ): Promise<Record> {
    await this.projects.requireRecordManagement(
      actor,
      projectId,
      "records:create",
    );
    const metadata = validateRecordMetadata(input);
    return this.records.createWithActivity(
      actor.organizationId,
      projectId,
      actor.userId,
      metadata,
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "record",
        action: "record.created",
        priorState: null,
        metadata: {},
        correlationId: input.correlationId,
      },
    );
  }

  async update(
    actor: AppSession,
    projectId: string,
    recordId: string,
    input: RecordUpdateMutationInput,
  ): Promise<Record> {
    await this.projects.requireRecordManagement(
      actor,
      projectId,
      "records:update",
    );
    const record = await this.find(actor, projectId, recordId);
    assertRecordIsActive(record.status, "be edited");
    const metadata = validateRecordMetadata(
      {
        ...input,
        recordType: record.recordType,
      },
      { existingDiscipline: record.discipline },
    );
    const update: RecordUpdateInput = {
      title: metadata.title,
      description: metadata.description,
      discipline: metadata.discipline,
      source: metadata.source,
    };
    return this.records.updateWithActivity(record, update, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "record",
      action: "record.updated",
      metadata: {},
      correlationId: input.correlationId,
    });
  }

  async archive(
    actor: AppSession,
    projectId: string,
    recordId: string,
    correlationId: string,
  ): Promise<Record> {
    await this.projects.requireRecordManagement(
      actor,
      projectId,
      "records:archive",
    );
    const record = await this.find(actor, projectId, recordId);
    assertRecordIsActive(record.status, "be archived");
    return this.records.archiveWithActivity(record, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "record",
      action: "record.archived",
      metadata: {},
      correlationId,
    });
  }

  private async find(
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
}
