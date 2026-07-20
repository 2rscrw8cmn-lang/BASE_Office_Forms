export const RECORD_TYPES = [
  "document",
  "drawing",
  "specification",
  "schedule",
  "report",
  "correspondence",
  "other",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_STATUSES = ["active", "archived"] as const;

export type RecordStatus = (typeof RECORD_STATUSES)[number];

export interface RecordWriteInput {
  recordType: RecordType;
  recordNumber: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
}

export type RecordUpdateInput = Omit<RecordWriteInput, "recordType">;

export interface Record {
  id: string;
  organizationId: string;
  projectId: string;
  recordType: RecordType;
  recordNumber: string | null;
  title: string;
  description: string | null;
  status: RecordStatus;
  discipline: string | null;
  source: string | null;
  createdBy: string;
  currentRevisionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
