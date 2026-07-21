import { describe, expect, it } from "vitest";

import { TEMPLATE_KINDS } from "../../src/domain/templates/template";
import {
  TemplateValidationError,
  validateTemplateMetadata,
} from "../../src/domain/templates/validation";

describe("template domain validation", () => {
  it("supports only form, document, and package kinds", () => {
    expect(TEMPLATE_KINDS).toEqual(["form", "document", "package"]);
  });

  it("normalizes valid metadata and trims text fields", () => {
    expect(
      validateTemplateMetadata({
        key: "submittal",
        name: "  Submittal / Transmittal  ",
        kind: "form",
      }),
    ).toEqual({
      key: "submittal",
      name: "Submittal / Transmittal",
      kind: "form",
    });
  });

  it("rejects a key with anything other than lowercase letters, numbers, and hyphens", () => {
    expect(() =>
      validateTemplateMetadata({ key: "Submittal", name: "X", kind: "form" }),
    ).toThrow(TemplateValidationError);
    expect(() =>
      validateTemplateMetadata({ key: "submittal_1", name: "X", kind: "form" }),
    ).toThrow(TemplateValidationError);
    expect(() =>
      validateTemplateMetadata({ key: "-submittal", name: "X", kind: "form" }),
    ).toThrow(TemplateValidationError);
    expect(() =>
      validateTemplateMetadata({ key: "", name: "X", kind: "form" }),
    ).toThrow(TemplateValidationError);
  });

  it("rejects a blank name", () => {
    expect(() =>
      validateTemplateMetadata({ key: "submittal", name: "   ", kind: "form" }),
    ).toThrow(TemplateValidationError);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      validateTemplateMetadata({
        key: "submittal",
        name: "X",
        kind: "spreadsheet",
      }),
    ).toThrow(TemplateValidationError);
  });
});
