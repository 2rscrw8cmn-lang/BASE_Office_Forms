import type { RevisionWriteInput } from "../../domain/revisions/revision";
import {
  RevisionValidationError,
  validateRevisionMetadata,
} from "../../domain/revisions/validation";
import { RequestValidationError } from "./project-schemas";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("A JSON object is required.");
  }
  return value as JsonRecord;
}

export interface RevisionParentDefaults {
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
}

export function parseRevisionCreate(
  value: unknown,
  parent: RevisionParentDefaults,
): RevisionWriteInput {
  const source = object(value);
  const allowed = new Set([
    "revisionLabel",
    "title",
    "description",
    "discipline",
    "source",
    "changeSummary",
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  try {
    return validateRevisionMetadata({
      revisionLabel: source.revisionLabel,
      title: source.title === undefined ? parent.title : source.title,
      description:
        source.description === undefined
          ? parent.description
          : source.description,
      discipline:
        source.discipline === undefined ? parent.discipline : source.discipline,
      source: source.source === undefined ? parent.source : source.source,
      changeSummary: source.changeSummary,
    });
  } catch (error) {
    if (error instanceof RevisionValidationError) {
      throw new RequestValidationError(error.message);
    }
    throw error;
  }
}
