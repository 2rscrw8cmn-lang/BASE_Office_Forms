import type {
  RecordCreateInput,
  RecordUpdateInput,
} from "../../domain/records/record";
import {
  RecordValidationError,
  validateRecordMetadata,
} from "../../domain/records/validation";
import { RequestValidationError } from "./project-schemas";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("A JSON object is required.");
  }
  return value as JsonRecord;
}

function recordInput(
  value: unknown,
  fallback?: RecordCreateInput,
): RecordCreateInput {
  const source = object(value);
  try {
    return validateRecordMetadata(
      {
        recordType:
          source.recordType === undefined && fallback
            ? fallback.recordType
            : source.recordType,
        title:
          source.title === undefined && fallback
            ? fallback.title
            : source.title,
        description:
          source.description === undefined && fallback
            ? fallback.description
            : source.description,
        discipline:
          source.discipline === undefined && fallback
            ? fallback.discipline
            : source.discipline,
        source:
          source.source === undefined && fallback
            ? fallback.source
            : source.source,
      },
      { existingDiscipline: fallback?.discipline },
    );
  } catch (error) {
    if (error instanceof RecordValidationError)
      throw new RequestValidationError(error.message);
    throw error;
  }
}

export function parseRecordCreate(value: unknown): RecordCreateInput {
  const source = object(value);
  const allowed = new Set([
    "recordType",
    "title",
    "description",
    "discipline",
    "source",
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  return recordInput(source);
}

export function parseRecordUpdate(
  value: unknown,
  current: RecordCreateInput,
): RecordUpdateInput {
  const source = object(value);
  if (Object.keys(source).length === 0) {
    throw new RequestValidationError("At least one field is required.");
  }
  const allowed = new Set(["title", "description", "discipline", "source"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  const metadata = recordInput(source, current);
  return {
    title: metadata.title,
    description: metadata.description,
    discipline: metadata.discipline,
    source: metadata.source,
  };
}

export function parseIncludeArchived(value: string | null): boolean {
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new RequestValidationError("includeArchived must be true or false.");
}
