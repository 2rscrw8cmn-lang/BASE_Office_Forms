import { describe, expect, it } from "vitest";

import safetyManual from "../../public/safety-manual.json";
import {
  RendererDefinitionValidationError,
  requireValidRendererDefinition,
  validateRendererDefinition,
} from "../../src/rendering/renderer-definition";

describe("renderer definition schema", () => {
  it("accepts the existing safety manual definition", () => {
    expect(validateRendererDefinition(safetyManual)).toMatchObject({
      valid: true,
    });
  });

  it("accepts legacy field tuples and package snapshots", () => {
    const definition = {
      kind: "package",
      title: "Fixture package",
      documents: [
        {
          sourceId: "legacy-document",
          def: {
            kind: "form",
            title: "Legacy form",
            sections: [
              { name: "Details", fields: [["Project", 2]] },
              { name: "Approval", sign: [["Signature", 2]] },
            ],
          },
        },
      ],
    };

    expect(validateRendererDefinition(definition)).toMatchObject({
      valid: true,
    });
  });

  it("reports the nested path for an invalid field width", () => {
    const result = validateRendererDefinition({
      kind: "form",
      title: "Invalid form",
      sections: [{ name: "Details", fields: [["Project", "wide"]] }],
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/sections/0/fields/0/1" }),
      ]),
    );
  });

  it("rejects unsupported blocks instead of silently dropping them", () => {
    const result = validateRendererDefinition({
      kind: "document",
      title: "Invalid document",
      blocks: [{ type: "mystery", text: "This cannot render." }],
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/blocks/0/type" }),
      ]),
    );
  });

  it("throws a clear validation error for API boundaries", () => {
    expect(() => requireValidRendererDefinition({ kind: "document" })).toThrow(
      RendererDefinitionValidationError,
    );
  });
});
