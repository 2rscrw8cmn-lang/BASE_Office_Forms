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

  it("keeps a tall field a single-line input unless multiline is explicitly set (Issue #32)", () => {
    // A field >= 70px tall used to always render as a textarea. That silent
    // coupling is removed: height only affects layout, never input vs textarea.
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "TALL-1",
      title: "Tall field test",
      sections: [
        {
          name: "Details",
          fields: [{ label: "Stamp box", w: 1, height: 90 }],
        },
      ],
    });

    expect(html).toContain('<input class="fin" name="stamp_box">');
    expect(html).not.toContain("<textarea");
  });

  it("still renders a small field as a textarea when multiline is explicit (legacy boolean)", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "TALL-2",
      title: "Explicit multiline test",
      sections: [
        {
          name: "Details",
          fields: [{ label: "Notes", w: 1, height: 40, multiline: true }],
        },
      ],
    });

    expect(html).toContain('<textarea class="ftx" name="notes">');
  });

  it("renders date and number fields with the matching HTML input type", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "TYPE-1",
      title: "Explicit input types",
      sections: [
        {
          name: "Details",
          fields: [
            { label: "Start date", w: 1, height: 46, type: "date" },
            { label: "Quantity", w: 1, height: 46, type: "number" },
            { label: "Notes", w: 1, height: 90, type: "multiline" },
          ],
        },
      ],
    });

    expect(html).toContain('<input class="fin" name="start_date" type="date">');
    expect(html).toContain('<input class="fin" name="quantity" type="number">');
    expect(html).toContain('<textarea class="ftx" name="notes">');
  });

  it("keeps a field's answer key stable across renders when it has an explicit id (Issue #32)", () => {
    // Once a field has a permanent id, renaming its label must never change
    // the rendered `name` attribute -- that key is the stored answer identity.
    const renderer = loadRenderer();
    const before = renderer.render({
      kind: "form",
      no: "STABLE-1",
      title: "Stable id test",
      sections: [
        {
          name: "Details",
          fields: [
            { label: "Project No.", w: 1, height: 46, id: "project_no" },
          ],
        },
      ],
    });
    const after = renderer.render({
      kind: "form",
      no: "STABLE-1",
      title: "Stable id test",
      sections: [
        {
          name: "Details",
          fields: [
            { label: "Project Number", w: 1, height: 46, id: "project_no" },
          ],
        },
      ],
    });

    expect(before).toContain('name="project_no"');
    expect(after).toContain('name="project_no"');
  });

  it("still derives a field's id from its label when no explicit id is set (legacy definitions)", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "LEGACY-1",
      title: "Legacy id test",
      sections: [{ name: "Details", fields: [{ label: "Project No.", w: 1 }] }],
    });

    expect(html).toContain('name="project_no"');
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

  it("defaults a field's write-in box to the top of its box and moves it on align", () => {
    // Height stays below the 70px threshold so the field renders as a
    // single-line input rather than a textarea -- a textarea fills its box
    // via flex:1 regardless of alignment, so align only has a visible effect
    // below that threshold (or for sign fields, which never use a textarea).
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "ALIGN-1",
      title: "Align test",
      sections: [
        {
          name: "Details",
          fields: [
            { label: "Default", w: 1, height: 50 },
            { label: "Centered", w: 1, height: 50, align: "center" },
            { label: "Bottomed", w: 1, height: 50, align: "bottom" },
          ],
        },
      ],
    });

    expect(html).toContain(
      '<div class="field" style="--fh:50px"><div class="field-label">Default',
    );
    expect(html).toContain(
      '<div class="field field-align-center" style="--fh:50px">',
    );
    expect(html).toContain(
      '<div class="field field-align-bottom" style="--fh:50px">',
    );
  });

  it("defaults a sign field's write-in box to the bottom and moves it on align", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "form",
      no: "ALIGN-2",
      title: "Sign align test",
      sections: [
        {
          name: "Stamps",
          sign: [
            { label: "Contractor's Stamp", w: 2, height: 90 },
            { label: "Architect's Stamp", w: 2, height: 90, align: "top" },
          ],
        },
      ],
    });

    expect(html).toMatch(/<div class="sign" style="min-height:90px">/);
    expect(html).toContain('<div class="sign sign-align-top"');
  });

  it("renders a header block with the BASE logo and contact information", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "document",
      no: "HDR-1",
      title: "Header block test",
      layout: { cover: false },
      blocks: [
        {
          type: "header",
          companyName: "Acme Construction",
          address: "123 Main St",
          phone: "555-0100",
          email: "hello@acme.test",
        },
      ],
    });

    expect(html).toContain('class="header-block-logo"');
    expect(html).toContain("Acme Construction");
    expect(html).toContain("123 Main St");
    expect(html).toContain("555-0100");
    expect(html).toContain("hello@acme.test");
  });

  it("keeps the header block schema-compatible even with no contact fields set", () => {
    const result = validateRendererDefinition({
      kind: "document",
      title: "Blank header",
      blocks: [{ type: "header" }],
    });
    expect(result).toMatchObject({ valid: true });
  });

  it("shows a non-interactive ghost placeholder for the write-in box in the static preview", () => {
    const renderer = loadRenderer();
    const html = renderer.render(
      {
        kind: "form",
        no: "GHOST-1",
        title: "Ghost preview test",
        sections: [
          { name: "Details", fields: [{ label: "Field", w: 1, height: 50 }] },
          { name: "Stamps", sign: [{ label: "Stamp", w: 1, height: 90 }] },
        ],
      },
      { fill: false },
    );

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).toContain('class="fin-ghost ghost-line"');
  });

  it("sizes the write-in box independently of the outer field via textHeight", () => {
    const renderer = loadRenderer();
    const filled = renderer.render({
      kind: "form",
      no: "SIZE-1",
      title: "Size test",
      sections: [
        {
          name: "Stamps",
          sign: [
            {
              label: "Stamp",
              w: 1,
              height: 90,
              align: "bottom",
              textHeight: 24,
            },
          ],
        },
      ],
    });
    expect(filled).toContain(
      '<input class="fin" name="stamp" style="height:24px;flex:none">',
    );

    const preview = renderer.render(
      {
        kind: "form",
        no: "SIZE-1",
        title: "Size test",
        sections: [
          {
            name: "Stamps",
            sign: [
              {
                label: "Stamp",
                w: 1,
                height: 90,
                align: "bottom",
                textHeight: 24,
              },
            ],
          },
        ],
      },
      { fill: false },
    );
    expect(preview).toContain(
      'class="fin-ghost ghost-line" style="height:24px;flex:none"',
    );
  });

  it("locks the branded header to a fixed organization and notice, ignoring any per-document override", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "document",
      no: "LOCK-1",
      title: "Locked header test",
      org: "Some Other Company",
      headerNote: "A different notice",
      blocks: [],
    });

    expect(html).toContain("BASE Construction LLC");
    expect(html).toContain("1601 Minnesota Ave, Winter Park, FL 32789");
    expect(html).not.toContain("Some Other Company");
    expect(html).not.toContain("A different notice");
  });

  it("still respects showHeader:false to hide the branded header entirely", () => {
    const renderer = loadRenderer();
    const html = renderer.render({
      kind: "document",
      no: "LOCK-2",
      title: "Hidden header test",
      showHeader: false,
      blocks: [],
    });

    expect(html).not.toContain("BASE Construction LLC");
  });
});
