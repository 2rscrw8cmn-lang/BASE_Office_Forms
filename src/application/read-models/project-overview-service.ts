import type { AppSession } from "../../auth/authentication-adapter";
import type { Project } from "../../domain/projects/project";
import type { ProjectService } from "../projects/project-service";
import type {
  DashboardActiveRfi,
  DashboardDraftRevision,
  DashboardReadyToIssue,
} from "../../infrastructure/db/d1/dashboard-read-repository";
import type {
  OverviewActivityEvent,
  ProjectOverviewCounts,
  D1ProjectOverviewReadRepository,
} from "../../infrastructure/db/d1/project-overview-read-repository";

export interface ProjectOverviewReadModel {
  project: Project;
  counts: ProjectOverviewCounts;
  attention: {
    draftRevisions: DashboardDraftRevision[];
    readyToIssue: DashboardReadyToIssue[];
    activeRfis: DashboardActiveRfi[];
  };
  recentActivity: OverviewActivityEvent[];
}

/**
 * Assembles the single-project Overview read model. Project access is resolved
 * through the same authorization as project detail (`ProjectService.get`), so an
 * inaccessible or cross-tenant project yields the same generic not-found result
 * and no project data is returned.
 */
export class ProjectOverviewReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reads: D1ProjectOverviewReadRepository,
  ) {}

  async load(
    actor: AppSession,
    projectId: string,
  ): Promise<ProjectOverviewReadModel> {
    const project = await this.projects.get(actor, projectId);
    const organizationId = actor.organizationId;

    const [counts, draftRevisions, readyToIssue, activeRfis, recentActivity] =
      await Promise.all([
        this.reads.counts(organizationId, project.id),
        this.reads.draftRevisions(organizationId, project.id),
        this.reads.readyToIssue(organizationId, project.id),
        this.reads.activeRfis(organizationId, project.id),
        this.reads.recentActivity(organizationId, project.id),
      ]);

    const projectFields = {
      projectId: project.id,
      projectNumber: project.projectNumber,
      projectName: project.name,
    };

    return {
      project,
      counts,
      attention: {
        draftRevisions: draftRevisions.map((item) => ({
          ...item,
          ...projectFields,
        })),
        readyToIssue: readyToIssue.map((item) => ({
          ...item,
          ...projectFields,
        })),
        activeRfis: activeRfis.map((item) => ({ ...item, ...projectFields })),
      },
      recentActivity,
    };
  }
}
