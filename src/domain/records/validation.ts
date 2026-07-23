import {
  RECORD_STATUSES,
  RECORD_TYPES,
  type RecordStatus,
  type RecordType,
  type RecordCreateInput,
} from "./record";
import { RecordArchivedError } from "./errors";
import { isControlledDiscipline } from "../../../public/record-options.js";

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

export function validateRecordMetadata(
  value: {
    recordType: unknown;
    title: unknown;
    description: unknown;
    discipline: unknown;
    source: unknown;
  },
  options: { existingDiscipline?: string | null } = {},
): RecordCreateInput {
  if (typeof value.recordType !== "string" || !isRecordType(value.recordType)) {
    throw new RecordValidationError("recordType is invalid.");
  }
  const discipline = optionalText(value.discipline, "discipline");
  if (
    discipline !== null &&
    !isControlledDiscipline(discipline) &&
    discipline !== options.existingDiscipline
  ) {
    throw new RecordValidationError("discipline is invalid.");
  }
  return {
    recordType: value.recordType,
    title: requiredText(value.title, "title"),
    description: optionalText(value.description, "description"),
    discipline,
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
