import {
  TemplateValidationError,
  validateTemplateMetadata,
} from "../../domain/templates/validation";
import { RequestValidationError } from "./project-schemas";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("A JSON object is required.");
  }
  return value as JsonRecord;
}

export interface TemplatePublishRequest {
  name: string;
  kind: string;
  definition: Record<string, unknown>;
}

export function parseTemplatePublish(
  value: unknown,
  key: string,
): TemplatePublishRequest {
  const source = object(value);
  const allowed = new Set(["name", "kind", "definition"]);
  if (Object.keys(source).some((field) => !allowed.has(field))) {
    throw new RequestValidationError("One or more fields are not allowed.");
  }
  let metadata;
  try {
    metadata = validateTemplateMetadata({
      key,
      name: source.name,
      kind: source.kind,
    });
  } catch (error) {
    if (error instanceof TemplateValidationError) {
      throw new RequestValidationError(error.message);
    }
    throw error;
  }
  if (
    !source.definition ||
    typeof source.definition !== "object" ||
    Array.isArray(source.definition)
  ) {
    throw new RequestValidationError("definition must be an object.");
  }
  return {
    name: metadata.name,
    kind: metadata.kind,
    definition: source.definition as Record<string, unknown>,
  };
}
