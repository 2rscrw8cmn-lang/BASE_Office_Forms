/*
 * Presentational vocabulary for the RFI workspace.
 *
 * Date and RFI-status formatting are re-exported from the RFI register's
 * `format.ts` so a row and its workspace can never disagree. The activity,
 * attachment-role, and field-name label maps are ported from
 * `public/app-format.js` -- the same source the legacy workspace used -- and
 * `rfi-workspace-format.test.ts` asserts label-for-label parity against that
 * module so the two cannot drift.
 *
 * Activity presentation renders only the mapped action label plus the server's
 * structured hint. Raw activity JSON is never exposed.
 */

import type { RfiWorkspaceActivity } from "./types";

export {
  formatDate,
  formatShortDate,
  rfiDueUrgencyText,
  rfiStatusLabel,
} from "../rfis/format";

const ACTIVITY_LABELS: Record<string, string> = {
  "project.created": "Project created",
  "project.updated": "Project updated",
  "project_contact.created": "Project contact added",
  "project_contact.updated": "Project contact updated",
  "record.created": "Record created",
  "record.updated": "Record updated",
  "record.archived": "Record archived",
  "revision.created": "Draft revision created",
  "revision.published": "Revision published",
  "revision.superseded": "Revision superseded",
  "file.uploaded": "File uploaded",
  "issuance.created": "Issuance created",
  "rfi.created": "RFI drafted",
  "rfi.updated": "RFI updated",
  "rfi.marked_ready": "RFI marked ready to issue",
  "rfi.issued": "RFI issued",
  "rfi.responded": "Response received",
  "rfi.returned_for_clarification": "Returned for clarification",
  "rfi.closed": "RFI closed",
  "rfi.reopened": "RFI reopened",
  "rfi.voided": "RFI voided",
  "rfi.attachment_added": "Attachment added",
};

export function describeActivity(action: string): string {
  return ACTIVITY_LABELS[action] || "Project activity";
}

const RFI_ATTACHMENT_ROLE_LABELS: Record<string, string> = {
  supporting_attachment: "Supporting attachment",
  reference_drawing: "Reference drawing",
};

export function rfiAttachmentRoleLabel(role: string): string {
  return RFI_ATTACHMENT_ROLE_LABELS[role] || role;
}

const RFI_FIELD_LABELS: Record<string, string> = {
  subject: "Subject",
  question: "Question",
  contractorSuggestion: "Contractor suggestion",
  drawingReferences: "Drawing references",
  specificationReferences: "Specification references",
  responsibleParty: "Responsible party",
  submittedBy: "Submitted by",
  requestedResponseDate: "Requested response date",
  costImpact: "Cost impact",
  scheduleImpact: "Schedule impact",
};

export function rfiFieldLabel(field: string): string {
  return RFI_FIELD_LABELS[field] || field;
}

export function actorLabel(event: {
  actorType: string;
  actorDisplayName: string | null;
}): string {
  if (event.actorType === "system") return "System";
  return event.actorDisplayName || "A team member";
}

/** A short, safe activity detail line derived only from structured fields. */
export function rfiActivityDetail(event: RfiWorkspaceActivity): string {
  if (Array.isArray(event.changedFields) && event.changedFields.length) {
    return event.changedFields.map(rfiFieldLabel).join(", ");
  }
  if (event.role) return rfiAttachmentRoleLabel(event.role);
  return "";
}

/** The official number, or the explicit unnumbered-draft label. Never the UUID. */
export function rfiNumberLabel(rfiNumber: string | null): string {
  return rfiNumber || "Unnumbered Draft";
}

export function formatBytes(value: number | null | undefined): string {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
