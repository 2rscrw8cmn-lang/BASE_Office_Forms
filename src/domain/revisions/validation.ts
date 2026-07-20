import {
  REVISION_STATUSES,
  type RevisionStatus,
  type RevisionWriteInput,
} from "./revision";

export class RevisionValidationError extends Error {}

export function isRevisionStatus(value: string): value is RevisionStatus {
  return (REVISION_STATUSES as readonly string[]).includes(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RevisionValidationError(`${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RevisionValidationError(`${field} must be text.`);
  }
  return value.trim() || null;
}

export function validateRevisionMetadata(value: {
  revisionLabel: unknown;
  title: unknown;
  description: unknown;
  discipline: unknown;
  source: unknown;
  changeSummary: unknown;
}): RevisionWriteInput {
  return {
    revisionLabel: optionalText(value.revisionLabel, "revisionLabel"),
    title: requiredText(value.title, "title"),
    description: optionalText(value.description, "description"),
    discipline: optionalText(value.discipline, "discipline"),
    source: optionalText(value.source, "source"),
    changeSummary: requiredText(value.changeSummary, "changeSummary"),
  };
}
