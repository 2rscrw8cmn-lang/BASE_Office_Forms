import type { AppSession } from "../../auth/authentication-adapter";
import type { ProjectContact } from "../../domain/projects/project";
import {
  D1ProjectContactsRepository,
  type ProjectContactWriteInput,
} from "../../infrastructure/db/d1/project-contacts-repository";
import { ProjectNotFoundError, ProjectService } from "./project-service";

export class ProjectContactNotFoundError extends Error {
  constructor() {
    super("The requested project contact was not found.");
  }
}

export interface ProjectContactMutationInput extends ProjectContactWriteInput {
  correlationId: string;
}

export class ProjectContactService {
  constructor(
    private readonly projects: ProjectService,
    private readonly contacts: D1ProjectContactsRepository,
  ) {}

  async list(actor: AppSession, projectId: string): Promise<ProjectContact[]> {
    await this.projects.requireContactAccess(actor, projectId);
    return this.contacts.list(actor.organizationId, projectId);
  }

  async create(
    actor: AppSession,
    projectId: string,
    input: ProjectContactMutationInput,
  ): Promise<ProjectContact> {
    await this.projects.requireContactManagement(actor, projectId);
    return this.contacts.createWithActivity(
      actor.organizationId,
      projectId,
      input,
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "project_contact",
        action: "project_contact.created",
        priorState: null,
        correlationId: input.correlationId,
      },
    );
  }

  async update(
    actor: AppSession,
    projectId: string,
    contactId: string,
    input: ProjectContactMutationInput,
  ): Promise<ProjectContact> {
    await this.projects.requireContactManagement(actor, projectId);
    const contact = await this.contacts.findById(
      actor.organizationId,
      projectId,
      contactId,
    );
    if (!contact) throw new ProjectContactNotFoundError();
    return this.contacts.updateWithActivity(contact, input, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "project_contact",
      action: "project_contact.updated",
      metadata: {},
      correlationId: input.correlationId,
    });
  }
}

export { ProjectNotFoundError };
