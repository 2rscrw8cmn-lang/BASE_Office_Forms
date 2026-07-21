import { TEMPLATE_KINDS, type TemplateKind } from "./template";

export class TemplateValidationError extends Error {}

export function isTemplateKind(value: string): value is TemplateKind {
  return (TEMPLATE_KINDS as readonly string[]).includes(value);
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface TemplateMetadata {
  key: string;
  name: string;
  kind: TemplateKind;
}

export function validateTemplateMetadata(value: {
  key: unknown;
  name: unknown;
  kind: unknown;
}): TemplateMetadata {
  if (typeof value.key !== "string" || !KEY_PATTERN.test(value.key.trim())) {
    throw new TemplateValidationError(
      "key must contain only lowercase letters, numbers, and hyphens.",
    );
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new TemplateValidationError("name is required.");
  }
  if (typeof value.kind !== "string" || !isTemplateKind(value.kind)) {
    throw new TemplateValidationError("kind is invalid.");
  }
  return { key: value.key.trim(), name: value.name.trim(), kind: value.kind };
}
