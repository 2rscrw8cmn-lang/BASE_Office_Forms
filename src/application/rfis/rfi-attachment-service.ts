import type { AppSession } from "../../auth/authentication-adapter";
import {
  FileObjectIntegrityError,
  FileObjectMissingError,
  FileStorageWriteError,
  FileUploadCompensationError,
} from "../../domain/files/errors";
import { sha256Hex } from "../../domain/files/checksum";
import { validateFileUpload } from "../../domain/files/validation";
import {
  RfiIllegalTransitionError,
  RfiNotFoundError,
} from "../../domain/rfis/errors";
import { canAttach } from "../../domain/rfis/lifecycle";
import type {
  Rfi,
  RfiAttachment,
  RfiAttachmentRole,
} from "../../domain/rfis/rfi";
import { D1RfiAttachmentsRepository } from "../../infrastructure/db/d1/rfi-attachments-repository";
import { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import type { FileStoragePort } from "../files/file-service";
import { ProjectService } from "../projects/project-service";

export interface RfiAttachmentUploadInput {
  role: RfiAttachmentRole;
  originalFilename: string;
  mediaType: string;
  content: ArrayBuffer;
  correlationId: string;
}

export interface RfiAttachmentDownload {
  attachment: RfiAttachment;
  body: ReadableStream;
  size: number;
  httpEtag: string | null;
  contentType: string | null;
}

function describeError(error: unknown): string | null {
  if (error === null) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unserializable error";
  }
}

/**
 * Supporting-attachment lifecycle for an RFI. Mirrors the record file-upload
 * sequence: authorize, validate, write the binary to R2, then persist D1
 * metadata + the `rfi.attachment_added` activity event atomically, compensating
 * the R2 object if the D1 write fails. Attachments stay bound to the exact RFI
 * and carry an explicit role (supporting_attachment / reference_drawing).
 */
export class RfiAttachmentService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RfiRecordsRepository,
    private readonly attachments: D1RfiAttachmentsRepository,
    private readonly storage: FileStoragePort,
  ) {}

  async list(
    actor: AppSession,
    projectId: string,
    rfiId: string,
  ): Promise<RfiAttachment[]> {
    await this.projects.requireRfiAccess(actor, projectId);
    const rfi = await this.find(actor, projectId, rfiId);
    return this.attachments.list(actor.organizationId, rfi.id);
  }

  async upload(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    input: RfiAttachmentUploadInput,
  ): Promise<RfiAttachment> {
    await this.projects.requireRfiManagement(
      actor,
      projectId,
      "rfis:upload_attachment",
    );
    const rfi = await this.find(actor, projectId, rfiId);
    if (!canAttach(rfi.status)) {
      throw new RfiIllegalTransitionError(rfi.status, "receive attachments");
    }

    const { originalFilename, mediaType } = validateFileUpload({
      originalFilename: input.originalFilename,
      mediaType: input.mediaType,
      byteSize: input.content.byteLength,
    });

    const sha256 = await sha256Hex(input.content);
    const attachmentId = crypto.randomUUID();
    const storageKey =
      `organizations/${actor.organizationId}` +
      `/projects/${rfi.projectId}` +
      `/rfis/${rfi.id}` +
      `/attachments/${attachmentId}`;

    try {
      await this.storage.put(storageKey, input.content, {
        contentType: mediaType,
        originalFilename,
        organizationId: actor.organizationId,
        projectId: rfi.projectId,
        recordId: `rfi:${rfi.id}`,
        revisionId: `role:${input.role}`,
        fileId: attachmentId,
        sha256,
      });
    } catch (error) {
      throw new FileStorageWriteError(error);
    }

    const attachment: RfiAttachment = {
      id: attachmentId,
      organizationId: actor.organizationId,
      projectId: rfi.projectId,
      rfiId: rfi.id,
      role: input.role,
      storageKey,
      originalFilename,
      mediaType,
      byteSize: input.content.byteLength,
      sha256,
      uploadedBy: actor.userId,
      uploadedAt: new Date().toISOString(),
    };

    try {
      return await this.attachments.createWithActivity(attachment, {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "rfi",
        action: "rfi.attachment_added",
        metadata: { role: input.role, attachmentId },
        correlationId: input.correlationId,
      });
    } catch (persistenceError) {
      let compensationSucceeded = true;
      let compensationError: unknown = null;
      try {
        await this.storage.delete(storageKey);
      } catch (deleteError) {
        compensationSucceeded = false;
        compensationError = deleteError;
      }
      console.error(
        JSON.stringify({
          message: compensationSucceeded
            ? "rfi attachment upload rolled back: R2 object removed after D1 persistence failure"
            : "rfi attachment upload rollback incomplete: R2 object could not be removed after D1 persistence failure",
          organizationId: actor.organizationId,
          attachmentId,
          storageKey,
          compensationSucceeded,
          persistenceError: describeError(persistenceError),
          compensationError: describeError(compensationError),
        }),
      );
      throw new FileUploadCompensationError(
        persistenceError,
        compensationSucceeded,
        compensationError,
      );
    }
  }

  async download(
    actor: AppSession,
    projectId: string,
    rfiId: string,
    attachmentId: string,
  ): Promise<RfiAttachmentDownload> {
    await this.projects.requireRfiAccess(actor, projectId);
    const rfi = await this.find(actor, projectId, rfiId);
    const attachment = await this.attachments.findById(
      actor.organizationId,
      rfi.id,
      attachmentId,
    );
    if (!attachment) throw new RfiNotFoundError();
    const object = await this.storage.get(attachment.storageKey);
    if (!object) throw new FileObjectMissingError();
    if (object.size !== attachment.byteSize) {
      throw new FileObjectIntegrityError();
    }
    return {
      attachment,
      body: object.body,
      size: object.size,
      httpEtag: object.httpEtag,
      contentType: object.contentType,
    };
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
