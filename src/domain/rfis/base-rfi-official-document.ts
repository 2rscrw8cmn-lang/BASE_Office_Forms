import { buildBaseRfiTemplateDefinition } from "./base-rfi-template";

export interface BaseRfiOfficialField {
  id: string;
  label: string;
  width: 6 | 12;
  multiline: boolean;
  minimumHeight: number;
}

export interface BaseRfiOfficialSection {
  name: string;
  fields: BaseRfiOfficialField[];
}

export interface BaseRfiOfficialDocumentPlan {
  compilerVersion: "base-rfi-official-document/v1";
  brand: string;
  title: string;
  documentType: "RFI";
  typeLabel: "RFI";
  showHeader: true;
  showControl: true;
  sections: BaseRfiOfficialSection[];
  footnotes: string[];
}

export class UnsupportedBaseRfiTemplateError extends Error {
  constructor() {
    super(
      "The published template is not supported by the BASE RFI official-document compiler.",
    );
    this.name = "UnsupportedBaseRfiTemplateError";
  }
}

interface SupportedDefinition {
  org: string;
  title: string;
  documentType: "RFI";
  typeLabel: "RFI";
  showHeader: true;
  showControl: true;
  sections: {
    name: string;
    fields: {
      id: string;
      label: string;
      w: 6 | 12;
      multiline?: boolean;
      h?: number;
    }[];
  }[];
  footnotes: string[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Strict compiler for the one renderer definition Slice 2A supports. This is
 * intentionally not a general renderer-schema implementation: any meaningful
 * published-template change must either get a new compiler version or be
 * rejected before an official artifact can be produced.
 */
export function compileBaseRfiOfficialDocument(
  definition: Record<string, unknown>,
): BaseRfiOfficialDocumentPlan {
  const supported = buildBaseRfiTemplateDefinition();
  if (stable(definition) !== stable(supported)) {
    throw new UnsupportedBaseRfiTemplateError();
  }
  const exact = supported as unknown as SupportedDefinition;

  return {
    compilerVersion: "base-rfi-official-document/v1",
    brand: exact.org,
    title: exact.title,
    documentType: exact.documentType,
    typeLabel: exact.typeLabel,
    showHeader: exact.showHeader,
    showControl: exact.showControl,
    sections: exact.sections.map((section) => ({
      name: section.name,
      fields: section.fields.map((field) => ({
        id: field.id,
        label: field.label,
        width: field.w,
        multiline: field.multiline ?? false,
        minimumHeight: field.h ?? 0,
      })),
    })),
    footnotes: [...exact.footnotes],
  };
}
