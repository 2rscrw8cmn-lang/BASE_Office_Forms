/*
 * Read-model types for the RFI workspace. They mirror the unchanged
 * `GET /api/v2/projects/:projectId/rfis/:rfiId/workspace` envelope
 * (`src/application/read-models/rfi-workspace-service.ts`) exactly. UI-7 adds no
 * endpoint, changes no response shape, and derives no capability in the browser.
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
  issue: boolean;
  recordResponse: boolean;
  returnForClarification: boolean;
  close: boolean;
  reopen: boolean;
  void: boolean;
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
  currentVersion: { id: string; label: string; status: "draft" };
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

/** Only transitions that already had a browser surface before UI-7. */
export type RfiTransition = "close" | "reopen" | "void";
