import type { AppSession } from "../../auth/authentication-adapter";
import {
  IssuanceEligibilityError,
  IssuanceFileObjectIntegrityError,
  IssuanceFileObjectMissingError,
  IssuanceNotFoundError,
  IssuancePersistenceError,
  IssuanceStorageVerificationError,
} from "../../domain/issuances/errors";
import type {
  Issuance,
  IssuanceFile,
  IssuanceIssueInput,
  IssuanceSummary,
} from "../../domain/issuances/issuance";
import {
  buildRevisionSnapshot,
  serializeRevisionSnapshot,
} from "../../domain/issuances/snapshot";
import { validateIssuanceIssueInput } from "../../domain/issuances/validation";
import { RecordNotFoundError } from "../../domain/records/errors";
import type { Record } from "../../domain/records/record";
import { RevisionNotFoundError } from "../../domain/revisions/errors";
import type { Revision } from "../../domain/revisions/revision";
import { D1IssuancesRepository } from "../../infrastructure/db/d1/issuances-repository";
import { D1RecordRevisionsRepository } from "../../infrastructure/db/d1/record-revisions-repository";
import { D1RecordsRepository } from "../../infrastructure/db/d1/records-repository";
import { D1RevisionFilesRepository } from "../../infrastructure/db/d1/revision-files-repository";
import { D1UsersRepository } from "../../infrastructure/db/d1/users-repository";
import { ProjectService } from "../projects/project-service";

export interface IssuanceStoragePort {
  head(key: string): Promise<{ size: number } | null>;
}

export class IssuanceService {
  constructor(
    private readonly projects: ProjectService,
    private readonly records: D1RecordsRepository,
    private readonly revisions: D1RecordRevisionsRepository,
    private readonly files: D1RevisionFilesRepository,
    private readonly issuances: D1IssuancesRepository,
    private readonly users: D1UsersRepository,
    private readonly storage: IssuanceStoragePort,
  ) {}

  async list(actor: AppSession, projectId: string): Promise<IssuanceSummary[]> {
    await this.projects.requireIssuanceAccess(actor, projectId);
    return this.issuances.list(actor.organizationId, projectId);
  }

  async get(
    actor: AppSession,
    projectId: string,
    issuanceId: string,
  ): Promise<Issuance> {
    await this.projects.requireIssuanceAccess(actor, projectId);
    const issuance = await this.issuances.findById(
      actor.organizationId,
      projectId,
      issuanceId,
    );
    if (!issuance) throw new IssuanceNotFoundError();
    return issuance;
  }

  async issue(
    actor: AppSession,
    projectId: string,
    recordId: string,
    revisionId: string,
    input: IssuanceIssueInput,
  ): Promise<Issuance> {
    await this.projects.requireIssuanceManagement(
      actor,
      projectId,
      "issuances:issue",
    );
    const validated = validateIssuanceIssueInput(input);
    const record = await this.findRecord(actor, projectId, recordId);
    if (record.status === "archived") {
      throw new IssuanceEligibilityError("Archived records cannot be issued.");
    }
    const revision = await this.findRevision(actor, record.id, revisionId);
    if (revision.status !== "published") {
      throw new IssuanceEligibilityError(
        "Only a published revision can be issued.",
      );
    }

    const availableFiles = await this.files.list(
      actor.organizationId,
      revision.id,
    );
    const availableById = new Map(
      availableFiles.map((file) => [file.id, file]),
    );
    const selectedFiles = validated.fileIds.map((fileId) => {
      const file = availableById.get(fileId);
      if (!file) {
        throw new IssuanceEligibilityError(
          "Every selected file must belong to the requested revision.",
        );
      }
      return file;
    });

    for (const file of selectedFiles) {
      let object: { size: number } | null;
      try {
        object = await this.storage.head(file.storageKey);
      } catch (error) {
        throw new IssuanceStorageVerificationError(error);
      }
      if (!object) throw new IssuanceFileObjectMissingError();
      if (object.size !== file.byteSize) {
        throw new IssuanceFileObjectIntegrityError();
      }
    }

    const id = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const actorUser = await this.users.findById(actor.userId);
    const snapshot = buildRevisionSnapshot(revision, actorUser?.displayName);
    const snapshots: IssuanceFile[] = selectedFiles.map((file, index) => ({
      issuanceId: id,
      organizationId: actor.organizationId,
      projectId,
      recordId,
      revisionId,
      fileId: file.id,
      originalFilename: file.originalFilename,
      mediaType: file.mediaType,
      byteSize: file.byteSize,
      sha256: file.sha256,
      storageKey: file.storageKey,
      displayOrder: index,
    }));

    try {
      return await this.issuances.createWithFilesAndActivity({
        id,
        organizationId: actor.organizationId,
        projectId,
        recordId,
        revisionId,
        purpose: validated.purpose,
        notes: validated.notes,
        revisionSnapshotJson: serializeRevisionSnapshot(snapshot),
        issuedBy: actor.userId,
        issuedAt,
        correlationId: validated.correlationId,
        files: snapshots,
      });
    } catch (error) {
      throw new IssuancePersistenceError(error);
    }
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
}
