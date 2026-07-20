import type { AppSession } from "../../auth/authentication-adapter";
import {
  FileNotFoundError,
  FileObjectMissingError,
  FileStorageWriteError,
  FileUploadCompensationError,
} from "../../domain/files/errors";
import type { RevisionFile } from "../../domain/files/file";
import { sha256Hex } from "../../domain/files/checksum";
import { buildStorageKey } from "../../domain/files/storage-key";
import { validateFileUpload } from "../../domain/files/validation";
import { RecordNotFoundError } from "../../domain/records/errors";
import { assertRecordIsActive } from "../../domain/records/validation";
import type { Record } from "../../domain/records/record";
import { RevisionNotFoundError } from "../../domain/revisions/errors";
import type { Revision } from "../../domain/revisions/revision";
import { D1RecordRevisionsRepository } from "../../infrastructure/db/d1/record-revisions-repository";
import { D1RecordsRepository } from "../../infrastructure/db/d1/records-repository";
import { D1RevisionFilesRepository } from "../../infrastructure/db/d1/revision-files-repository";
import { ProjectService } from "../projects/project-service";

export interface FileObjectMetadata {
  contentType: string;
  originalFilename: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  fileId: string;
  sha256: string;
}

export interface StoredFileObject {
  body: ReadableStream;
  size: number;
  httpEtag: string | null;
  contentType: string | null;
}

/**
 * The port this service depends on for the binary side of a file. Kept as
 * an interface (rather than depending on the concrete R2 adapter) so tests
 * can inject a fake that fails `put`/`delete` on demand to exercise the
 * upload compensation paths without touching real R2.
 */
export interface FileStoragePort {
  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void>;
  get(key: string): Promise<StoredFileObject | null>;
  delete(key: string): Promise<void>;
}

export interface FileUploadContent {
  originalFilename: string;
  mediaType: string;
  content: ArrayBuffer;
  correlationId: string;
}

export interface FileDownload {
  file: RevisionFile;
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

export class FileService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RecordsRepository,
    private readonly revisions: D1RecordRevisionsRepository,
    private readonly files: D1RevisionFilesRepository,
    private readonly storage: FileStoragePort,
  ) {}

  async list(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
  ): Promise<RevisionFile[]> {
    await this.projects.requireFileAccess(actor, projectId);
    const record = await this.findRecord(actor, projectId, recordId);
    const revision = await this.findRevision(actor, record.id, revisionId);
    return this.files.list(actor.organizationId, revision.id);
  }

  async get(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
    fileId: string,
  ): Promise<RevisionFile> {
    await this.projects.requireFileAccess(actor, projectId);
    const record = await this.findRecord(actor, projectId, recordId);
    const revision = await this.findRevision(actor, record.id, revisionId);
    return this.findFile(revision.id, fileId, actor.organizationId);
  }

  /**
   * Implements the required upload sequence: authorize, validate hierarchy
   * and metadata, write the binary to R2, then persist D1 metadata and the
   * `file.uploaded` activity event atomically. If the D1 write fails after
   * the R2 write already succeeded, the R2 object is deleted to compensate;
   * a success response is never returned unless both sides succeeded.
   */
  async upload(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
    input: FileUploadContent,
  ): Promise<RevisionFile> {
    await this.projects.requireFileManagement(actor, projectId, "files:upload");
    const record = await this.findRecord(actor, projectId, recordId);
    assertRecordIsActive(record.status, "be edited");
    const revision = await this.findRevision(actor, record.id, revisionId);

    const { originalFilename, mediaType } = validateFileUpload({
      originalFilename: input.originalFilename,
      mediaType: input.mediaType,
      byteSize: input.content.byteLength,
    });

    const sha256 = await sha256Hex(input.content);
    const fileId = crypto.randomUUID();
    const storageKey = buildStorageKey({
      organizationId: actor.organizationId,
      projectId: record.projectId,
      recordId: record.id,
      revisionId: revision.id,
      fileId,
    });

    try {
      await this.storage.put(storageKey, input.content, {
        contentType: mediaType,
        originalFilename,
        organizationId: actor.organizationId,
        projectId: record.projectId,
        recordId: record.id,
        revisionId: revision.id,
        fileId,
        sha256,
      });
    } catch (error) {
      throw new FileStorageWriteError(error);
    }

    const file: RevisionFile = {
      id: fileId,
      organizationId: actor.organizationId,
      projectId: record.projectId,
      recordId: record.id,
      revisionId: revision.id,
      storageKey,
      originalFilename,
      mediaType,
      byteSize: input.content.byteLength,
      sha256,
      uploadedBy: actor.userId,
      uploadedAt: new Date().toISOString(),
    };

    try {
      return await this.files.createWithActivity(file, {
        actorUserId: actor.userId,
        actorType: "user",
        objectType: "file",
        action: "file.uploaded",
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
      // Storage keys are internal implementation detail and must never
      // reach an API response; logging is the only place they belong so
      // operators can find and remove an orphaned object by hand.
      console.error(
        JSON.stringify({
          message: compensationSucceeded
            ? "file upload rolled back: R2 object removed after D1 persistence failure"
            : "file upload rollback incomplete: R2 object could not be removed after D1 persistence failure",
          organizationId: actor.organizationId,
          fileId,
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
    recordId: string,
    revisionId: string,
    fileId: string,
  ): Promise<FileDownload> {
    await this.projects.requireFileAccess(actor, projectId);
    const record = await this.findRecord(actor, projectId, recordId);
    const revision = await this.findRevision(actor, record.id, revisionId);
    const file = await this.findFile(revision.id, fileId, actor.organizationId);
    const object = await this.storage.get(file.storageKey);
    if (!object) throw new FileObjectMissingError();
    return {
      file,
      body: object.body,
      size: object.size,
      httpEtag: object.httpEtag,
      contentType: object.contentType,
    };
  }

  private async findRecord(
    actor: AppSession,
    projectId: string,
    recordId: string,
  ): Promise<Record> {
    const record = await this.records.findById(
      actor.organizationId,
      projectId,
      recordId,
    );
    if (!record) throw new RecordNotFoundError();
    return record;
  }

  private async findRevision(
    actor: AppSession,
    recordId: string,
    revisionId: string,
  ): Promise<Revision> {
    const revision = await this.revisions.findById(
      actor.organizationId,
      recordId,
      revisionId,
    );
    if (!revision) throw new RevisionNotFoundError();
    return revision;
  }

  private async findFile(
    revisionId: string,
    fileId: string,
    organizationId: string,
  ): Promise<RevisionFile> {
    const file = await this.files.findById(organizationId, revisionId, fileId);
    if (!file) throw new FileNotFoundError();
    return file;
  }
}
