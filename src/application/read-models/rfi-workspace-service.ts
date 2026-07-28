import type { AppSession } from "../../auth/authentication-adapter";
import { RfiNotFoundError } from "../../domain/rfis/errors";
import {
  canAttach,
  canClose,
  canIssue,
  canMarkReady,
  canReopen,
  canRespond,
  canReturnForClarification,
  canReturnToDraft,
  canUpdateDraft,
  canVoid,
} from "../../domain/rfis/lifecycle";
import type {
  RfiAttachment,
  RfiAttachmentRole,
  RfiStatus,
} from "../../domain/rfis/rfi";
import { currentIsoDate, rfiScheduleFlags } from "../../domain/rfis/schedule";
import type { D1RfiAttachmentsRepository } from "../../infrastructure/db/d1/rfi-attachments-repository";
import type { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import type { D1RfiOfficialIssueRepository } from "../../infrastructure/db/d1/rfi-official-issue-repository";
import type { D1RfiResponsesRepository } from "../../infrastructure/db/d1/rfi-responses-repository";
import type {
  D1RfiWorkspaceReadRepository,
  RfiActivitySummary,
} from "../../infrastructure/db/d1/rfi-workspace-read-repository";
import type { ProjectService } from "../projects/project-service";
import type { RfiTemplateBindingService } from "../rfis/rfi-template-binding-service";
import type { RfiOfficialIssueSummary } from "../../domain/rfis/official-issue";

export interface RfiWorkspaceCapabilities {
  updateDraft: boolean;
  uploadAttachment: boolean;
  markReady: boolean;
  returnToDraft: boolean;
  issue: boolean;
  recordResponse: boolean;
  returnForClarification: boolean;
  close: boolean;
  reopen: boolean;
  void: boolean;
}

interface WorkspaceAttachment {
  id: string;
  role: RfiAttachmentRole;
  revisionId: string;
  revisionLabel: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface RfiWorkspaceReadModel {
  rfi: {
    id: string;
    rfiNumber: string | null;
    legacyReference: string | null;
    status: RfiStatus;
    subject: string;
    question: string;
    contractorSuggestion: string | null;
    drawingReferences: string | null;
    specificationReferences: string | null;
    responsibleParty: string | null;
    responsiblePartyId: string | null;
    responsiblePartyLegacyText: string | null;
    submittedBy: string | null;
    requestedResponseDate: string | null;
    costImpact: string | null;
    scheduleImpact: string | null;
    issuedAt: string | null;
    responseReceivedAt: string | null;
    closedAt: string | null;
    lockVersion: number;
    createdAt: string;
    updatedAt: string;
    isOverdue: boolean;
    dueSoon: boolean;
    issuanceReconciliationState: "not_issued" | "legacy_incomplete";
  };
  currentVersion: {
    id: string;
    label: string;
    status: "draft" | "published";
  };
  responsibleContacts: {
    id: string;
    name: string;
    companyName: string | null;
  }[];
  // Project-populated context comes from the authoritative project/organization
  // records — never duplicated as manually typed RFI fields.
  project: {
    id: string;
    projectNumber: string;
    name: string;
    status: string;
    timezone: string;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      region: string | null;
      postalCode: string | null;
      country: string | null;
    };
  };
  organization: { id: string; name: string | null };
  template: {
    templateVersionId: string;
    key: string;
    name: string;
    versionNumber: number;
    definition: Record<string, unknown>;
  } | null;
  attachments: {
    supporting_attachment: WorkspaceAttachment[];
    reference_drawing: WorkspaceAttachment[];
  };
  officialIssue: RfiOfficialIssueSummary | null;
  responses: {
    id: string;
    response: string;
    respondedBy: string | null;
    createdAt: string;
  }[];
  activity: RfiActivitySummary[];
  capabilities: RfiWorkspaceCapabilities;
}

function toWorkspaceAttachment(
  attachment: RfiAttachment,
  revisionLabel: "Current Draft" | "Original Issue",
): WorkspaceAttachment {
  return {
    id: attachment.id,
    role: attachment.role,
    revisionId: attachment.revisionId,
    revisionLabel,
    originalFilename: attachment.originalFilename,
    mediaType: attachment.mediaType,
    byteSize: attachment.byteSize,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt,
  };
}

/**
 * Assembles the RFI workspace read model in one server pass so the browser never
 * fans out per-section requests. The table and this detail read the same
 * authoritative RFI row. Capabilities are server-derived from lifecycle
 * eligibility and management right; only implemented, authoritative capabilities
 * are returned. Transactional endpoints remain the write authority.
 */
export class RfiWorkspaceReadModelService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RfiRecordsRepository,
    private readonly attachments: D1RfiAttachmentsRepository,
    private readonly responses: D1RfiResponsesRepository,
    private readonly reads: D1RfiWorkspaceReadRepository,
    private readonly templateBinding: RfiTemplateBindingService,
    private readonly officialIssues: D1RfiOfficialIssueRepository,
  ) {}

  async load(
    actor: AppSession,
    projectId: string,
    rfiId: string,
  ): Promise<RfiWorkspaceReadModel> {
    const { project, canManage } = await this.projects.resolveRfiAccess(
      actor,
      projectId,
    );
    const rfi = await this.records.findById(
      actor.organizationId,
      project.id,
      rfiId,
    );
    if (!rfi) throw new RfiNotFoundError();

    const [
      attachments,
      responses,
      activity,
      organizationName,
      template,
      responsibleContacts,
      officialIssue,
    ] = await Promise.all([
      this.attachments.list(actor.organizationId, rfi.id),
      this.responses.list(actor.organizationId, rfi.id),
      this.reads.listActivity(actor.organizationId, rfi.id),
      this.reads.findOrganizationName(actor.organizationId),
      this.templateBinding.describe(
        actor.organizationId,
        rfi.templateVersionId,
      ),
      this.reads.listResponsibleContacts(actor.organizationId, project.id),
      this.officialIssues.findOfficialIssueSummary(
        actor.organizationId,
        project.id,
        rfi.id,
      ),
    ]);

    const flags = rfiScheduleFlags(
      rfi.status,
      rfi.requestedResponseDate,
      currentIsoDate(),
    );

    return {
      rfi: {
        id: rfi.id,
        rfiNumber: rfi.rfiNumber,
        legacyReference: rfi.legacyReference,
        status: rfi.status,
        subject: rfi.subject,
        question: rfi.question,
        contractorSuggestion: rfi.contractorSuggestion,
        drawingReferences: rfi.drawingReferences,
        specificationReferences: rfi.specificationReferences,
        responsibleParty: rfi.responsibleParty,
        responsiblePartyId: rfi.responsiblePartyId,
        responsiblePartyLegacyText: rfi.responsiblePartyLegacyText,
        submittedBy: rfi.submittedBy,
        requestedResponseDate: rfi.requestedResponseDate,
        costImpact: rfi.costImpact,
        scheduleImpact: rfi.scheduleImpact,
        issuedAt: rfi.issuedAt,
        responseReceivedAt: rfi.responseReceivedAt,
        closedAt: rfi.closedAt,
        lockVersion: rfi.lockVersion,
        createdAt: rfi.createdAt,
        updatedAt: rfi.updatedAt,
        isOverdue: flags.isOverdue,
        dueSoon: flags.dueSoon,
        issuanceReconciliationState: rfi.issuanceReconciliationState,
      },
      currentVersion: {
        id: rfi.draftRevisionId,
        label:
          rfi.status === "draft" || rfi.status === "ready_to_issue"
            ? "Current Draft"
            : "Original Issue",
        status:
          rfi.status === "draft" || rfi.status === "ready_to_issue"
            ? "draft"
            : "published",
      },
      responsibleContacts,
      project: {
        id: project.id,
        projectNumber: project.projectNumber,
        name: project.name,
        status: project.status,
        timezone: project.timezone,
        address: { ...project.address },
      },
      organization: { id: actor.organizationId, name: organizationName },
      template: template
        ? {
            templateVersionId: template.templateVersionId,
            key: template.key,
            name: template.name,
            versionNumber: template.versionNumber,
            definition: template.definition,
          }
        : null,
      attachments: {
        supporting_attachment: attachments
          .filter((item) => item.role === "supporting_attachment")
          .map((item) =>
            toWorkspaceAttachment(
              item,
              rfi.status === "draft" || rfi.status === "ready_to_issue"
                ? "Current Draft"
                : "Original Issue",
            ),
          ),
        reference_drawing: attachments
          .filter((item) => item.role === "reference_drawing")
          .map((item) =>
            toWorkspaceAttachment(
              item,
              rfi.status === "draft" || rfi.status === "ready_to_issue"
                ? "Current Draft"
                : "Original Issue",
            ),
          ),
      },
      officialIssue,
      responses: responses.map((response) => ({
        id: response.id,
        response: response.response,
        respondedBy: response.respondedBy,
        createdAt: response.createdAt,
      })),
      activity,
      capabilities: {
        updateDraft: canManage && canUpdateDraft(rfi.status),
        uploadAttachment: canManage && canAttach(rfi.status),
        markReady: canManage && canMarkReady(rfi.status),
        returnToDraft: canManage && canReturnToDraft(rfi.status),
        issue: canManage && canIssue(rfi.status),
        recordResponse: canManage && canRespond(rfi.status),
        returnForClarification:
          canManage && canReturnForClarification(rfi.status),
        close: canManage && canClose(rfi.status),
        reopen: canManage && canReopen(rfi.status),
        void: canManage && canVoid(rfi.status),
      },
    };
  }
}
