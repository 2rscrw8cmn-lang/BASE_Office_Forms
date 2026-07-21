// Shared presentation helpers for the dashboard and project-overview feature
// modules. Human-readable labels for statuses, purposes, attention reasons, and
// activity descriptions live here in one consistent layer so no two views
// derive conflicting text.

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
  if (status === "answered") return "RFI answered and awaiting close";
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
  "rfi.issued": "RFI issued",
  "rfi.responded": "RFI answered",
  "rfi.closed": "RFI closed",
  "rfi.reopened": "RFI reopened",
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

// The current published revision, spoken as "Revision <label|number>" so the
// revision identity is never confused with the record identity. Returns null
// when the record has no current revision.
export function currentRevisionText(currentRevision) {
  if (!currentRevision) return null;
  const name =
    currentRevision.revisionLabel != null &&
    String(currentRevision.revisionLabel).trim() !== ""
      ? currentRevision.revisionLabel
      : currentRevision.revisionNumber;
  return `Revision ${name}`;
}

export function actorLabel(event) {
  if (event.actorType === "system") return "System";
  return event.actorDisplayName || "A team member";
}
