import type { AppSession } from "../../auth/authentication-adapter";
import type { ProjectService } from "../projects/project-service";
import type {
  DashboardActiveRfi,
  DashboardDraftRevision,
  DashboardReadyToIssue,
  DashboardRecentFile,
  DashboardRecentIssuance,
  D1DashboardReadRepository,
} from "../../infrastructure/db/d1/dashboard-read-repository";

export interface DashboardSummary {
  accessibleProjectCount: number;
  draftRevisionCount: number;
  readyToIssueCount: number;
  activeRfiCount: number;
}

export interface DashboardReadModel {
  summary: DashboardSummary;
  draftRevisions: DashboardDraftRevision[];
  readyToIssue: DashboardReadyToIssue[];
  activeRfis: DashboardActiveRfi[];
  recentFiles: DashboardRecentFile[];
  recentIssuances: DashboardRecentIssuance[];
}

/**
 * Assembles the cross-project Work Dashboard read model. Accessible projects are
 * resolved through the same authorization as the project directory, so the
 * dashboard can never surface a project, record, revision, file, issuance, or
 * RFI the caller could not already reach.
 */
export class DashboardReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reads: D1DashboardReadRepository,
  ) {}

  async load(actor: AppSession): Promise<DashboardReadModel> {
    const accessibleProjects = await this.projects.list(actor);
    const projectIds = accessibleProjects.map((project) => project.id);

    const data = await this.reads.load(actor.organizationId, projectIds);

    return {
      summary: {
        accessibleProjectCount: projectIds.length,
        draftRevisionCount: data.draftRevisionCount,
        readyToIssueCount: data.readyToIssueCount,
        activeRfiCount: data.activeRfiCount,
      },
      draftRevisions: data.draftRevisions,
      readyToIssue: data.readyToIssue,
      activeRfis: data.activeRfis,
      recentFiles: data.recentFiles,
      recentIssuances: data.recentIssuances,
    };
  }
}
