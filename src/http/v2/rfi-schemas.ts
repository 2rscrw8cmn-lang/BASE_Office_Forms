import type { RfiWriteInput } from "../../domain/rfis/rfi";
import { isRfiAttachmentRole } from "../../domain/rfis/rfi";
import type { RfiIssueRequest } from "../../domain/rfis/official-issue";
import type { RfiResponseWriteInput } from "../../infrastructure/db/d1/rfi-responses-repository";
import type { RfiAttachmentRole } from "../../domain/rfis/rfi";
import { RequestValidationError } from "./project-schemas";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("A JSON object is required.");
  }
  return value as JsonRecord;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be text.`);
  }
  return value.trim() || null;
}

function optionalDate(value: unknown, field: string): string | null {
  const date = optionalText(value, field);
  if (date && !isIsoDate(date)) {
    throw new RequestValidationError(`${field} must be an ISO date.`);
  }
  return date;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// A field is taken from the request when present, otherwise from the fallback
// (the current persisted value) so a PATCH is a genuine partial update.
function resolve<T>(
  source: JsonRecord,
  key: string,
  fallback: RfiWriteInput | undefined,
  parse: () => T,
): T {
  if (source[key] === undefined && fallback) {
    return fallback[key as keyof RfiWriteInput] as T;
  }
  return parse();
}

function rfiInput(value: unknown, fallback?: RfiWriteInput): RfiWriteInput {
  const source = object(value);
  return {
    subject: resolve(source, "subject", fallback, () =>
      requiredText(source.subject, "subject"),
    ),
    question: resolve(source, "question", fallback, () =>
      requiredText(source.question, "question"),
    ),
    contractorSuggestion: resolve(
      source,
      "contractorSuggestion",
      fallback,
      () => optionalText(source.contractorSuggestion, "contractorSuggestion"),
    ),
    drawingReferences: resolve(source, "drawingReferences", fallback, () =>
      optionalText(source.drawingReferences, "drawingReferences"),
    ),
    specificationReferences: resolve(
      source,
      "specificationReferences",
      fallback,
      () =>
        optionalText(source.specificationReferences, "specificationReferences"),
    ),
    responsiblePartyId: resolve(source, "responsiblePartyId", fallback, () =>
      optionalText(source.responsiblePartyId, "responsiblePartyId"),
    ),
    submittedBy: resolve(source, "submittedBy", fallback, () =>
      optionalText(source.submittedBy, "submittedBy"),
    ),
    requestedResponseDate: resolve(
      source,
      "requestedResponseDate",
      fallback,
      () => optionalDate(source.requestedResponseDate, "requestedResponseDate"),
    ),
    costImpact: resolve(source, "costImpact", fallback, () =>
      optionalText(source.costImpact, "costImpact"),
    ),
    scheduleImpact: resolve(source, "scheduleImpact", fallback, () =>
      optionalText(source.scheduleImpact, "scheduleImpact"),
    ),
  };
}

export function parseRfiCreate(value: unknown): RfiWriteInput {
  return rfiInput(value);
}

export interface ParsedRfiUpdate {
  input: RfiWriteInput;
  lockVersion: number;
}

export function parseRfiUpdate(
  value: unknown,
  current: RfiWriteInput,
): ParsedRfiUpdate {
  const source = object(value);
  const fieldKeys = Object.keys(source).filter((key) => key !== "lockVersion");
  if (fieldKeys.length === 0) {
    throw new RequestValidationError("At least one field is required.");
  }
  const fields: JsonRecord = {};
  for (const key of fieldKeys) fields[key] = source[key];
  return {
    input: rfiInput(fields, current),
    lockVersion: parseLockVersion(source.lockVersion),
  };
}

export function parseLockVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RequestValidationError(
      "A positive integer lockVersion is required for concurrency safety.",
    );
  }
  return value;
}

export function parseRfiResponse(value: unknown): RfiResponseWriteInput {
  const source = object(value);
  return {
    response: requiredText(source.response, "response"),
    respondedBy: optionalText(source.respondedBy, "respondedBy"),
  };
}

function uniqueIds(value: unknown, field: string, required: boolean): string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new RequestValidationError(
      `${field} must be ${required ? "a non-empty" : "an"} array of IDs.`,
    );
  }
  const ids = value.map((item) => requiredText(item, field));
  if (new Set(ids).size !== ids.length) {
    throw new RequestValidationError(`${field} must not contain duplicates.`);
  }
  return ids;
}

export function parseRfiIssue(value: unknown): RfiIssueRequest {
  const source = object(value);
  const allowed = new Set([
    "recipientProjectContactIds",
    "ccProjectContactIds",
    "responseDueDate",
    "includedFileIds",
    "deliveryMode",
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  const recipients = uniqueIds(
    source.recipientProjectContactIds,
    "recipientProjectContactIds",
    true,
  );
  const cc = uniqueIds(
    source.ccProjectContactIds,
    "ccProjectContactIds",
    false,
  );
  if (cc.some((id) => recipients.includes(id))) {
    throw new RequestValidationError(
      "A project contact cannot be both a recipient and a CC.",
    );
  }
  const responseDueDate = requiredText(
    source.responseDueDate,
    "responseDueDate",
  );
  if (!isIsoDate(responseDueDate)) {
    throw new RequestValidationError("responseDueDate must be an ISO date.");
  }
  if (source.deliveryMode !== "record_only") {
    throw new RequestValidationError(
      "deliveryMode must be record_only for this release.",
    );
  }
  return {
    recipientProjectContactIds: recipients,
    ccProjectContactIds: cc,
    responseDueDate,
    includedFileIds: uniqueIds(
      source.includedFileIds,
      "includedFileIds",
      false,
    ),
    deliveryMode: "record_only",
  };
}

export interface ParsedRfiAttachmentUpload {
  role: RfiAttachmentRole;
  originalFilename: string;
  mediaType: string;
  content: ArrayBuffer;
}

/**
 * Parses the RFI-attachment multipart envelope: exactly one "file" field plus a
 * required "role" field (supporting_attachment | reference_drawing). Substantive
 * file checks remain the domain layer's job via `validateFileUpload`.
 */
export async function parseRfiAttachmentUpload(
  request: Request,
): Promise<ParsedRfiAttachmentUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new RequestValidationError("A multipart/form-data body is required.");
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new RequestValidationError(
      "The multipart request body could not be parsed.",
    );
  }
  const fileEntries = formData.getAll("file");
  if (fileEntries.length === 0) {
    throw new RequestValidationError("A file field is required.");
  }
  if (fileEntries.length > 1) {
    throw new RequestValidationError("Only one file field is allowed.");
  }
  const value = fileEntries[0];
  if (!(value instanceof File)) {
    throw new RequestValidationError("The file field must be a file.");
  }
  const roleValue = formData.get("role");
  if (typeof roleValue !== "string" || !isRfiAttachmentRole(roleValue)) {
    throw new RequestValidationError(
      "role must be supporting_attachment or reference_drawing.",
    );
  }
  return {
    role: roleValue,
    originalFilename: value.name,
    mediaType: value.type,
    content: await value.arrayBuffer(),
  };
}
