export class FileValidationError extends Error {}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const MEDIA_TYPE_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/;

export function isValidMediaType(value: string): boolean {
  return MEDIA_TYPE_PATTERN.test(value);
}

export interface ValidatedFileUpload {
  originalFilename: string;
  mediaType: string;
}

export function validateFileUpload(value: {
  originalFilename: unknown;
  mediaType: unknown;
  byteSize: number;
}): ValidatedFileUpload {
  if (
    typeof value.originalFilename !== "string" ||
    !value.originalFilename.trim()
  ) {
    throw new FileValidationError("A filename is required.");
  }
  if (typeof value.mediaType !== "string" || !value.mediaType.trim()) {
    throw new FileValidationError("A media type is required.");
  }
  const mediaType = value.mediaType.trim();
  if (!isValidMediaType(mediaType)) {
    throw new FileValidationError("mediaType is invalid.");
  }
  if (!Number.isFinite(value.byteSize) || value.byteSize <= 0) {
    throw new FileValidationError("The uploaded file must not be empty.");
  }
  if (value.byteSize > MAX_FILE_BYTES) {
    throw new FileValidationError("The uploaded file exceeds the 50 MB limit.");
  }
  return { originalFilename: value.originalFilename.trim(), mediaType };
}

// Intentionally strips control characters (including CR/LF) to block
// Content-Disposition header injection.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g;

/**
 * Produces a filename safe to embed in a Content-Disposition header value:
 * strips any directory components, control characters (blocking CRLF header
 * injection), and quotes, while leaving ordinary filename characters intact.
 */
export function sanitizeContentDispositionFilename(filename: string): string {
  const withoutPath = filename.replace(/^.*[/\\]/, "");
  const withoutControl = withoutPath.replace(CONTROL_CHARACTERS, "");
  const withoutQuotes = withoutControl.replace(/"/g, "'");
  const safe = withoutQuotes.trim() || "file";
  return safe.length > 255 ? safe.slice(0, 255) : safe;
}

export function buildContentDisposition(filename: string): string {
  const safe = sanitizeContentDispositionFilename(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
