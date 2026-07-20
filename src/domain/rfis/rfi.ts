export type RfiStatus = "draft" | "issued" | "answered" | "closed";

export interface RfiWriteInput {
  title: string;
  question: string;
  suggestedResolution: string | null;
  submittedBy: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  costImpact: string | null;
  scheduleImpact: string | null;
}

export interface Rfi {
  id: string;
  organizationId: string;
  projectId: string;
  rfiNumber: string | null;
  status: RfiStatus;
  title: string;
  question: string;
  suggestedResolution: string | null;
  submittedBy: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  costImpact: string | null;
  scheduleImpact: string | null;
  issuedAt: string | null;
  answeredAt: string | null;
  closedAt: string | null;
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

export interface RfiDetail extends Rfi {
  responses: RfiResponse[];
}
