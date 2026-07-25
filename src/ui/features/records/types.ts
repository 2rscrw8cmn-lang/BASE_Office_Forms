/*
 * Types for the project Records register read model, mirroring the existing
 * `GET /api/v2/projects/:projectId/records` response exactly (see
 * `src/application/read-models/project-records-service.ts` and
 * `serializeRecordSummary` in `src/http/v2/router.ts`). UI-6B changes no
 * response shape: these are a typed view of what the server already returns.
 *
 * Record, Revision, and File stay distinct here as they are in the domain:
 * `RecordListItem` is the document identity, `currentRevision` is the one
 * authoritative version relationship the server resolved through the record's
 * `current_revision_id`, and `fileCount` spans every revision of the record.
 */

import type { RecordStatus, RecordType } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";

/**
 * The authoritative current revision. Present only when the server resolved the
 * record's `current_revision_id`; a draft is never promoted into this slot.
 */
export interface RecordCurrentRevision {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
  status: RevisionStatus;
  title: string;
}

export interface RecordCapabilities {
  update: boolean;
  archive: boolean;
}

export interface RecordListItem {
  id: string;
  projectId: string;
  /** Server-generated; null on legacy records that never received one. */
  recordNumber: string | null;
  title: string;
  recordType: RecordType;
  discipline: string | null;
  status: RecordStatus;
  currentRevision: RecordCurrentRevision | null;
  hasDraftRevision: boolean;
  /** Only set when exactly one draft exists; see the read repository. */
  draftRevisionId: string | null;
  /** Total files across every revision of this record. */
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  capabilities: RecordCapabilities;
}

export interface RecordsReadModel {
  records: RecordListItem[];
  capabilities: { createRecord: boolean };
}

/** Accepted by `POST /api/v2/projects/:projectId/records`. */
export interface CreateRecordInput {
  recordType: RecordType;
  title: string;
  description?: string;
  discipline?: string;
}

/** Accepted by `POST .../records/:recordId/revisions`. */
export interface CreateRevisionInput {
  changeSummary: string;
  revisionLabel?: string;
}

/** The subset of the created Record the workflow needs to recover and navigate. */
export interface CreatedRecord {
  id: string;
  recordNumber: string | null;
  title: string;
}

/** The subset of the created draft Revision the workflow needs. */
export interface CreatedRevision {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
}
