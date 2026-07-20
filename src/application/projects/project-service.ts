import type { AppSession } from "../../auth/authentication-adapter";
import {
  hasOrganizationWideProjectManagement,
  hasOrganizationWideProjectRead,
  requireProjectCreation,
} from "../../domain/projects/authorization";
import { requireRfiManagement } from "../../domain/rfis/authorization";
import type { RfiCapability } from "../../domain/rfis/errors";
import { requireRecordManagement } from "../../domain/records/authorization";
import type { RecordCapability } from "../../domain/records/errors";
import { requireRevisionManagement } from "../../domain/revisions/authorization";
import type { RevisionCapability } from "../../domain/revisions/errors";
import { requireFileManagement } from "../../domain/files/authorization";
import type { FileCapability } from "../../domain/files/errors";
import { requireIssuanceManagement } from "../../domain/issuances/authorization";
import type { IssuanceCapability } from "../../domain/issuances/errors";
import type { Project, ProjectStatus } from "../../domain/projects/project";
import { D1ProjectMembershipsRepository } from "../../infrastructure/db/d1/project-memberships-repository";
import {
  D1ProjectsRepository,
  type ProjectWriteInput,
} from "../../infrastructure/db/d1/projects-repository";

export class ProjectNotFoundError extends Error {
  constructor() {
    super("The requested project was not found.");
  }
}

export interface CreateProjectInput extends ProjectWriteInput {
  correlationId: string;
}

export interface UpdateProjectInput extends ProjectWriteInput {
  correlationId: string;
}

export class ProjectService {
  constructor(
    private readonly projects: D1ProjectsRepository,
    private readonly memberships: D1ProjectMembershipsRepository,
  ) {}

  async list(actor: AppSession): Promise<Project[]> {
    if (hasOrganizationWideProjectRead(actor)) {
      return this.projects.list(actor.organizationId);
    }
    const projectIds = await this.memberships.listActiveProjectIds(
      actor.organizationId,
      actor.userId,
    );
    return this.projects.list(actor.organizationId, projectIds);
  }

  async get(actor: AppSession, projectId: string): Promise<Project> {
    const project = await this.projects.findById(
      actor.organizationId,
      projectId,
    );
    if (!project || !(await this.canRead(actor, projectId))) {
      throw new ProjectNotFoundError();
    }
    return project;
  }

  async create(actor: AppSession, input: CreateProjectInput): Promise<Project> {
    requireProjectCreation(actor);
    const project = await this.projects.createWithActivity(
      actor.organizationId,
      input,
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "project",
        action: "project.created",
        priorState: null,
        correlationId: input.correlationId,
      },
    );
    return project;
  }

  async update(
    actor: AppSession,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    if (!(await this.canManage(actor, project.id))) {
      throw new ProjectNotFoundError();
    }
    return this.projects.updateWithActivity(project, input, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "project",
      action: "project.updated",
      metadata: {},
      correlationId: input.correlationId,
    });
  }

  async requireContactAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireContactManagement(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    if (
      !(await this.canManage(actor, projectId)) &&
      actor.membershipRole !== "document_control_admin"
    ) {
      throw new ProjectNotFoundError();
    }
    return project;
  }

  async requireRfiAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireRfiManagement(
    actor: AppSession,
    projectId: string,
    capability: RfiCapability,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    const isAssignedProjectManager =
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ));
    requireRfiManagement(actor, capability, isAssignedProjectManager);
    return project;
  }

  async requireRecordAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireRecordManagement(
    actor: AppSession,
    projectId: string,
    capability: RecordCapability,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    const isAssignedProjectManager =
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ));
    requireRecordManagement(actor, capability, isAssignedProjectManager);
    return project;
  }

  async requireRevisionAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireRevisionManagement(
    actor: AppSession,
    projectId: string,
    capability: RevisionCapability,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    const isAssignedProjectManager =
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ));
    requireRevisionManagement(actor, capability, isAssignedProjectManager);
    return project;
  }

  async requireFileAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireFileManagement(
    actor: AppSession,
    projectId: string,
    capability: FileCapability,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    const isAssignedProjectManager =
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ));
    requireFileManagement(actor, capability, isAssignedProjectManager);
    return project;
  }

  async requireIssuanceAccess(
    actor: AppSession,
    projectId: string,
  ): Promise<Project> {
    return this.get(actor, projectId);
  }

  async requireIssuanceManagement(
    actor: AppSession,
    projectId: string,
    capability: IssuanceCapability,
  ): Promise<Project> {
    const project = await this.get(actor, projectId);
    const isAssignedProjectManager =
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ));
    requireIssuanceManagement(actor, capability, isAssignedProjectManager);
    return project;
  }

  private async canRead(
    actor: AppSession,
    projectId: string,
  ): Promise<boolean> {
    return (
      hasOrganizationWideProjectRead(actor) ||
      this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      )
    );
  }

  private async canManage(
    actor: AppSession,
    projectId: string,
  ): Promise<boolean> {
    if (hasOrganizationWideProjectManagement(actor)) return true;
    return (
      actor.membershipRole === "project_manager" &&
      (await this.memberships.isActiveMember(
        actor.organizationId,
        projectId,
        actor.userId,
      ))
    );
  }
}

export function isProjectStatus(value: string): value is ProjectStatus {
  return ["planning", "active", "closeout", "suspended", "archived"].includes(
    value,
  );
}
