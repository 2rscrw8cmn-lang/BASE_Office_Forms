import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { validateRendererDefinition } from "../../src/rendering/renderer-definition";

interface FillTarget {
  prefix: string;
  form: { no?: string; _schema: { id: string; type: string; label: string }[] };
}

interface BaseRuntime {
  render(
    definition: Record<string, unknown>,
    options?: { fill?: boolean },
  ): string;
  formFillTargets(definition: Record<string, unknown>): FillTarget[];
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
    !("formFillTargets" in runtime) ||
    !("fromTemplate" in runtime) ||
    !("templateCatalog" in runtime)
  ) {
    throw new Error("Renderer did not expose the expected BASE contract.");
  }
  const render = runtime.render;
  const formFillTargets = runtime.formFillTargets;
  const fromTemplate = runtime.fromTemplate;
  const templateCatalog = runtime.templateCatalog;
  if (
    typeof render !== "function" ||
    typeof formFillTargets !== "function" ||
    typeof fromTemplate !== "function" ||
    !Array.isArray(templateCatalog)
  ) {
    throw new Error("BASE renderer exports are not callable.");
  }
  return {
    render: render as BaseRuntime["render"],
    formFillTargets: formFillTargets as BaseRuntime["formFillTargets"],
    fromTemplate: fromTemplate as BaseRuntime["fromTemplate"],
    templateCatalog: templateCatalog as BaseRuntime["templateCatalog"],
  };
}

describe("renderer engine", () => {
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

  it("renders forms as interactive web forms by default", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "FILL-1",
      title: "Fill test",
      sections: [
        {
          name: "Details",
          fields: [
            { label: "Short answer", w: 1, height: 46 },
            { label: "Long answer", w: 1, height: 90, multiline: true },
          ],
        },
        { name: "Pick one", single: true, checks: ["Option A", "Option B"] },
        { name: "Pick any", checks: ["Red", "Blue"] },
      ],
    });

    expect(html).toContain('<input class="fin" name="short_answer">');
    expect(html).toContain('<textarea class="ftx" name="long_answer">');
    expect(html).toContain('type="radio" name="pick_one"');
    expect(html).toContain('type="checkbox" name="pick_any"');
  });

  it("suppresses interactive controls when fill is explicitly disabled", () => {
    const renderer = loadRenderer();
    const html = renderer.render(
      {
        kind: "form",
        no: "FILL-2",
        title: "Static preview",
        sections: [{ name: "Details", fields: [{ label: "Field", w: 1 }] }],
      },
      { fill: false },
    );

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });

  it("never makes standalone document rendering interactive", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "document",
      no: "DOC-FILL",
      title: "Document with form-like blocks",
      layout: { cover: false },
      blocks: [
        { type: "fields", heading: "Info", fields: [{ label: "Field", w: 1 }] },
        { type: "checklist", heading: "Checklist", items: ["Item one"] },
      ],
    });

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });

  it("makes nested forms inside a package fillable by default, with a namePrefix, while leaving nested documents static", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "package",
      no: "PKG-FILL",
      title: "Fillable package",
      documents: [
        {
          def: {
            kind: "document",
            no: "PKG-FILL-A",
            title: "Cover memo",
            layout: { cover: false },
            blocks: [
              {
                type: "fields",
                heading: "Info",
                fields: [{ label: "Field", w: 1 }],
              },
            ],
          },
        },
        {
          def: {
            kind: "form",
            no: "PKG-FILL-B",
            title: "Nested form",
            sections: [
              { name: "Details", fields: [{ label: "Answer", w: 1 }] },
            ],
          },
        },
      ],
    });

    expect(html).toContain('name="package_1_answer"');
    // The nested document's "Info" fields block never renders inputs, form or not.
    const firstDocument = html.slice(
      html.indexOf('data-package-item="1"'),
      html.indexOf('data-package-item="2"'),
    );
    expect(firstDocument).not.toContain("<input");
  });

  it("exposes formFillTargets for a standalone form, a package with nested forms, and a document", () => {
    const renderer = loadRenderer();

    const formTargets = renderer.formFillTargets({
      kind: "form",
      no: "SOLO-1",
      title: "Solo",
      sections: [{ name: "Details", fields: [{ label: "Field", w: 1 }] }],
    });
    expect(formTargets).toHaveLength(1);
    expect(formTargets[0].prefix).toBe("");
    expect(formTargets[0].form._schema[0]).toMatchObject({ type: "text" });

    const packageTargets = renderer.formFillTargets({
      kind: "package",
      no: "PKG-2",
      title: "Package",
      documents: [
        {
          def: { kind: "document", no: "PKG-2-A", title: "Static", blocks: [] },
        },
        {
          def: {
            kind: "form",
            no: "PKG-2-B",
            title: "Form",
            sections: [{ name: "Details", fields: [{ label: "Field", w: 1 }] }],
          },
        },
      ],
    });
    expect(packageTargets).toHaveLength(1);
    expect(packageTargets[0].prefix).toBe("package_1_");
    expect(packageTargets[0].form.no).toBe("PKG-2-B");

    const documentTargets = renderer.formFillTargets({
      kind: "document",
      no: "DOC-1",
      title: "Just a document",
      blocks: [],
    });
    expect(documentTargets).toHaveLength(0);
  });
});
