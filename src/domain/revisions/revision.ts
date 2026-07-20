export const REVISION_STATUSES = ["draft", "published", "superseded"] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface RevisionWriteInput {
  revisionLabel: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
}

export interface Revision {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
  status: RevisionStatus;
  createdBy: string;
  createdAt: string;
}
