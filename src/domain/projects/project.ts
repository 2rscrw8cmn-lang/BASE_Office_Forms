export type ProjectStatus =
  "planning" | "active" | "closeout" | "suspended" | "archived";

export interface ProjectAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Project {
  id: string;
  organizationId: string;
  projectNumber: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  address: ProjectAddress;
  timezone: string;
  startDate: string | null;
  targetCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProjectContact {
  id: string;
  organizationId: string;
  projectId: string;
  companyName: string | null;
  contactName: string;
  contactType: string;
  email: string | null;
  phone: string | null;
  address: ProjectAddress;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
