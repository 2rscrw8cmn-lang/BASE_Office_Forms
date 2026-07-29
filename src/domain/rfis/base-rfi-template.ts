// The approved BASE RFI template. Project users fill an RFI *from* this template
// but never edit its structure, labels, branding or document-control layout —
// that remains a global Studio concern (docs/UX_RFI_SPEC.md §"Template vs
// record"). Until full Phase-3 template governance exists, this definition is
// the narrow binding boundary: RFI drafts bind to the published version of the
// `base-rfi` template, seeded per organization on first use.
export const BASE_RFI_TEMPLATE_KEY = "base-rfi";
export const BASE_RFI_TEMPLATE_NAME = "BASE Request for Information";

// A form-kind renderer definition (validates against
// schemas/renderer-definition.v1.schema.json). Values are bound from the RFI
// record and project at render time; the structure here is fixed.
export function buildBaseRfiTemplateDefinition(): Record<string, unknown> {
  return structuredClone(definition);
}
import definition from "./base-rfi-template-definition.json";
