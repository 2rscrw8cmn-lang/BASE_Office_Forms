import type { AppSession } from "../../auth/authentication-adapter";
import { RfiNotFoundError } from "../../domain/rfis/errors";
import {
  assertCanUpdateDraft,
  closeStatus,
  issueStatus,
  reopenStatus,
  respondStatus,
} from "../../domain/rfis/lifecycle";
import type {
  Rfi,
  RfiDetail,
  RfiResponse,
  RfiWriteInput,
} from "../../domain/rfis/rfi";
import { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import {
  D1RfiResponsesRepository,
  type RfiResponseWriteInput,
} from "../../infrastructure/db/d1/rfi-responses-repository";
import { ProjectService } from "../projects/project-service";

export interface RfiMutationInput extends RfiWriteInput {
  correlationId: string;
}

export interface RfiResponseInput extends RfiResponseWriteInput {
  correlationId: string;
}

export class RfiService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RfiRecordsRepository,
    private readonly responses: D1RfiResponsesRepository,
  ) {}

  async list(actor: AppSession, projectId: string): Promise<Rfi[]> {
    await this.projects.requireRfiAccess(actor, projectId);
    return this.records.list(actor.organizationId, projectId);
  }

  async get(
    actor: AppSession,
    projectId: string,
    rfiId: string,
  ): Promise<RfiDetail> {
    await this.projects.requireRfiAccess(actor, projectId);
    const rfi = await this.find(actor, projectId, rfiId);
    return {
      ...rfi,
      responses: await this.responses.list(actor.organizationId, rfi.id),
    };
  }

  async createDraft(
    actor: AppSession,
    projectId: string,
    input: RfiMutationInput,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:create_draft",
    );
    return this.records.createWithActivity(
      actor.organizationId,
      projectId,
      input,
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.created",
        priorState: null,
        metadata: {},
        correlationId: input.correlationId,
      },
    );
  }

  async updateDraft(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    input: RfiMutationInput,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:update_draft",
    );
    const rfi = await this.find(actor, projectId, rfiId);
    assertCanUpdateDraft(rfi.status);
    return this.records.updateDraftWithActivity(rfi, input);
  }

  async issue(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(actor, projectId, "rfis:issue");
    const rfi = await this.find(actor, projectId, rfiId);
    issueStatus(rfi.status);
    return this.records.issueWithActivity(rfi, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "rfi",
      action: "rfi.issued",
      metadata: {},
      correlationId,
    });
  }

  async respond(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    input: RfiResponseInput,
  ): Promise<{ rfi: Rfi; response: RfiResponse }> {
    await this.projects.requireRfiManagement(actor, projectId, "rfis:respond");
    const rfi = await this.find(actor, projectId, rfiId);
    respondStatus(rfi.status);
    return this.records.respondWithActivity(
      rfi,
      {
        response: input.response,
        respondedBy: input.respondedBy ?? actor.userId,
      },
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.responded",
        metadata: {},
        correlationId: input.correlationId,
      },
    );
  }

  async close(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(actor, projectId, "rfis:close");
    const rfi = await this.find(actor, projectId, rfiId);
    closeStatus(rfi.status);
    return this.records.transitionWithActivity(rfi, "closed", {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "rfi",
      action: "rfi.closed",
      metadata: {},
      correlationId,
    });
  }

  async reopen(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(actor, projectId, "rfis:reopen");
    const rfi = await this.find(actor, projectId, rfiId);
    reopenStatus(rfi.status);
    return this.records.transitionWithActivity(rfi, "answered", {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "rfi",
      action: "rfi.reopened",
      metadata: {},
      correlationId,
    });
  }

  private async find(
    actor: AppSession,
    projectId: string,
    rfiId: string,
  ): Promise<Rfi> {
    const rfi = await this.records.findById(
      actor.organizationId,
      projectId,
      rfiId,
    );
    if (!rfi) throw new RfiNotFoundError();
    return rfi;
  }
}
