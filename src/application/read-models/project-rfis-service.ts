import type { AppSession } from "../../auth/authentication-adapter";
import { currentIsoDate, rfiScheduleFlags } from "../../domain/rfis/schedule";
import type {
  D1ProjectRfisReadRepository,
  RfiListSummary,
} from "../../infrastructure/db/d1/project-rfis-read-repository";
import type { ProjectService } from "../projects/project-service";

export interface RfiListItemCapabilities {
  // Convenience inline edit is only offered for short draft fields while the
  // RFI's lifecycle still permits editing. Long-form fields are edited in the
  // workspace, so they are never inline-editable from the register.
  updateDraft: boolean;
}

export interface RfiListItem extends RfiListSummary {
  isOverdue: boolean;
  dueSoon: boolean;
  capabilities: RfiListItemCapabilities;
}

export interface ProjectRfisReadModel {
  project: {
    id: string;
    projectNumber: string;
    name: string;
    status: string;
  };
  rfis: RfiListItem[];
  capabilities: { createRfi: boolean };
}

/**
 * Assembles the project RFI register read model in one pass. Project access and
 * the RFI-management decision come from `ProjectService.resolveRfiAccess`, so an
 * inaccessible or cross-tenant project yields the generic not-found result and
 * no RFI data. Overdue/due-soon are computed server-side; per-row inline-edit
 * capability is authoritative (management right AND an editable draft status).
 */
export class ProjectRfisReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly reads: D1ProjectRfisReadRepository,
  ) {}

  async load(
    actor: AppSession,
    projectId: string,
  ): Promise<ProjectRfisReadModel> {
    const { project, canManage } = await this.projects.resolveRfiAccess(
      actor,
      projectId,
    );
    const summaries = await this.reads.list(actor.organizationId, project.id);
    const today = currentIsoDate();
    return {
      project: {
        id: project.id,
        projectNumber: project.projectNumber,
        name: project.name,
        status: project.status,
      },
      rfis: summaries.map((summary) => {
        const flags = rfiScheduleFlags(
          summary.status,
          summary.requestedResponseDate,
          today,
        );
        return {
          ...summary,
          isOverdue: flags.isOverdue,
          dueSoon: flags.dueSoon,
          capabilities: {
            updateDraft: canManage && summary.status === "draft",
          },
        };
      }),
      capabilities: { createRfi: canManage },
    };
  }
}
