import {
  ISSUANCE_PURPOSES,
  type IssuanceIssueInput,
  type IssuancePurpose,
  type ValidatedIssuanceIssueInput,
} from "./issuance";

export class IssuanceValidationError extends Error {}

export const MAX_ISSUANCE_NOTES_LENGTH = 2000;
export const MAX_ISSUANCE_FILE_COUNT = 100;
export const MAX_ISSUANCE_FILE_ID_LENGTH = 128;

export function isIssuancePurpose(value: string): value is IssuancePurpose {
  return (ISSUANCE_PURPOSES as readonly string[]).includes(value);
}

export function validateFileSelection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new IssuanceValidationError("At least one fileId is required.");
  }
  if (value.length > MAX_ISSUANCE_FILE_COUNT) {
    throw new IssuanceValidationError(
      `No more than ${String(MAX_ISSUANCE_FILE_COUNT)} files may be issued at once.`,
    );
  }
  const fileIds = value.map((fileId) => {
    if (typeof fileId !== "string" || !fileId.trim()) {
      throw new IssuanceValidationError("fileIds must contain nonblank IDs.");
    }
    const normalized = fileId.trim();
    if (normalized.length > MAX_ISSUANCE_FILE_ID_LENGTH) {
      throw new IssuanceValidationError("A fileId is too long.");
    }
    return normalized;
  });
  if (new Set(fileIds).size !== fileIds.length) {
    throw new IssuanceValidationError("Duplicate fileIds are not allowed.");
  }
  return fileIds;
}

export function validateIssuanceIssueInput(
  input: IssuanceIssueInput,
): ValidatedIssuanceIssueInput {
  if (typeof input.purpose !== "string" || !isIssuancePurpose(input.purpose)) {
    throw new IssuanceValidationError("purpose is invalid.");
  }
  let notes: string | null;
  if (input.notes === undefined || input.notes === null) {
    notes = null;
  } else if (typeof input.notes !== "string") {
    throw new IssuanceValidationError("notes must be text.");
  } else {
    notes = input.notes.trim() || null;
  }
  if (notes && notes.length > MAX_ISSUANCE_NOTES_LENGTH) {
    throw new IssuanceValidationError(
      `notes must not exceed ${String(MAX_ISSUANCE_NOTES_LENGTH)} characters.`,
    );
  }
  if (input.purpose === "other" && !notes) {
    throw new IssuanceValidationError(
      "notes are required when purpose is other.",
    );
  }
  if (!input.correlationId.trim()) {
    throw new IssuanceValidationError("correlationId is required.");
  }
  return {
    purpose: input.purpose,
    notes,
    fileIds: validateFileSelection(input.fileIds),
    correlationId: input.correlationId,
  };
}
