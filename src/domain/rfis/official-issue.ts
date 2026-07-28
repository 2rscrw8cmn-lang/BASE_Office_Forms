export const RFI_ISSUE_DELIVERY_MODES = ["record_only"] as const;
export type RfiIssueDeliveryMode = (typeof RFI_ISSUE_DELIVERY_MODES)[number];

export interface RfiIssueRequest {
  recipientProjectContactIds: string[];
  ccProjectContactIds: string[];
  responseDueDate: string;
  includedFileIds: string[];
  deliveryMode: RfiIssueDeliveryMode;
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
  issuance: {
    id: string;
    issueNumber: string;
  };
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

/**
 * Long-lived workspace evidence for the original issue. Current lifecycle
 * state and capabilities deliberately remain outside this immutable snapshot.
 */
export interface RfiOfficialIssueSummary {
  officialDisplayNumber: string;
  issuedRevision: {
    id: string;
    internalRevisionNumber: number;
    userFacingVersion: "Original Issue";
  };
  issuance: {
    id: string;
    issueNumber: string;
  };
  issuedAt: string;
  responseDueDate: string;
  officialArtifact: RfiIssueFileSummary;
  includedFiles: RfiIssueFileSummary[];
  recipients: {
    to: RfiIssueRecipientSummary[];
    cc: RfiIssueRecipientSummary[];
  };
  originalIssueRequestId: string;
}

export interface FrozenRfiRenderPayload {
  schemaVersion: "rfi-official-render.v1";
  rendererVersion: string;
  issuedAt: string;
  officialDisplayNumber: string;
  template: {
    templateVersionId: string;
    key: string;
    name: string;
    versionNumber: number;
    definitionSha256: string;
    definition: Record<string, unknown>;
  };
  organization: {
    id: string;
    name: string | null;
  };
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
  rfi: {
    id: string;
    subject: string;
    question: string;
    contractorSuggestion: string | null;
    drawingReferences: string | null;
    specificationReferences: string | null;
    responsibleParty: RfiIssueRecipientSummary;
    submittedBy: string | null;
    responseDueDate: string;
  };
  routing: {
    to: RfiIssueRecipientSummary[];
    cc: RfiIssueRecipientSummary[];
    deliveryMode: "record_only";
  };
  includedFiles: RfiIssueFileSummary[];
  issuedBy: {
    userId: string;
    displayName: string | null;
  };
}

export function canonicalRfiIssueRequest(
  projectId: string,
  rfiId: string,
  input: RfiIssueRequest,
): string {
  return JSON.stringify({
    projectId,
    rfiId,
    recipientProjectContactIds: input.recipientProjectContactIds,
    ccProjectContactIds: input.ccProjectContactIds,
    responseDueDate: input.responseDueDate,
    includedFileIds: input.includedFileIds,
    deliveryMode: input.deliveryMode,
  });
}
