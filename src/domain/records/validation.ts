import {
  RECORD_STATUSES,
  RECORD_TYPES,
  type RecordStatus,
  type RecordType,
  type RecordWriteInput,
} from "./record";
import { RecordArchivedError } from "./errors";

export class RecordValidationError extends Error {}

export function isRecordType(value: string): value is RecordType {
  return (RECORD_TYPES as readonly string[]).includes(value);
}

export function isRecordStatus(value: string): value is RecordStatus {
  return (RECORD_STATUSES as readonly string[]).includes(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RecordValidationError(`${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RecordValidationError(`${field} must be text.`);
  }
  return value.trim() || null;
}

export function validateRecordMetadata(value: {
  recordType: unknown;
  recordNumber: unknown;
  title: unknown;
  description: unknown;
  discipline: unknown;
  source: unknown;
}): RecordWriteInput {
  if (typeof value.recordType !== "string" || !isRecordType(value.recordType)) {
    throw new RecordValidationError("recordType is invalid.");
  }
  let recordNumber: string | null;
  if (value.recordNumber === undefined || value.recordNumber === null) {
    recordNumber = null;
  } else if (typeof value.recordNumber !== "string") {
    throw new RecordValidationError("recordNumber must be text.");
  } else {
    recordNumber = value.recordNumber.trim();
    if (!recordNumber) {
      throw new RecordValidationError("recordNumber must not be empty.");
    }
  }
  return {
    recordType: value.recordType,
    recordNumber,
    title: requiredText(value.title, "title"),
    description: optionalText(value.description, "description"),
    discipline: optionalText(value.discipline, "discipline"),
    source: optionalText(value.source, "source"),
  };
}

export function assertRecordIsActive(
  status: RecordStatus,
  action: "be edited" | "be archived",
): void {
  if (status !== "active") {
    throw new RecordArchivedError(action);
  }
}
