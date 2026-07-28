/*
 * Read-model types for the Record and Revision detail workspaces. They mirror
 * the unchanged `/api/v2` workspace envelopes
 * (`src/application/read-models/record-workspace-service.ts` and
 * `revision-workspace-service.ts`) exactly -- UI-7 adds no endpoint, changes no
 * response shape, and introduces no client-side capability.
 *
 * Record, Revision, and File identities stay separate types on purpose: a
 * revision never stands in for the record, and a file never stands in for the
 * revision that owns it.
 */

import type { RecordStatus, RecordType } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";

export interface WorkspaceFile {
  id: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  uploadedAt: string;
}

export interface WorkspaceRevisionCapabilities {
  uploadFile: boolean;
  publishRevision: boolean;
}

export interface WorkspaceRevision {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
  status: RevisionStatus;
  createdAt: string;
  fileCount: number;
  files: WorkspaceFile[];
  issuanceCount: number;
  isCurrent: boolean;
  capabilities: WorkspaceRevisionCapabilities;
}

export interface WorkspaceRecord {
  id: string;
  projectId: string;
  recordType: RecordType;
  recordNumber: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  status: RecordStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordWorkspaceModel {
  record: WorkspaceRecord;
  revisions: WorkspaceRevision[];
  totalFileCount: number;
  /** The authoritative current revision, or null when none is published yet. */
  currentRevision: WorkspaceRevision | null;
  capabilities: {
    updateRecord: boolean;
    archiveRecord: boolean;
    createRevision: boolean;
  };
}

export interface RevisionWorkspaceModel {
  record: WorkspaceRecord;
  revision: WorkspaceRevision;
  /** Lets the revision workspace state "this is the current version" honestly. */
  currentRevisionId: string | null;
}

export interface UpdateRecordInput {
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
}

export interface CreateRevisionInput {
  changeSummary: string;
  revisionLabel?: string;
}

export interface CreatedRevision {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
}
