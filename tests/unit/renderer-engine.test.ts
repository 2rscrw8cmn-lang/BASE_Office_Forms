import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { validateRendererDefinition } from "../../src/rendering/renderer-definition";

interface BaseRuntime {
  render(definition: Record<string, unknown>): string;
  fromTemplate(id: string): Record<string, unknown>;
  templateCatalog: readonly { id: string; label: string }[];
}

function loadRenderer(): BaseRuntime {
  const source = readFileSync("public/engine.js", "utf8");
  const context: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(source, context);
  const runtime: unknown = context.window.BASE;
  if (
    !runtime ||
    typeof runtime !== "object" ||
    !("render" in runtime) ||
    !("fromTemplate" in runtime) ||
    !("templateCatalog" in runtime)
  ) {
    throw new Error("Renderer did not expose the expected BASE contract.");
  }
  const render = runtime.render;
  const fromTemplate = runtime.fromTemplate;
  const templateCatalog = runtime.templateCatalog;
  if (
    typeof render !== "function" ||
    typeof fromTemplate !== "function" ||
    !Array.isArray(templateCatalog)
  ) {
    throw new Error("BASE renderer exports are not callable.");
  }
  return {
    render: render as BaseRuntime["render"],
    fromTemplate: fromTemplate as BaseRuntime["fromTemplate"],
    templateCatalog: templateCatalog as BaseRuntime["templateCatalog"],
  };
}

describe("legacy renderer regression", () => {
  it("keeps the renderer source unchanged in the foundation PR", () => {
    const source = readFileSync("public/engine.js", "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "efafeb2cd4de11ce1db961ea04a3c02c3411a4360faddfcafafcc605e1d9dd99",
    );
  });

  it("continues rendering forms, documents, and packages", () => {
    const renderer = loadRenderer();
    const form = renderer.render({
      kind: "form",
      no: "TEST-1",
      title: "Test form",
      sections: [{ name: "Details", fields: [["Project", 1]] }],
    });
    const document = renderer.render({
      kind: "document",
      no: "TEST-2",
      title: "Test document",
      blocks: [{ type: "prose", heading: "Purpose", paras: ["Text"] }],
    });
    const pkg = renderer.render({
      kind: "package",
      no: "TEST-3",
      title: "Test package",
      documents: [
        {
          def: {
            kind: "document",
            title: "Child",
            blocks: [{ type: "note", text: "Included" }],
          },
        },
      ],
    });

    expect(form).toContain("Test form");
    expect(form).toContain('field-label">Project');
    expect(document).toContain("Purpose");
    expect(pkg).toContain("Package Index");
    expect(pkg).toContain("Included");
  });

  it("keeps every built-in renderer template schema-compatible", () => {
    const renderer = loadRenderer();
    for (const template of renderer.templateCatalog) {
      const result = validateRendererDefinition(
        renderer.fromTemplate(template.id),
      );
      expect(result, template.label).toMatchObject({ valid: true });
    }
  });
});
