/*
 * Presentational formatting for the Record and Revision workspaces.
 *
 * Vocabulary is never re-invented: revision naming, discipline labels, record
 * type labels, and date presentation are re-exported from the Document
 * Register's `format.ts`, so a register row and its workspace can never
 * disagree about what a revision is called. Record and Revision status labels
 * come from the shared component vocabularies through the status badges.
 *
 * `MEDIA_TYPE_LABELS` is ported from `public/app-format.js` (the same source the
 * legacy detail views used) rather than imported, matching the UI-5 approach for
 * ported presentation vocabulary. `record-workspace-format.test.ts` asserts
 * label-for-label parity against the legacy module, so the two cannot drift.
 */

export {
  disciplineLabel,
  DISCIPLINES,
  formatRecordDate as formatDate,
  isValidTimestamp,
  recordTypeLabel,
  RECORD_TYPE_OPTIONS,
  revisionName,
} from "../records/format";

const MEDIA_TYPE_LABELS: Record<string, string> = {
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

/** Readable media-type label; an unrecognised type stays an honest "File". */
export function mediaTypeLabel(mediaType: string | null | undefined): string {
  const key = (mediaType ?? "").trim().toLowerCase();
  return MEDIA_TYPE_LABELS[key] ?? "File";
}

/**
 * Human file size. Matches the legacy detail views byte for byte, so the same
 * file does not appear to change size during the migration.
 */
export function formatBytes(value: number | null | undefined): string {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileCountLabel(count: number): string {
  return `${String(count)} file${count === 1 ? "" : "s"}`;
}

/**
 * Issuance presentation. "Not issued" is an honest absence, never an implied
 * pending state -- issuance itself remains outside UI-7's scope.
 */
export function issuanceLabel(count: number | null | undefined): string {
  const issuances = Number(count) || 0;
  return issuances
    ? `${String(issuances)} issuance${issuances === 1 ? "" : "s"}`
    : "Not issued";
}
