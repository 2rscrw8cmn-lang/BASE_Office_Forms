export const ISSUANCE_PURPOSES = [
  "for_information",
  "for_review",
  "for_approval",
  "for_construction",
  "as_recorded",
  "other",
] as const;

export type IssuancePurpose = (typeof ISSUANCE_PURPOSES)[number];

export interface RevisionSnapshot {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionNumber: number;
  revisionLabel: string | null;
  status: "published";
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
  createdBy: string;
  createdAt: string;
  issuedByDisplayName?: string;
}

export interface IssuanceFile {
  issuanceId: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  fileId: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  displayOrder: number;
}

export interface Issuance {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  issueNumber: string;
  issueSequence: number;
  purpose: IssuancePurpose;
  notes: string | null;
  revisionSnapshot: RevisionSnapshot;
  issuedBy: string;
  issuedAt: string;
  correlationId: string;
  files: IssuanceFile[];
}

export interface IssuanceSummary {
  id: string;
  issueNumber: string;
  recordId: string;
  revisionId: string;
  purpose: IssuancePurpose;
  issuedBy: string;
  issuedAt: string;
  fileCount: number;
}

export interface IssuanceIssueInput {
  purpose: unknown;
  notes?: unknown;
  fileIds: unknown;
  correlationId: string;
}

export interface ValidatedIssuanceIssueInput {
  purpose: IssuancePurpose;
  notes: string | null;
  fileIds: string[];
  correlationId: string;
}
