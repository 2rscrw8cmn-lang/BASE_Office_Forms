export const TEMPLATE_KINDS = ["form", "document", "package"] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_VERSION_STATUSES = ["published", "retired"] as const;

export type TemplateVersionStatus = (typeof TEMPLATE_VERSION_STATUSES)[number];

export interface Template {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  kind: TemplateKind;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersion {
  id: string;
  organizationId: string;
  templateId: string;
  versionNumber: number;
  definition: Record<string, unknown>;
  status: TemplateVersionStatus;
  createdBy: string;
  createdAt: string;
  publishedAt: string;
  publishedBy: string;
}

export interface TemplateWithPublishedVersion extends Template {
  publishedVersion: TemplateVersion;
}
