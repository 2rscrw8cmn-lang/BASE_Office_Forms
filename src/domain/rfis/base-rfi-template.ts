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
  return {
    kind: "form",
    title: "Request for Information",
    documentType: "RFI",
    typeLabel: "RFI",
    org: "BASE Construction",
    showHeader: true,
    showControl: true,
    sections: [
      {
        name: "RFI",
        fields: [
          { label: "Subject", w: 12 },
          { label: "Responsible Party", w: 6 },
          { label: "Requested Response Date", w: 6 },
        ],
      },
      {
        name: "Question",
        fields: [{ label: "Question", w: 12, multiline: true, h: 28 }],
      },
      {
        name: "Contractor Suggestion",
        fields: [
          { label: "Contractor Suggestion", w: 12, multiline: true, h: 20 },
        ],
      },
      {
        name: "References",
        fields: [
          { label: "Drawing References", w: 6 },
          { label: "Specification References", w: 6 },
        ],
      },
      {
        name: "Response",
        fields: [{ label: "Response", w: 12, multiline: true, h: 28 }],
      },
    ],
    footnotes: [
      "This RFI is a controlled project record. The official number is assigned when the RFI is issued.",
    ],
  };
}
