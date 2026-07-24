/*
 * Read-model and write-input types for the native RFI register feature.
 * Mirrors the server envelope from `ProjectRfisReadModelService`
 * (src/application/read-models/project-rfis-service.ts) and the
 * GET /api/v2/projects/:projectId/rfis response exactly -- this feature does
 * not change response shapes.
 */

import type { RfiStatus } from "../../../domain/rfis/rfi";

export interface ResponsibleContactOption {
  id: string;
  name: string;
  companyName: string | null;
}

export interface RfiListItem {
  id: string;
  rfiNumber: string | null;
  legacyReference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsiblePartyId: string | null;
  responsibleParty: string | null;
  responsiblePartyLegacyText: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  issuedAt: string | null;
  responseReceivedAt: string | null;
  latestResponse: string | null;
  attachmentCount: number;
  isOverdue: boolean;
  dueSoon: boolean;
  lockVersion: number;
  draftRevisionId: string;
  issuanceReconciliationState: "not_issued" | "legacy_incomplete";
  createdAt: string;
  updatedAt: string;
  capabilities: { updateDraft: boolean };
}

export interface ProjectRfisReadModel {
  project: {
    id: string;
    projectNumber: string;
    name: string;
    status: string;
  };
  responsibleContacts: ResponsibleContactOption[];
  rfis: RfiListItem[];
  capabilities: { createRfi: boolean };
}

/** The structured fields the register's expandable editor can write. */
export type RfiEditableField =
  | "subject"
  | "responsiblePartyId"
  | "requestedResponseDate"
  | "question"
  | "contractorSuggestion"
  | "drawingReferences"
  | "specificationReferences";
