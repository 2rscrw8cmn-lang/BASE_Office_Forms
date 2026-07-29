import type { AppSession } from "../../auth/authentication-adapter";
import {
  RfiAlreadyIssuedError,
  RfiNotFoundError,
  RfiReadyValidationError,
  RfiResponsibleContactError,
} from "../../domain/rfis/errors";
import type {
  RfiIssueRequest,
  RfiOfficialIssueResult,
} from "../../domain/rfis/official-issue";
import {
  assertCanUpdateDraft,
  closeStatus,
  markReadyStatus,
  reopenStatus,
  respondStatus,
  returnForClarificationStatus,
  returnToDraftStatus,
  voidStatus,
} from "../../domain/rfis/lifecycle";
import type {
  Rfi,
  RfiAttachment,
  RfiDetail,
  RfiResponse,
  RfiWriteInput,
} from "../../domain/rfis/rfi";
import { D1RfiAttachmentsRepository } from "../../infrastructure/db/d1/rfi-attachments-repository";
import { D1ProjectContactsRepository } from "../../infrastructure/db/d1/project-contacts-repository";
import { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";
import {
  D1RfiResponsesRepository,
  type RfiResponseWriteInput,
} from "../../infrastructure/db/d1/rfi-responses-repository";
import { ProjectService } from "../projects/project-service";
import { RfiTemplateBindingService } from "./rfi-template-binding-service";
import { RfiOfficialIssueService } from "./rfi-official-issue-service";

export interface RfiMutationInput extends RfiWriteInput {
  correlationId: string;
}

export interface RfiResponseInput extends Omit<
  RfiResponseWriteInput,
  "recordedByUserId"
> {
  correlationId: string;
}

// The draft fields whose changes are worth recording on the activity timeline.
const TRACKED_FIELDS: readonly (keyof RfiWriteInput)[] = [
  "subject",
  "question",
  "contractorSuggestion",
  "drawingReferences",
  "specificationReferences",
  "responsiblePartyId",
  "submittedBy",
  "requestedResponseDate",
  "costImpact",
  "scheduleImpact",
];

function changedFields(current: Rfi, next: RfiWriteInput): string[] {
  return TRACKED_FIELDS.filter(
    (field) => (current[field] ?? null) !== (next[field] ?? null),
  );
}

export class RfiService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RfiRecordsRepository,
    private readonly responses: D1RfiResponsesRepository,
    private readonly attachments: D1RfiAttachmentsRepository,
    private readonly templateBinding: RfiTemplateBindingService,
    private readonly contacts: D1ProjectContactsRepository,
    private readonly officialIssuer: RfiOfficialIssueService,
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
    const [responses, attachments] = await Promise.all([
      this.responses.list(actor.organizationId, rfi.id),
      this.attachments.list(actor.organizationId, rfi.id),
    ]);
    return { ...rfi, responses, attachments };
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
    const template = await this.templateBinding.resolveDefault(
      actor.organizationId,
      actor.userId,
      input.correlationId,
    );
    await this.requireResponsibleContact(
      actor,
      projectId,
      input.responsiblePartyId,
    );
    return this.records.createWithActivity(
      actor.organizationId,
      projectId,
      {
        ...toWriteInput(input),
        templateVersionId: template.templateVersionId,
        createdBy: actor.userId,
      },
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.created",
        priorState: null,
        metadata: { templateVersionId: template.templateVersionId },
        correlationId: input.correlationId,
      },
    );
  }

  async updateDraft(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    expectedLockVersion: number,
    input: RfiMutationInput,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:update_draft",
    );
    const rfi = await this.find(actor, projectId, rfiId);
    assertCanUpdateDraft(rfi.status);
    await this.requireResponsibleContact(
      actor,
      projectId,
      input.responsiblePartyId,
    );
    return this.records.updateDraftWithActivity(
      rfi,
      toWriteInput(input),
      expectedLockVersion,
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.updated",
        metadata: { changedFields: changedFields(rfi, input) },
        correlationId: input.correlationId,
      },
    );
  }

  async markReady(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:mark_ready",
    );
    const rfi = await this.find(actor, projectId, rfiId);
    const toStatus = markReadyStatus(rfi.status);
    await this.validateReadyToIssue(actor, projectId, rfi);
    return this.records.transitionWithActivity(
      rfi,
      toStatus,
      "rfi.marked_ready",
      {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.marked_ready",
        metadata: {},
        correlationId,
      },
    );
  }

  async returnToDraft(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:return_to_draft",
    );
    const rfi = await this.find(actor, projectId, rfiId);
    returnToDraftStatus(rfi.status);
    if (
      rfi.rfiNumber ||
      rfi.issuedNumberSequence !== null ||
      rfi.issuedAt ||
      rfi.issuanceReconciliationState !== "not_issued"
    ) {
      throw new RfiAlreadyIssuedError();
    }
    return this.records.returnToDraftWithActivity(rfi, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "rfi",
      action: "rfi.returned_to_draft",
      metadata: {},
      correlationId,
    });
  }

  async issue(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    idempotencyKey: string,
    input: RfiIssueRequest,
    correlationId: string,
  ): Promise<RfiOfficialIssueResult> {
    return this.officialIssuer.issue(
      actor,
      projectId,
      rfiId,
      idempotencyKey,
      input,
      correlationId,
    );
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
        // `respondedBy` is contact-facing attribution and may be free text or
        // intentionally blank. The authenticated actor is recorded separately
        // in the detail row's user foreign key.
        respondedBy: input.respondedBy,
        recordedByUserId: actor.userId,
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

  async returnForClarification(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    return this.transition(
      actor,
      projectId,
      rfiId,
      "rfis:return_for_clarification",
      returnForClarificationStatus,
      "rfi.returned_for_clarification",
      correlationId,
    );
  }

  async close(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    return this.transition(
      actor,
      projectId,
      rfiId,
      "rfis:close",
      closeStatus,
      "rfi.closed",
      correlationId,
    );
  }

  async reopen(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    return this.transition(
      actor,
      projectId,
      rfiId,
      "rfis:reopen",
      reopenStatus,
      "rfi.reopened",
      correlationId,
    );
  }

  async void(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    correlationId: string,
  ): Promise<Rfi> {
    return this.transition(
      actor,
      projectId,
      rfiId,
      "rfis:void",
      voidStatus,
      "rfi.voided",
      correlationId,
    );
  }

  private async transition(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    capability: Parameters<ProjectService["requireRfiManagement"]>[2],
    resolveStatus: (status: Rfi["status"]) => Rfi["status"],
    action: string,
    correlationId: string,
  ): Promise<Rfi> {
    await this.projects.requireRfiManagement(actor, projectId, capability);
    const rfi = await this.find(actor, projectId, rfiId);
    const toStatus = resolveStatus(rfi.status);
    return this.records.transitionWithActivity(rfi, toStatus, action, {
      actorUserId: actor.userId,
      actorType: "user",
      objectType: "rfi",
      action,
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

  private async requireResponsibleContact(
    actor: AppSession,
    projectId: string,
    contactId: string | null,
  ): Promise<void> {
    if (!contactId) return;
    const contact = await this.contacts.findById(
      actor.organizationId,
      projectId,
      contactId,
    );
    if (!contact || contact.archivedAt) throw new RfiResponsibleContactError();
  }

  private async validateReadyToIssue(
    actor: AppSession,
    projectId: string,
    rfi: Rfi,
  ): Promise<void> {
    if (!rfi.subject.trim() || !rfi.question.trim()) {
      throw new RfiReadyValidationError(
        "The RFI subject and question must be complete before it is marked ready.",
      );
    }
    if (!rfi.responsiblePartyId) {
      throw new RfiReadyValidationError(
        "A responsible project contact is required before the RFI is marked ready.",
      );
    }
    const contact = await this.contacts.findById(
      actor.organizationId,
      projectId,
      rfi.responsiblePartyId,
    );
    if (!contact || contact.archivedAt) {
      throw new RfiReadyValidationError(
        "Responsible party must be an active contact for this project.",
      );
    }
    const template = await this.templateBinding.describe(
      actor.organizationId,
      rfi.templateVersionId,
    );
    if (
      !template ||
      template.templateVersionId !== rfi.templateVersionId ||
      template.status !== "published"
    ) {
      throw new RfiReadyValidationError(
        "The exact published RFI template version is unavailable.",
      );
    }
    try {
      requireValidRendererDefinition(template.definition);
    } catch {
      throw new RfiReadyValidationError(
        "The exact published RFI template version is not usable for official issue.",
      );
    }
    if (
      rfi.rfiNumber ||
      rfi.issuedNumberSequence !== null ||
      rfi.issuedAt ||
      rfi.issuanceReconciliationState !== "not_issued"
    ) {
      throw new RfiReadyValidationError(
        "An RFI with consumed official issue state cannot be marked ready.",
      );
    }
  }
}

export type { RfiAttachment };

function toWriteInput(input: RfiWriteInput): RfiWriteInput {
  return {
    subject: input.subject,
    question: input.question,
    contractorSuggestion: input.contractorSuggestion,
    drawingReferences: input.drawingReferences,
    specificationReferences: input.specificationReferences,
    responsiblePartyId: input.responsiblePartyId,
    submittedBy: input.submittedBy,
    requestedResponseDate: input.requestedResponseDate,
    costImpact: input.costImpact,
    scheduleImpact: input.scheduleImpact,
  };
}
