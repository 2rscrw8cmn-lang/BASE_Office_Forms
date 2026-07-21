import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Studio Stabilization (Issue #32, PR A) interaction coverage: block/field
// CRUD, reorder, collapse/reopen, stable ids across label edits, explicit
// input types, and last-valid-preview recovery. Builds on the same
// vm-in-happy-dom harness as studio-toolbar.test.ts, but leaves the real
// engine.js render() active (only paginate/updatePackageIndex are stubbed)
// so the saved definition and preview HTML can be inspected directly.

const engineSource = readFileSync("public/engine.js", "utf8");
const toastSource = readFileSync("public/studio-toast.js", "utf8");
const studioSource = readFileSync("public/studio.js", "utf8");
const builderHtml = readFileSync("public/builder.html", "utf8");

function editorBody(): string {
  const body = builderHtml.slice(
    builderHtml.indexOf("<body>") + "<body>".length,
    builderHtml.indexOf("</body>"),
  );
  return body.replace(/<script[\s\S]*?<\/script>/g, "");
}

interface ElementLike {
  click(): void;
  hidden: boolean;
  open: boolean;
  value: string;
  checked: boolean;
  textContent: string | null;
  innerHTML: string;
  dataset: Record<string, string>;
  dispatchEvent(event: unknown): boolean;
  querySelectorAll(selector: string): ElementLike[];
}

interface DocumentLike {
  body: ElementLike & { innerHTML: string };
  querySelector(selector: string): ElementLike | null;
  querySelectorAll(selector: string): ElementLike[];
}

type Mock = ReturnType<typeof vi.fn>;

interface RendererField {
  id: string;
  label: string;
  height?: number;
  type?: string;
  [key: string]: unknown;
}

interface RendererSection {
  name?: string;
  heading?: string;
  title?: string;
  fields?: RendererField[];
  [key: string]: unknown;
}

interface RendererDefinition {
  kind: string;
  sections?: RendererSection[];
  blocks?: unknown[];
  [key: string]: unknown;
}

interface Studio {
  window: Window;
  doc: DocumentLike;
  base: {
    render: (definition: unknown, options?: { fill?: boolean }) => string;
  };
  library: Record<string, Mock>;
  el(selector: string): ElementLike;
  all(selector: string): ElementLike[];
  fireInput(target: ElementLike, value: string): void;
  fireChange(target: ElementLike, value: string): void;
  addDocBlock(type: string): void;
  addFormBlock(type: string): void;
  save(): Promise<RendererDefinition>;
  settle(): Promise<void>;
}

const windows: Window[] = [];

afterEach(() => {
  windows.splice(0).forEach((win) => {
    void win.happyDOM.abort();
  });
  vi.clearAllMocks();
});

async function loadStudio(
  query = "",
  libraryOverrides: Record<string, Mock> = {},
): Promise<Studio> {
  const window = new Window({
    url: `https://base.test/builder.html${query}`,
  });
  windows.push(window);
  const doc = window.document as unknown as DocumentLike;
  doc.body.innerHTML = editorBody();

  const library: Record<string, Mock> = {
    editKey: vi.fn(() => null),
    saveDocument: vi.fn((definition: RendererDefinition) =>
      Promise.resolve({
        document: { id: "doc-1", version: 1, folderId: null, ...definition },
      }),
    ),
    listDocuments: vi.fn(() => Promise.resolve([])),
    listFolders: vi.fn(() => Promise.resolve([])),
    getDocument: vi.fn(() =>
      Promise.reject(new Error("not stubbed for this test")),
    ),
    deleteDocument: vi.fn(() => Promise.resolve()),
    createFolder: vi.fn(),
    viewUrl: vi.fn(() => "https://base.test/viewer.html?id=doc-1"),
    editUrl: vi.fn(() => "https://base.test/builder.html?id=doc-1"),
    rememberEditKey: vi.fn(),
    ...libraryOverrides,
  };

  const templates: Record<string, Mock> = {
    getTemplate: vi.fn(() => Promise.reject(new Error("no override"))),
    publishTemplate: vi.fn(() =>
      Promise.resolve({ publishedVersion: { versionNumber: 2 } }),
    ),
  };

  const context: Record<string, unknown> = {
    window,
    document: doc,
    localStorage: window.localStorage,
    location: window.location,
    history: window.history,
    navigator: { clipboard: { writeText: vi.fn(() => Promise.resolve()) } },
    console,
    setTimeout: (handler: () => void, ms?: number) => {
      const timer = setTimeout(handler, ms);
      timer.unref();
      return timer;
    },
    clearTimeout,
    requestAnimationFrame: (cb: (time: number) => void) =>
      setTimeout(() => {
        cb(Date.now());
      }, 0),
    URL: {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: () => undefined,
    },
    URLSearchParams,
    Blob: globalThis.Blob,
    FileReader: window.FileReader,
    // studio.js checks `details instanceof HTMLDetailsElement` in its native
    // <details>/<summary> toggle handler -- that bare global must be present
    // in this vm context or the check throws a ReferenceError (silently
    // swallowed by DOM event dispatch), which would otherwise make every
    // collapse/expand toggle silently no-op.
    HTMLDetailsElement: (window as unknown as { HTMLDetailsElement: unknown })
      .HTMLDetailsElement,
    TextEncoder,
    TextDecoder,
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    BASE_LIBRARY: library,
    BASE_TEMPLATES: templates,
  };

  runInNewContext(engineSource, context);
  const base = (context.window as { BASE: Record<string, unknown> })
    .BASE as unknown as Studio["base"] & Record<string, unknown>;
  // Leave render() real; only stub the DOM-measurement helpers that assume a
  // real layout engine, matching the toolbar test's approach.
  (base as unknown as Record<string, unknown>).paginate = () => undefined;
  (base as unknown as Record<string, unknown>).updatePackageIndex = () =>
    undefined;
  context.BASE = base;

  runInNewContext(toastSource, context);
  context.BASE_TOAST = (
    context.window as { BASE_TOAST: Record<string, unknown> }
  ).BASE_TOAST;

  runInNewContext(studioSource, context);

  const el = (selector: string): ElementLike => {
    const node = doc.querySelector(selector);
    if (!node) throw new Error(`Missing element: ${selector}`);
    return node;
  };
  const all = (selector: string): ElementLike[] =>
    Array.prototype.slice.call(doc.querySelectorAll(selector)) as ElementLike[];

  const fireInput = (target: ElementLike, value: string) => {
    if (target.dataset.valueType === "bool") target.checked = value === "true";
    else target.value = value;
    target.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const fireChange = (target: ElementLike, value: string) => {
    if (target.dataset.valueType === "bool") target.checked = value === "true";
    else target.value = value;
    target.dispatchEvent(new window.Event("change", { bubbles: true }));
  };

  const addDocBlock = (type: string) => {
    el(`[data-add-block="${type}"]`).click();
  };
  const addFormBlock = (type: string) => {
    el(`[data-add-form-block="${type}"]`).click();
  };

  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

  const save = async (): Promise<RendererDefinition> => {
    el("#saveButton").click();
    await settle();
    return library.saveDocument.mock.calls[
      library.saveDocument.mock.calls.length - 1
    ][0] as RendererDefinition;
  };

  // initialize() (fired at the bottom of studio.js) awaits
  // BASE_LIBRARY.listFolders()/getDocument() before its first renderAll(), so
  // #ed's dynamically generated content (block picker, field rows, ...)
  // isn't present until that pending microtask chain flushes.
  await settle();

  return {
    window,
    doc,
    base,
    library,
    el,
    all,
    fireInput,
    fireChange,
    addDocBlock,
    addFormBlock,
    save,
    settle,
  };
}

const ALL_BLOCK_TYPES = [
  "prose",
  "header",
  "list",
  "table",
  "keyvalue",
  "fields",
  "checks",
  "checklist",
  "attachments",
  "budget",
  "schedule",
  "contacts",
  "revisions",
  "evidence",
  "signature",
  "ack",
  "approval",
  "signatory",
  "note",
  "callout",
  "pagebreak",
];

describe("Studio editor block round trip (Issue #32, PR A)", () => {
  it("adds and removes every block type in a document without breaking the builder", async () => {
    const studio = await loadStudio("?new=document");
    const before = studio.all(".editor-card").length; // blankDoc() starts with one block

    ALL_BLOCK_TYPES.forEach((type) => {
      studio.addDocBlock(type);
    });
    expect(studio.all(".editor-card").length).toBe(
      before + ALL_BLOCK_TYPES.length,
    );
    expect(studio.el("#ed").innerHTML.length).toBeGreaterThan(0);
    expect(studio.el("#pv").innerHTML.length).toBeGreaterThan(0);

    // Delete every block one at a time (always index 0, since the list
    // shifts down) -- this must never throw or leave the builder blank.
    for (let i = 0; i < before + ALL_BLOCK_TYPES.length; i += 1) {
      studio.el('[data-action="delete-item"][data-index="0"]').click();
    }
    expect(studio.all(".editor-card").length).toBe(0);
    expect(studio.el("#ed").innerHTML.length).toBeGreaterThan(0);
  });

  it("adds every block type as a form section without breaking the builder", async () => {
    const studio = await loadStudio("?new=form");
    const before = studio.all(".editor-card").length;

    ALL_BLOCK_TYPES.forEach((type) => {
      studio.addFormBlock(type);
    });
    expect(studio.all(".editor-card").length).toBe(
      before + ALL_BLOCK_TYPES.length,
    );
    expect(studio.el("#pv").innerHTML.length).toBeGreaterThan(0);
  });

  it("reorders sections with move-up/move-down and preserves the change on save", async () => {
    const studio = await loadStudio("?new=form");
    studio.addFormBlock("prose");
    studio.addFormBlock("note");

    const titles = () =>
      studio.all(".editor-card-title").map((node) => node.textContent);
    const before = titles();
    expect(before[before.length - 2]).toBe("New Section");
    expect(before[before.length - 1]).toBe("Note");

    // Move the last item ("Note") up one position.
    const moveUpButtons = studio.all(
      '[data-action="move-up"][data-noun="section"]',
    );
    moveUpButtons[moveUpButtons.length - 1].click();

    const after = titles();
    expect(after[after.length - 2]).toBe("Note");
    expect(after[after.length - 1]).toBe("New Section");

    const saved = await studio.save();
    const savedTitles = (saved.sections ?? []).map(
      (s) => s.heading ?? s.name ?? s.title,
    );
    expect(savedTitles[savedTitles.length - 2]).toBe("Note");
  });

  it("keeps a card's collapsed/expanded state across a full editor re-render", async () => {
    const studio = await loadStudio("?new=document");
    studio.addDocBlock("prose");
    studio.addDocBlock("note");

    const cards = () => studio.all(".editor-card");
    const summaries = () => studio.all(".editor-card .editor-card-summary");
    const target = cards().length - 2; // the "prose" card just added, before "note"
    expect(cards()[target].open).toBe(true); // newly added cards start open

    // Collapse it by clicking its summary (native <details> toggle).
    summaries()[target].click();
    expect(cards()[target].open).toBe(false);

    // A structural change elsewhere triggers a full renderEditor() rebuild;
    // the collapsed state must survive it (tracked by object identity, not DOM).
    studio.addDocBlock("callout");
    expect(cards()[target].open).toBe(false);
    expect(cards()[cards().length - 1].open).toBe(true); // the new callout card
  });

  it("never changes a field's stored id when its label is edited (Issue #32)", async () => {
    const studio = await loadStudio("?new=form");
    studio.addFormBlock("fields");

    const addFieldButton = studio.all('[data-action="add-field"]').slice(-1)[0];
    addFieldButton.click();

    const firstSaved = await studio.save();
    const sections = firstSaved.sections ?? [];
    const section = sections[sections.length - 1];
    const fields = section.fields ?? [];
    const fieldId = fields[0].id;
    expect(fieldId).toBeTruthy();

    // Rename the field's label via its data-path input.
    const labelInputs = studio.all(`[data-path$=".fields.0.label"]`);
    studio.fireInput(labelInputs[labelInputs.length - 1], "Renamed Label");

    const secondSaved = await studio.save();
    const renamedSections = secondSaved.sections ?? [];
    const renamedSection = renamedSections[renamedSections.length - 1];
    const renamedFields = renamedSection.fields ?? [];
    expect(renamedFields[0].label).toBe("Renamed Label");
    expect(renamedFields[0].id).toBe(fieldId);

    // And the renderer keeps using that same id as the fill-mode answer key.
    const filled = studio.base.render(secondSaved, { fill: true });
    expect(filled).toContain(`name="${fieldId}"`);
  });

  it("treats input style as explicit -- a tall field stays single-line unless Multiline is chosen", async () => {
    const studio = await loadStudio("?new=form");
    studio.addFormBlock("fields");

    const addFieldButton = studio.all('[data-action="add-field"]').slice(-1)[0];
    addFieldButton.click();

    const heightInputs = studio.all(`[data-path$=".fields.0.height"]`);
    studio.fireInput(heightInputs[heightInputs.length - 1], "90");

    const savedTall = await studio.save();
    const tallSections = savedTall.sections ?? [];
    const tallFields = tallSections[tallSections.length - 1].fields ?? [];
    expect(tallFields[0].height).toBe(90);
    expect(studio.base.render(savedTall, { fill: true })).not.toContain(
      "<textarea",
    );

    // Explicitly choosing Multiline (not height) is what makes it a textarea.
    const typeSelects = studio.all(`[data-path$=".fields.0.type"]`);
    studio.fireChange(typeSelects[typeSelects.length - 1], "multiline");

    const savedMultiline = await studio.save();
    expect(studio.base.render(savedMultiline, { fill: true })).toContain(
      "<textarea",
    );
  });

  it("keeps the last valid preview and shows an error toast when a render fails", async () => {
    const studio = await loadStudio("?new=form");
    const goodPreview = studio.el("#pv").innerHTML;
    expect(goodPreview.length).toBeGreaterThan(0);

    const original = studio.base.render;
    studio.base.render = () => {
      throw new Error("simulated render failure");
    };

    studio.addFormBlock("prose");

    expect(studio.el("#pv").innerHTML).toBe(goodPreview);
    expect(studio.el("#toastStack").textContent).toContain(
      "Could not render the preview",
    );

    studio.base.render = original;
  });

  it("saves and reloads a document with the definition intact (save/reload round trip)", async () => {
    const created = await loadStudio("?new=form");
    created.addFormBlock("fields");
    const addFieldButton = created
      .all('[data-action="add-field"]')
      .slice(-1)[0];
    addFieldButton.click();
    const labelInputs = created.all(`[data-path$=".fields.0.label"]`);
    created.fireInput(labelInputs[labelInputs.length - 1], "Reload Field");

    const saved = await created.save();

    const reopened = await loadStudio("?id=doc-1", {
      editKey: vi.fn(() => "edit-key-1"),
      getDocument: vi.fn(() =>
        Promise.resolve({
          id: "doc-1",
          definition: saved,
          version: 1,
          folderId: null,
        }),
      ),
    });
    await reopened.settle();

    const reloadedTitles = reopened
      .all(".editor-card-title")
      .map((node) => node.textContent);
    expect(reloadedTitles).toContain("Information");
    const reloadedLabelInputs = reopened.all(`[data-path$=".fields.0.label"]`);
    expect(reloadedLabelInputs[reloadedLabelInputs.length - 1].value).toBe(
      "Reload Field",
    );
  });
});
