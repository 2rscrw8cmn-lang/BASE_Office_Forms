import type { IssuanceIssueInput } from "../../domain/issuances/issuance";
import { RequestValidationError } from "./project-schemas";

export function parseIssuanceCreate(
  value: unknown,
): Omit<IssuanceIssueInput, "correlationId"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("A JSON object is required.");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["purpose", "notes", "fileIds"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  return {
    purpose: source.purpose,
    notes: source.notes,
    fileIds: source.fileIds,
  };
}
