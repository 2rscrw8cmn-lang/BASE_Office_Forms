import type { RfiWriteInput } from "../../domain/rfis/rfi";
import type { RfiResponseWriteInput } from "../../infrastructure/db/d1/rfi-responses-repository";
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
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RequestValidationError(`${field} must be an ISO date.`);
  }
  return date;
}

function rfiInput(value: unknown, fallback?: RfiWriteInput): RfiWriteInput {
  const source = object(value);
  return {
    title:
      source.title === undefined && fallback
        ? fallback.title
        : requiredText(source.title, "title"),
    question:
      source.question === undefined && fallback
        ? fallback.question
        : requiredText(source.question, "question"),
    suggestedResolution:
      source.suggestedResolution === undefined && fallback
        ? fallback.suggestedResolution
        : optionalText(source.suggestedResolution, "suggestedResolution"),
    submittedBy:
      source.submittedBy === undefined && fallback
        ? fallback.submittedBy
        : optionalText(source.submittedBy, "submittedBy"),
    assignedTo:
      source.assignedTo === undefined && fallback
        ? fallback.assignedTo
        : optionalText(source.assignedTo, "assignedTo"),
    dueDate:
      source.dueDate === undefined && fallback
        ? fallback.dueDate
        : optionalDate(source.dueDate, "dueDate"),
    costImpact:
      source.costImpact === undefined && fallback
        ? fallback.costImpact
        : optionalText(source.costImpact, "costImpact"),
    scheduleImpact:
      source.scheduleImpact === undefined && fallback
        ? fallback.scheduleImpact
        : optionalText(source.scheduleImpact, "scheduleImpact"),
  };
}

export function parseRfiCreate(value: unknown): RfiWriteInput {
  return rfiInput(value);
}

export function parseRfiUpdate(
  value: unknown,
  current: RfiWriteInput,
): RfiWriteInput {
  const source = object(value);
  if (Object.keys(source).length === 0) {
    throw new RequestValidationError("At least one field is required.");
  }
  return rfiInput(source, current);
}

export function parseRfiResponse(value: unknown): RfiResponseWriteInput {
  const source = object(value);
  return {
    response: requiredText(source.response, "response"),
    respondedBy: optionalText(source.respondedBy, "respondedBy"),
  };
}
