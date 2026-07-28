/*
 * Read-model types for the RFI workspace. They mirror
 * `GET /api/v2/projects/:projectId/rfis/:rfiId/workspace`
 * (`src/application/read-models/rfi-workspace-service.ts`) exactly. The server
 * remains authoritative for lifecycle and capabilities.
 *
 * The RFI is one structured project record: the register row and this workspace
 * read the same authoritative record through two task-shaped read models
 * (UX_RFI_SPEC §7). Response content is a separate collection from the question
 * and is never merged into it.
 */

import type { RfiAttachmentRole, RfiStatus } from "../../../domain/rfis/rfi";

export interface RfiWorkspaceAttachment {
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

export interface RfiWorkspaceResponse {
  id: string;
  response: string;
  respondedBy: string | null;
  createdAt: string;
}

/**
 * The server's safe, structured activity projection. Raw activity JSON is never
 * sent to the browser and never rendered -- only the mapped action label and
 * these structured hints.
 */
export interface RfiWorkspaceActivity {
  action: string;
  actorType: "user" | "system";
  actorDisplayName: string | null;
  createdAt: string;
  changedFields: string[];
  role: string | null;
}

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

/** Immutable original-issue evidence; never use this as current state. */
export interface RfiOfficialIssueSummary {
  officialDisplayNumber: string;
  issuedRevision: {
    id: string;
    internalRevisionNumber: number;
    userFacingVersion: "Original Issue";
  };
  issuance: { id: string; issueNumber: string };
  issuedAt: string;
  responseDueDate: string;
  officialArtifact: {
    fileId: string;
    role: string;
    originalFilename: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
  };
  includedFiles: {
    fileId: string;
    role: string;
    originalFilename: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
  }[];
  recipients: {
    to: {
      projectContactId: string;
      contactName: string;
      companyName: string | null;
      email: string | null;
    }[];
    cc: {
      projectContactId: string;
      contactName: string;
      companyName: string | null;
      email: string | null;
    }[];
  };
  originalIssueRequestId: string;
}

export interface RfiWorkspaceModel {
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
  currentVersion: { id: string; label: string; status: "draft" | "published" };
  responsibleContacts: {
    id: string;
    name: string;
    companyName: string | null;
  }[];
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
    supporting_attachment: RfiWorkspaceAttachment[];
    reference_drawing: RfiWorkspaceAttachment[];
  };
  officialIssue: RfiOfficialIssueSummary | null;
  responses: RfiWorkspaceResponse[];
  activity: RfiWorkspaceActivity[];
  capabilities: RfiWorkspaceCapabilities;
}

export interface UpdateRfiInput {
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsiblePartyId: string | null;
  requestedResponseDate: string | null;
  /** Optimistic concurrency; a stale write returns 409 RFI_VERSION_CONFLICT. */
  lockVersion: number;
}

export interface RecordResponseInput {
  response: string;
  respondedBy: string | null;
}

/** Explicit server-authoritative transitions; never an ordinary save. */
export type RfiTransition = "close" | "reopen" | "return-to-draft" | "void";

/**
 * The exact `POST .../issue` request body (docs/API_CONTRACTS.md §8). Unknown
 * fields are rejected by the server, so this type is closed on purpose. The
 * browser never supplies an RFI number: numbering happens only server-side
 * during issue.
 */
export interface RfiIssueRequestInput {
  recipientProjectContactIds: string[];
  ccProjectContactIds: string[];
  responseDueDate: string;
  includedFileIds: string[];
  deliveryMode: "record_only";
}

export interface RfiIssueFileSummary {
  fileId: string;
  role: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}

export interface RfiIssueRecipientSummary {
  projectContactId: string;
  contactName: string;
  companyName: string | null;
  email: string | null;
}

/**
 * The immediate `POST .../issue` response. Deliberately NOT the long-lived
 * `RfiOfficialIssueSummary`: the issue-time result carries `status`,
 * `capabilities`, and identity fields that the workspace's immutable evidence
 * projection intentionally does not. Neither is treated as current lifecycle
 * state — the refetched top-level `rfi.status`/`capabilities` are.
 */
export interface RfiOfficialIssueResult {
  rfiId: string;
  recordId: string;
  officialDisplayNumber: string;
  status: "open";
  issuedRevision: {
    id: string;
    internalRevisionNumber: number;
    userFacingVersion: string;
  };
  issuance: { id: string; issueNumber: string };
  issuedAt: string;
  responseDueDate: string;
  officialArtifact: RfiIssueFileSummary;
  includedFiles: RfiIssueFileSummary[];
  recipients: {
    to: RfiIssueRecipientSummary[];
    cc: RfiIssueRecipientSummary[];
  };
  capabilities: {
    issue: false;
    recordResponse: true;
    returnForClarification: false;
    close: false;
    reopen: false;
    void: true;
  };
  requestId: string;
}
