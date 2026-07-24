/*
 * Configuration and validation for the drawer draft editor's structured
 * fields. Mirrors `public/rfis-view.js`'s `EDITABLE_FIELDS`/`PANEL_ORDER`
 * exactly: same fields, same order, same "wide" (full editor width) markers,
 * same validation rules (Subject and Question required; response date must be
 * an ISO date).
 */

import type { RfiEditableField } from "./types";

export type FieldControlType = "text" | "textarea" | "date" | "contact";

export interface EditableFieldMeta {
  label: string;
  type: FieldControlType;
  wide?: boolean;
}

export const EDITABLE_FIELDS: Record<RfiEditableField, EditableFieldMeta> = {
  subject: { label: "Subject", type: "text", wide: true },
  responsiblePartyId: { label: "Assigned to", type: "contact" },
  requestedResponseDate: { label: "Response due", type: "date" },
  question: { label: "Question", type: "textarea", wide: true },
  contractorSuggestion: {
    label: "Contractor recommendation",
    type: "textarea",
    wide: true,
  },
  drawingReferences: { label: "Drawing references", type: "text" },
  specificationReferences: { label: "Specification references", type: "text" },
};

export const PANEL_ORDER = Object.keys(EDITABLE_FIELDS) as RfiEditableField[];

/** Returns a validation message, or null when the value is acceptable. */
export function validationMessage(
  field: RfiEditableField,
  value: string,
): string | null {
  if ((field === "subject" || field === "question") && !value) {
    return `${EDITABLE_FIELDS[field].label} is required.`;
  }
  if (
    field === "requestedResponseDate" &&
    value &&
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return "Response due must be a valid date.";
  }
  return null;
}
