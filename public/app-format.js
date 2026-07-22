// Shared presentation helpers for the dashboard and project-overview feature
// modules. Human-readable labels for statuses, purposes, attention reasons, and
// activity descriptions live here in one consistent layer so no two views
// derive conflicting text.
export { disciplineLabel } from "./record-options.js";

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FORMAT.format(date);
}

const PURPOSE_LABELS = {
  for_information: "For information",
  for_review: "For review",
  for_approval: "For approval",
  for_construction: "For construction",
  as_recorded: "As recorded",
  other: "Other",
};

export function purposeLabel(purpose) {
  return PURPOSE_LABELS[purpose] || "Issued";
}

// Attention reason strings — the "why does this appear" copy required for every
// dashboard and overview item.

export function draftRevisionReason() {
  return "Draft revision";
}

export function readyToIssueReason(fileCount) {
  const count = Number(fileCount) || 0;
  const noun = count === 1 ? "file" : "files";
  return `Published with ${count} ${noun} and not yet issued`;
}

export function activeRfiReason(status) {
  if (status === "response_received") return "Response received and awaiting close";
  if (status === "returned_for_clarification")
    return "Returned for clarification";
  return "RFI awaiting response";
}

export function fileUploadedReason(uploadedAt) {
  const date = formatDate(uploadedAt);
  return date ? `File uploaded ${date}` : "File uploaded";
}

export function issuanceCreatedReason(issueNumber) {
  return `${issueNumber} created`;
}

const ACTIVITY_LABELS = {
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

export function describeActivity(action) {
  return ACTIVITY_LABELS[action] || "Project activity";
}

// Records register labels. Record type and both status vocabularies come from
// the controlled domain values; unknown values fall back to the raw string so
// nothing is silently hidden.

const RECORD_TYPE_LABELS = {
  document: "Document",
  drawing: "Drawing",
  specification: "Specification",
  schedule: "Schedule",
  report: "Report",
  correspondence: "Correspondence",
  other: "Other",
};

export function recordTypeLabel(type) {
  return RECORD_TYPE_LABELS[type] || type || "—";
}

const RECORD_STATUS_LABELS = {
  active: "Active",
  archived: "Archived",
};

export function recordStatusLabel(status) {
  return RECORD_STATUS_LABELS[status] || status;
}

const REVISION_STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  superseded: "Superseded",
};

export function revisionStatusLabel(status) {
  return REVISION_STATUS_LABELS[status] || status;
}

export function revisionName(revision) {
  if (!revision) return "";
  const number = Number(revision.revisionNumber);
  const label = String(revision.revisionLabel ?? "").trim();
  const numbered =
    number === 1
      ? "Original"
      : Number.isInteger(number) && number > 1
        ? `Rev ${number - 1}`
        : "Version";
  return label ? `${numbered} · ${label}` : numbered;
}

export function currentRevisionText(currentRevision) {
  if (!currentRevision) return null;
  return revisionName(currentRevision);
}

const FILE_TYPE_LABELS = {
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/jpg": "JPEG image",
  "application/pdf": "PDF document",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "application/vnd.ms-excel": "Excel workbook",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "Excel workbook",
  "application/acad": "DWG drawing",
  "application/dwg": "DWG drawing",
  "application/x-dwg": "DWG drawing",
  "application/vnd.dwg": "DWG drawing",
  "image/vnd.dwg": "DWG drawing",
  "image/x-dwg": "DWG drawing",
};

export function fileTypeLabel(mediaType) {
  return (
    FILE_TYPE_LABELS[
      String(mediaType ?? "")
        .trim()
        .toLowerCase()
    ] || "File"
  );
}

export function actorLabel(event) {
  if (event.actorType === "system") return "System";
  return event.actorDisplayName || "A team member";
}

// RFI register / workspace labels. Statuses are the binding workflow states and
// are always shown as text (never color alone).
const RFI_STATUS_LABELS = {
  draft: "Draft",
  ready_to_issue: "Ready to issue",
  open: "Open",
  response_received: "Response received",
  closed: "Closed",
  returned_for_clarification: "Returned for clarification",
  void: "Void",
};

export function rfiStatusLabel(status) {
  return RFI_STATUS_LABELS[status] || status || "—";
}

// Neutral/attention/success tones for status badges — paired with the text
// label above so status is never conveyed by color alone.
const RFI_STATUS_TONES = {
  draft: "neutral",
  ready_to_issue: "attention",
  open: "attention",
  response_received: "success",
  closed: "neutral",
  returned_for_clarification: "attention",
  void: "neutral",
};

export function rfiStatusTone(status) {
  return RFI_STATUS_TONES[status] || "neutral";
}

const RFI_ATTACHMENT_ROLE_LABELS = {
  supporting_attachment: "Supporting attachment",
  reference_drawing: "Reference drawing",
};

export function rfiAttachmentRoleLabel(role) {
  return RFI_ATTACHMENT_ROLE_LABELS[role] || role;
}

// The official RFI number, or the explicit unnumbered-draft label. The database
// UUID is never used as an identifier here.
export function rfiNumberLabel(rfiNumber) {
  return rfiNumber || "Unnumbered Draft";
}

// A short, safe activity summary line. Never renders raw activity JSON — only
// the mapped action label plus a structured hint (changed fields / role).
export function rfiActivityDetail(event) {
  if (Array.isArray(event.changedFields) && event.changedFields.length) {
    return event.changedFields.map(rfiFieldLabel).join(", ");
  }
  if (event.role) return rfiAttachmentRoleLabel(event.role);
  return "";
}

const RFI_FIELD_LABELS = {
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

export function rfiFieldLabel(field) {
  return RFI_FIELD_LABELS[field] || field;
}
