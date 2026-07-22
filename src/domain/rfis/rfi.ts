// Binding RFI workflow states (docs/WORKFLOWS.md §5.1). Overdue and due-soon are
// calculated conditions, never stored statuses.
export const RFI_STATUSES = [
  "draft",
  "ready_to_issue",
  "open",
  "response_received",
  "closed",
  "returned_for_clarification",
  "void",
] as const;

export type RfiStatus = (typeof RFI_STATUSES)[number];

export const RFI_ATTACHMENT_ROLES = [
  "supporting_attachment",
  "reference_drawing",
] as const;

export type RfiAttachmentRole = (typeof RFI_ATTACHMENT_ROLES)[number];

// The structured fields a project user may fill on a draft RFI. Deliberately
// excludes the official number, workflow status, issue/response timestamps and
// the project-populated context — none of those are user-typed record fields.
export interface RfiWriteInput {
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsibleParty: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  costImpact: string | null;
  scheduleImpact: string | null;
}

export interface Rfi {
  id: string;
  organizationId: string;
  projectId: string;
  templateVersionId: string | null;
  rfiNumber: string | null;
  legacyReference: string | null;
  status: RfiStatus;
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsibleParty: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  costImpact: string | null;
  scheduleImpact: string | null;
  issuedNumberSequence: number | null;
  issuedAt: string | null;
  responseReceivedAt: string | null;
  closedAt: string | null;
  lockVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RfiResponse {
  id: string;
  organizationId: string;
  rfiId: string;
  response: string;
  respondedBy: string | null;
  createdAt: string;
}

export interface RfiAttachment {
  id: string;
  organizationId: string;
  projectId: string;
  rfiId: string;
  role: RfiAttachmentRole;
  storageKey: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface RfiDetail extends Rfi {
  responses: RfiResponse[];
  attachments: RfiAttachment[];
}

export function isRfiStatus(value: string): value is RfiStatus {
  return (RFI_STATUSES as readonly string[]).includes(value);
}

export function isRfiAttachmentRole(value: string): value is RfiAttachmentRole {
  return (RFI_ATTACHMENT_ROLES as readonly string[]).includes(value);
}
