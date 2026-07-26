import type { AppSession } from "../../auth/authentication-adapter";
import {
  RfiAlreadyIssuedError,
  RfiIssueCompensationError,
  RfiIssueIdempotencyConflictError,
  RfiIssuePersistenceError,
  RfiIssueRenderError,
  RfiIssueRequestError,
  RfiIssueStorageError,
  RfiIssueValidationError,
  RfiNotFoundError,
} from "../../domain/rfis/errors";
import { issueStatus } from "../../domain/rfis/lifecycle";
import {
  canonicalRfiIssueRequest,
  type FrozenRfiRenderPayload,
  type RfiIssueFileSummary,
  type RfiIssueRecipientSummary,
  type RfiIssueRequest,
  type RfiOfficialIssueResult,
} from "../../domain/rfis/official-issue";
import type { Rfi } from "../../domain/rfis/rfi";
import { requireValidRendererDefinition } from "../../rendering/renderer-definition";
import type { D1ProjectContactsRepository } from "../../infrastructure/db/d1/project-contacts-repository";
import type { D1RecordRevisionsRepository } from "../../infrastructure/db/d1/record-revisions-repository";
import type { D1RfiAttachmentsRepository } from "../../infrastructure/db/d1/rfi-attachments-repository";
import type { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import type {
  CommitRfiOfficialIssueInput,
  D1RfiOfficialIssueRepository,
  OfficialIssueRecipientSnapshot,
} from "../../infrastructure/db/d1/rfi-official-issue-repository";
import type { D1UsersRepository } from "../../infrastructure/db/d1/users-repository";
import type { FileObjectMetadata } from "../files/file-service";
import type { ProjectService } from "../projects/project-service";
import type { RfiArtifactRenderer } from "./rfi-artifact-renderer";
import type { RfiTemplateBindingService } from "./rfi-template-binding-service";

export interface RfiOfficialArtifactStoragePort {
  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void>;
  head(key: string): Promise<{ size: number; sha256?: string } | null>;
  delete(key: string): Promise<void>;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

function displayNumber(sequence: number): string {
  return `RFI-${String(sequence).padStart(3, "0")}`;
}

function safeFilename(display: string): string {
  return `${display.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`;
}

function contactSummary(
  contact: OfficialIssueRecipientSnapshot,
): RfiIssueRecipientSummary {
  return {
    projectContactId: contact.projectContactId,
    contactName: contact.contactName,
    companyName: contact.companyName,
    email: contact.email,
  };
}

function fileSummary(file: {
  id: string;
  role: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}): RfiIssueFileSummary {
  return {
    fileId: file.id,
    role: file.role,
    originalFilename: file.originalFilename,
    mediaType: file.mediaType,
    byteSize: file.byteSize,
    sha256: file.sha256,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RfiOfficialIssueService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RfiRecordsRepository,
    private readonly revisions: D1RecordRevisionsRepository,
    private readonly attachments: D1RfiAttachmentsRepository,
    private readonly contacts: D1ProjectContactsRepository,
    private readonly templates: RfiTemplateBindingService,
    private readonly users: D1UsersRepository,
    private readonly issues: D1RfiOfficialIssueRepository,
    private readonly storage: RfiOfficialArtifactStoragePort,
    private readonly renderer: RfiArtifactRenderer,
  ) {}

  async issue(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    idempotencyKey: string,
    request: RfiIssueRequest,
    requestId: string,
  ): Promise<RfiOfficialIssueResult> {
    const project = await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:issue",
    );
    if (!idempotencyKey.trim() || idempotencyKey.length > 200) {
      throw new RfiIssueRequestError(
        "A valid Idempotency-Key header is required.",
      );
    }
    const requestHash = await sha256(
      canonicalRfiIssueRequest(projectId, rfiId, request),
    );
    const replay = await this.issues.findIdempotentResult(
      actor.organizationId,
      projectId,
      rfiId,
      idempotencyKey,
    );
    if (replay) {
      if (
        !replay.requestedResourceMatches ||
        replay.requestHash !== requestHash
      ) {
        throw new RfiIssueIdempotencyConflictError();
      }
      return replay.result;
    }

    if (project.status !== "active" || project.archivedAt) {
      throw new RfiIssueValidationError(
        "Only an active project can issue an RFI.",
      );
    }
    const rfi = await this.records.findById(
      actor.organizationId,
      project.id,
      rfiId,
    );
    if (!rfi) throw new RfiNotFoundError();
    issueStatus(rfi.status);
    if (
      await this.issues.hasOfficialIssue(
        actor.organizationId,
        project.id,
        rfi.id,
      )
    ) {
      throw new RfiAlreadyIssuedError();
    }
    this.validateRfi(rfi);

    const revision = await this.revisions.findById(
      actor.organizationId,
      rfi.id,
      rfi.draftRevisionId,
    );
    if (!revision || revision.status !== "draft") {
      throw new RfiIssueValidationError(
        "The RFI's authoritative draft revision is unavailable.",
      );
    }

    const template = await this.templates.describe(
      actor.organizationId,
      rfi.templateVersionId,
    );
    if (
      !template ||
      template.templateVersionId !== rfi.templateVersionId ||
      template.status !== "published"
    ) {
      throw new RfiIssueValidationError(
        "The exact published RFI template version is unavailable.",
      );
    }
    requireValidRendererDefinition(template.definition);

    const responsible = await this.resolveContact(
      actor.organizationId,
      project.id,
      rfi.responsiblePartyId as string,
    );
    const recipients = await this.resolveContacts(
      actor.organizationId,
      project.id,
      request.recipientProjectContactIds,
    );
    const cc = await this.resolveContacts(
      actor.organizationId,
      project.id,
      request.ccProjectContactIds,
    );

    const availableFiles = await this.attachments.list(
      actor.organizationId,
      rfi.id,
    );
    const availableById = new Map(
      availableFiles
        .filter((file) => file.revisionId === revision.id)
        .map((file) => [file.id, file]),
    );
    const includedFiles = request.includedFileIds.map((fileId) => {
      const file = availableById.get(fileId);
      if (!file) {
        throw new RfiIssueValidationError(
          "Every included file must belong to this RFI's authoritative draft revision.",
        );
      }
      return file;
    });
    for (const file of includedFiles) {
      const object = await this.head(file.storageKey);
      if (!object) {
        throw new RfiIssueStorageError(
          "An included file is missing from private storage.",
        );
      }
      if (object.size !== file.byteSize || object.sha256 !== file.sha256) {
        throw new RfiIssueStorageError(
          "An included file does not match its authoritative metadata.",
        );
      }
    }

    const lastNumber = await this.issues.peekLastRfiNumber(
      actor.organizationId,
      project.id,
    );
    const sequence = rfi.issuedNumberSequence ?? lastNumber + 1;
    const officialDisplayNumber = rfi.rfiNumber ?? displayNumber(sequence);
    const issuedAt = new Date().toISOString();
    const actorUser = await this.users.findById(actor.userId);
    const organizationName = await this.issues.findOrganizationName(
      actor.organizationId,
    );
    const templateDefinitionJson = JSON.stringify(template.definition);
    const templateDefinitionSha256 = await sha256(templateDefinitionJson);
    const payload: FrozenRfiRenderPayload = {
      schemaVersion: "rfi-official-render.v1",
      rendererVersion: this.renderer.rendererVersion,
      issuedAt,
      officialDisplayNumber,
      template: {
        templateVersionId: template.templateVersionId,
        key: template.key,
        name: template.name,
        versionNumber: template.versionNumber,
        definitionSha256: templateDefinitionSha256,
        definition: template.definition,
      },
      organization: {
        id: actor.organizationId,
        name: organizationName,
      },
      project: {
        id: project.id,
        projectNumber: project.projectNumber,
        name: project.name,
        status: project.status,
        timezone: project.timezone,
        address: { ...project.address },
      },
      rfi: {
        id: rfi.id,
        subject: rfi.subject,
        question: rfi.question,
        contractorSuggestion: rfi.contractorSuggestion,
        drawingReferences: rfi.drawingReferences,
        specificationReferences: rfi.specificationReferences,
        responsibleParty: contactSummary(responsible),
        submittedBy: rfi.submittedBy,
        responseDueDate: request.responseDueDate,
      },
      routing: {
        to: recipients.map(contactSummary),
        cc: cc.map(contactSummary),
        deliveryMode: "record_only",
      },
      includedFiles: includedFiles.map(fileSummary),
      issuedBy: {
        userId: actor.userId,
        displayName: actorUser?.displayName ?? null,
      },
    };
    const renderPayloadJson = JSON.stringify(payload);
    const renderPayloadSha256 = await sha256(renderPayloadJson);
    let rendered;
    try {
      rendered = await this.renderer.render(payload);
    } catch (error) {
      throw new RfiIssueRenderError(error);
    }
    if (rendered.bytes.byteLength === 0) {
      throw new RfiIssueRenderError(
        new Error("The renderer returned no bytes."),
      );
    }
    const artifactSha256 = await sha256(rendered.bytes);
    const artifactFileId = `${rfi.id}:official-rfi-pdf`;
    const artifactStorageKey =
      `organizations/${actor.organizationId}/projects/${project.id}/records/` +
      `${rfi.id}/revisions/${revision.id}/artifacts/official-rfi.pdf`;
    const artifactFilename = safeFilename(officialDisplayNumber);
    const metadata: FileObjectMetadata = {
      contentType: rendered.mediaType,
      originalFilename: artifactFilename,
      organizationId: actor.organizationId,
      projectId: project.id,
      recordId: rfi.id,
      revisionId: revision.id,
      fileId: artifactFileId,
      sha256: artifactSha256,
    };

    try {
      await this.storage.put(artifactStorageKey, rendered.bytes, metadata);
    } catch (error) {
      const raced = await this.issues.findIdempotentResult(
        actor.organizationId,
        project.id,
        rfi.id,
        idempotencyKey,
      );
      if (
        raced?.requestedResourceMatches &&
        raced.requestHash === requestHash
      ) {
        return raced.result;
      }
      if (raced) throw new RfiIssueIdempotencyConflictError();
      throw new RfiIssueStorageError(
        "The official artifact could not be stored.",
        error,
      );
    }
    let verified: { size: number; sha256?: string } | null;
    try {
      verified = await this.head(artifactStorageKey);
    } catch (error) {
      await this.compensateOrRecord({
        organizationId: actor.organizationId,
        projectId: project.id,
        rfiId: rfi.id,
        fileId: artifactFileId,
        storageKey: artifactStorageKey,
        sha256: artifactSha256,
        byteSize: rendered.bytes.byteLength,
        failure: error,
      });
      throw error;
    }
    if (
      !verified ||
      verified.size !== rendered.bytes.byteLength ||
      verified.sha256 !== artifactSha256
    ) {
      await this.compensateOrRecord({
        organizationId: actor.organizationId,
        projectId: project.id,
        rfiId: rfi.id,
        fileId: artifactFileId,
        storageKey: artifactStorageKey,
        sha256: artifactSha256,
        byteSize: rendered.bytes.byteLength,
        failure: new Error(
          "R2 verification did not match the generated artifact.",
        ),
      });
      throw new RfiIssueStorageError(
        "The stored official artifact could not be verified.",
      );
    }

    const commitInput: CommitRfiOfficialIssueInput = {
      issueId: crypto.randomUUID(),
      organizationId: actor.organizationId,
      projectId: project.id,
      rfiId: rfi.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      revisionCreatedBy: revision.createdBy,
      revisionCreatedAt: revision.createdAt,
      subject: rfi.subject,
      question: rfi.question,
      expectedLastRfiNumber: lastNumber,
      existingRfiSequence: rfi.issuedNumberSequence,
      officialDisplayNumber,
      templateVersionId: template.templateVersionId,
      templateDefinitionJson,
      templateDefinitionSha256,
      renderPayloadJson,
      renderPayloadSha256,
      rendererVersion: this.renderer.rendererVersion,
      artifact: {
        fileId: artifactFileId,
        storageKey: artifactStorageKey,
        originalFilename: artifactFilename,
        mediaType: rendered.mediaType,
        byteSize: rendered.bytes.byteLength,
        sha256: artifactSha256,
      },
      includedFiles,
      recipients,
      cc,
      responseDueDate: request.responseDueDate,
      issuedBy: actor.userId,
      issuedByDisplayName: actorUser?.displayName ?? null,
      issuedAt,
      requestId,
      idempotencyKey,
      requestHash,
      issuanceId: crypto.randomUUID(),
    };
    let commitError: unknown = null;
    try {
      await this.issues.commit(commitInput);
    } catch (error) {
      commitError = error;
    }

    let state;
    try {
      state = await this.issues.inspectCommitState(commitInput);
    } catch (inspectionError) {
      await this.retainForReconciliation({
        organizationId: actor.organizationId,
        projectId: project.id,
        rfiId: rfi.id,
        storageKey: artifactStorageKey,
        sha256: artifactSha256,
        byteSize: rendered.bytes.byteLength,
        failure: commitError ?? inspectionError,
        detail: `authoritative inspection unavailable: ${errorMessage(inspectionError)}`,
      });
      throw new RfiIssueCompensationError(inspectionError);
    }
    if (state.status === "committed") return state.result;

    if (commitError && state.status === "absent") {
      await this.compensateOrRecord({
        organizationId: actor.organizationId,
        projectId: project.id,
        rfiId: rfi.id,
        fileId: artifactFileId,
        storageKey: artifactStorageKey,
        sha256: artifactSha256,
        byteSize: rendered.bytes.byteLength,
        failure: commitError,
      });
      throw new RfiIssuePersistenceError(commitError);
    }
    if (commitError && state.status === "conflict") {
      await this.compensateOrRecord({
        organizationId: actor.organizationId,
        projectId: project.id,
        rfiId: rfi.id,
        fileId: artifactFileId,
        storageKey: artifactStorageKey,
        sha256: artifactSha256,
        byteSize: rendered.bytes.byteLength,
        failure: commitError,
      });
      throw new RfiIssueIdempotencyConflictError();
    }

    await this.retainForReconciliation({
      organizationId: actor.organizationId,
      projectId: project.id,
      rfiId: rfi.id,
      storageKey: artifactStorageKey,
      sha256: artifactSha256,
      byteSize: rendered.bytes.byteLength,
      failure:
        commitError ?? new Error("Commit returned without durable evidence."),
      detail: `authoritative state: ${state.status}`,
    });
    throw new RfiIssueCompensationError(commitError);
  }

  private validateRfi(rfi: Rfi): void {
    if (!rfi.subject.trim() || !rfi.question.trim()) {
      throw new RfiIssueValidationError(
        "The RFI subject and question must be complete.",
      );
    }
    if (!rfi.responsiblePartyId) {
      throw new RfiIssueValidationError(
        "A responsible project contact is required before issue.",
      );
    }
    if (rfi.issuanceReconciliationState !== "not_issued") {
      throw new RfiAlreadyIssuedError();
    }
  }

  private async resolveContacts(
    organizationId: string,
    projectId: string,
    ids: string[],
  ): Promise<OfficialIssueRecipientSnapshot[]> {
    return Promise.all(
      ids.map((id) => this.resolveContact(organizationId, projectId, id)),
    );
  }

  private async resolveContact(
    organizationId: string,
    projectId: string,
    id: string,
  ): Promise<OfficialIssueRecipientSnapshot> {
    const contact = await this.contacts.findById(organizationId, projectId, id);
    if (!contact || contact.archivedAt) {
      throw new RfiIssueValidationError(
        "Every routing contact must be active on this project.",
      );
    }
    return {
      projectContactId: contact.id,
      contactName: contact.contactName,
      companyName: contact.companyName,
      contactType: contact.contactType,
      email: contact.email,
      phone: contact.phone,
      address: { ...contact.address },
    };
  }

  private async head(
    key: string,
  ): Promise<{ size: number; sha256?: string } | null> {
    try {
      return await this.storage.head(key);
    } catch (error) {
      throw new RfiIssueStorageError(
        "Private storage verification failed.",
        error,
      );
    }
  }

  private async compensateOrRecord(input: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    fileId: string;
    storageKey: string;
    sha256: string;
    byteSize: number;
    failure: unknown;
  }): Promise<void> {
    let referenced: boolean;
    try {
      referenced = await this.issues.artifactIsReferenced({
        organizationId: input.organizationId,
        projectId: input.projectId,
        rfiId: input.rfiId,
        fileId: input.fileId,
        storageKey: input.storageKey,
        sha256: input.sha256,
      });
    } catch (inspectionError) {
      await this.retainForReconciliation({
        ...input,
        detail: `safe-delete inspection unavailable: ${errorMessage(inspectionError)}`,
      });
      throw new RfiIssueCompensationError(inspectionError);
    }
    if (referenced) {
      await this.retainForReconciliation({
        ...input,
        detail: "artifact is referenced by authoritative official state",
      });
      throw new RfiIssueCompensationError(input.failure);
    }
    try {
      await this.storage.delete(input.storageKey);
    } catch (deleteError) {
      try {
        await this.issues.recordArtifactReconciliation({
          organizationId: input.organizationId,
          projectId: input.projectId,
          rfiId: input.rfiId,
          storageKey: input.storageKey,
          sha256: input.sha256,
          byteSize: input.byteSize,
          kind: "compensation_delete_failed",
          failureSummary: `${errorMessage(input.failure)}; compensation: ${errorMessage(deleteError)}`,
        });
      } catch (reconciliationError) {
        console.error("rfi_issue_orphan_record_failed", {
          organizationId: input.organizationId,
          projectId: input.projectId,
          rfiId: input.rfiId,
          storageKey: input.storageKey,
          error: errorMessage(reconciliationError),
        });
      }
      throw new RfiIssueCompensationError(deleteError);
    }
  }

  private async retainForReconciliation(input: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    storageKey: string;
    sha256: string;
    byteSize: number;
    failure: unknown;
    detail: string;
  }): Promise<void> {
    try {
      await this.issues.recordArtifactReconciliation({
        organizationId: input.organizationId,
        projectId: input.projectId,
        rfiId: input.rfiId,
        storageKey: input.storageKey,
        sha256: input.sha256,
        byteSize: input.byteSize,
        kind: "commit_outcome_unknown",
        failureSummary: `${errorMessage(input.failure)}; ${input.detail}`,
      });
    } catch (reconciliationError) {
      console.error("rfi_issue_reconciliation_record_failed", {
        organizationId: input.organizationId,
        projectId: input.projectId,
        rfiId: input.rfiId,
        storageKey: input.storageKey,
        error: errorMessage(reconciliationError),
      });
    }
  }
}
