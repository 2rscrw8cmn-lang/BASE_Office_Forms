import type {
  ProjectAddress,
  ProjectStatus,
} from "../../domain/projects/project";
import { isProjectStatus } from "../../application/projects/project-service";
import type { ProjectWriteInput } from "../../infrastructure/db/d1/projects-repository";
import type { ProjectContactWriteInput } from "../../infrastructure/db/d1/project-contacts-repository";

export class RequestValidationError extends Error {}

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
  if (typeof value !== "string")
    throw new RequestValidationError(`${field} must be text.`);
  return value.trim() || null;
}

function optionalDate(value: unknown, field: string): string | null {
  const date = optionalText(value, field);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RequestValidationError(`${field} must be an ISO date.`);
  }
  return date;
}

function address(value: unknown, fallback?: ProjectAddress): ProjectAddress {
  if (value === null) {
    return {
      line1: null,
      line2: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
    };
  }
  const source = value === undefined ? {} : object(value);
  return {
    line1:
      source.line1 === undefined
        ? (fallback?.line1 ?? null)
        : optionalText(source.line1, "address.line1"),
    line2:
      source.line2 === undefined
        ? (fallback?.line2 ?? null)
        : optionalText(source.line2, "address.line2"),
    city:
      source.city === undefined
        ? (fallback?.city ?? null)
        : optionalText(source.city, "address.city"),
    region:
      source.region === undefined
        ? (fallback?.region ?? null)
        : optionalText(source.region, "address.region"),
    postalCode:
      source.postalCode === undefined
        ? (fallback?.postalCode ?? null)
        : optionalText(source.postalCode, "address.postalCode"),
    country:
      source.country === undefined
        ? (fallback?.country ?? null)
        : optionalText(source.country, "address.country"),
  };
}

function projectStatus(value: unknown, fallback: ProjectStatus): ProjectStatus {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !isProjectStatus(value)) {
    throw new RequestValidationError("status is invalid.");
  }
  return value;
}

function projectInput(
  value: unknown,
  fallback?: ProjectWriteInput,
): ProjectWriteInput {
  const source = object(value);
  return {
    projectNumber:
      source.projectNumber === undefined && fallback
        ? fallback.projectNumber
        : requiredText(source.projectNumber, "projectNumber"),
    name:
      source.name === undefined && fallback
        ? fallback.name
        : requiredText(source.name, "name"),
    status: projectStatus(source.status, fallback?.status ?? "planning"),
    description:
      source.description === undefined && fallback
        ? fallback.description
        : optionalText(source.description, "description"),
    address:
      source.address === undefined && fallback
        ? fallback.address
        : address(source.address, fallback?.address),
    timezone:
      source.timezone === undefined && fallback
        ? fallback.timezone
        : requiredText(source.timezone ?? "America/New_York", "timezone"),
    startDate:
      source.startDate === undefined && fallback
        ? fallback.startDate
        : optionalDate(source.startDate, "startDate"),
    targetCompletionDate:
      source.targetCompletionDate === undefined && fallback
        ? fallback.targetCompletionDate
        : optionalDate(source.targetCompletionDate, "targetCompletionDate"),
  };
}

export function parseProjectCreate(value: unknown): ProjectWriteInput {
  return projectInput(value);
}

export function parseProjectUpdate(
  value: unknown,
  current: ProjectWriteInput,
): ProjectWriteInput {
  const source = object(value);
  if (Object.keys(source).length === 0)
    throw new RequestValidationError("At least one field is required.");
  return projectInput(source, current);
}

function contactInput(
  value: unknown,
  fallback?: ProjectContactWriteInput,
): ProjectContactWriteInput {
  const source = object(value);
  const email =
    source.email === undefined && fallback
      ? fallback.email
      : optionalText(source.email, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestValidationError("email must be valid.");
  }
  return {
    companyName:
      source.companyName === undefined && fallback
        ? fallback.companyName
        : optionalText(source.companyName, "companyName"),
    contactName:
      source.contactName === undefined && fallback
        ? fallback.contactName
        : requiredText(source.contactName, "contactName"),
    contactType:
      source.contactType === undefined && fallback
        ? fallback.contactType
        : requiredText(source.contactType, "contactType"),
    email: email?.toLowerCase() ?? null,
    phone:
      source.phone === undefined && fallback
        ? fallback.phone
        : optionalText(source.phone, "phone"),
    address:
      source.address === undefined && fallback
        ? fallback.address
        : address(source.address, fallback?.address),
    notes:
      source.notes === undefined && fallback
        ? fallback.notes
        : optionalText(source.notes, "notes"),
  };
}

export function parseProjectContactCreate(
  value: unknown,
): ProjectContactWriteInput {
  return contactInput(value);
}

export function parseProjectContactUpdate(
  value: unknown,
  current: ProjectContactWriteInput,
): ProjectContactWriteInput {
  const source = object(value);
  if (Object.keys(source).length === 0)
    throw new RequestValidationError("At least one field is required.");
  return contactInput(source, current);
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }
}
