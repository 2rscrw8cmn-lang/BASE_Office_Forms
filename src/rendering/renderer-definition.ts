import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";

import rendererDefinitionSchema from "../../schemas/renderer-definition.v1.schema.json";

export type RendererDefinitionKind = "form" | "document" | "package";

export interface RendererDefinition {
  kind: RendererDefinitionKind;
  title: string;
  [key: string]: unknown;
}

export interface RendererDefinitionValidationIssue {
  path: string;
  keyword: string;
  message: string;
}

export type RendererDefinitionValidationResult =
  | { valid: true; definition: RendererDefinition; errors: [] }
  | { valid: false; errors: RendererDefinitionValidationIssue[] };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // Required keys are intentionally composed through allOf/if/then branches.
  strictRequired: false,
  // Legacy field tuples validly contain between one and five prefix items.
  strictTuples: false,
});
const validate = ajv.compile(rendererDefinitionSchema);

function issuePath(error: ErrorObject): string {
  if (error.keyword === "required" && "missingProperty" in error.params) {
    return `${error.instancePath}/${String(error.params.missingProperty)}`;
  }

  return error.instancePath || "/";
}

function validationIssue(
  error: ErrorObject,
): RendererDefinitionValidationIssue {
  return {
    path: issuePath(error),
    keyword: error.keyword,
    message: error.message ?? "is invalid",
  };
}

export function validateRendererDefinition(
  value: unknown,
): RendererDefinitionValidationResult {
  if (validate(value)) {
    return { valid: true, definition: value as RendererDefinition, errors: [] };
  }

  return {
    valid: false,
    errors: (validate.errors ?? []).map(validationIssue),
  };
}

export class RendererDefinitionValidationError extends Error {
  readonly issues: RendererDefinitionValidationIssue[];

  constructor(issues: RendererDefinitionValidationIssue[]) {
    const firstIssue = issues.at(0);
    const detail = firstIssue
      ? ` ${firstIssue.path} ${firstIssue.message}.`
      : "";
    super(`Renderer definition is invalid.${detail}`);
    this.name = "RendererDefinitionValidationError";
    this.issues = issues;
  }
}

export function requireValidRendererDefinition(
  value: unknown,
): RendererDefinition {
  const result = validateRendererDefinition(value);
  if (!result.valid) throw new RendererDefinitionValidationError(result.errors);
  return result.definition;
}
