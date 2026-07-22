import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Studio Workspace Redesign (Issue #32, PR B) coverage: the outline rail +
// contextual inspector + Add Block drawer replace the old single scrolling
// column of always-open editor cards. This builds on the same
// vm-in-happy-dom harness as studio-toolbar.test.ts, with engine.js's real
// render() left active (only paginate/updatePackageIndex stubbed) so the
// saved definition and preview HTML can be inspected directly.

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
  focus(): void;
  hidden: boolean;
  value: string;
  checked: boolean;
  textContent: string | null;
  innerHTML: string;
  classList: { contains(token: string): boolean };
  dataset: Record<string, string>;
  dispatchEvent(event: unknown): boolean;
  querySelectorAll(selector: string): ElementLike[];
}

interface DocumentLike {
  body: ElementLike & { innerHTML: string };
  activeElement: ElementLike | null;
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
  openDrawer(noun: string, insertAt?: number): void;
  insertViaDrawer(noun: string, type: string, insertAt?: number): void;
  selectRow(noun: string, index: number): void;
  clickPreview(noun: string, index: number): void;
  dispatchDrag(
    target: ElementLike,
    type: "dragstart" | "dragover" | "drop" | "dragend",
    dataTransfer: { effectAllowed: string; setData: () => void },
  ): void;
  pressKey(target: ElementLike, key: string): void;
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
    // studio.js checks `details instanceof HTMLDetailsElement` in the
    // Document Settings panels' collapse/expand toggle handler -- that bare
    // global must be present in this vm context or the check throws a
    // ReferenceError (silently swallowed by DOM event dispatch).
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

  const openDrawer = (noun: string, insertAt?: number) => {
    const buttons = all(`[data-action="open-add-drawer"][data-noun="${noun}"]`);
    const target =
      insertAt == null
        ? buttons[buttons.length - 1]
        : buttons.find(
            (button) => Number(button.dataset.insertAt) === insertAt,
          );
    if (!target)
      throw new Error(`No insertion point for ${noun} at ${String(insertAt)}`);
    target.click();
  };
  const insertViaDrawer = (noun: string, type: string, insertAt?: number) => {
    openDrawer(noun, insertAt);
    el(`[data-action="insert-block"][data-type="${type}"]`).click();
  };
  const selectRow = (noun: string, index: number) => {
    const rows = all(`[data-action="select-node"][data-noun="${noun}"]`);
    const target = rows.find((row) => Number(row.dataset.index) === index);
    if (!target)
      throw new Error(`No outline row for ${noun}[${String(index)}]`);
    target.click();
  };
  const clickPreview = (noun: string, index: number) => {
    el(`#pv [data-preview-${noun}="${String(index)}"]`).click();
  };

  const dispatchDrag = (
    target: ElementLike,
    type: "dragstart" | "dragover" | "drop" | "dragend",
    dataTransfer: { effectAllowed: string; setData: () => void },
  ) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    (event as unknown as { dataTransfer: unknown }).dataTransfer = dataTransfer;
    target.dispatchEvent(event);
  };

  const pressKey = (target: ElementLike, key: string) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
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
  // the dynamically generated outline/inspector content isn't present until
  // that pending microtask chain flushes.
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
    openDrawer,
    insertViaDrawer,
    selectRow,
    clickPreview,
    dispatchDrag,
    pressKey,
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

describe("Studio workspace redesign (Issue #32, PR B)", () => {
  it("shows Document Settings in the inspector by default", async () => {
    const studio = await loadStudio("?new=form");
    expect(studio.el("#inspectorTitle").textContent).toBe("Document Settings");
    expect(studio.el("#inspector").innerHTML).toContain("Form No.");
  });

  it("adds every block type via the drawer in a document without breaking the builder", async () => {
    const studio = await loadStudio("?new=document");
    const before = studio.all(".outline-row").length; // blankDoc() starts with one block

    ALL_BLOCK_TYPES.forEach((type) => {
      studio.insertViaDrawer("block", type);
    });
    expect(studio.el("#addBlockDrawer").hidden).toBe(true);
    expect(studio.all(".outline-row").length).toBe(
      before + ALL_BLOCK_TYPES.length,
    );
    expect(studio.el("#pv").innerHTML.length).toBeGreaterThan(0);

    // Delete every block one at a time -- this must never throw or leave
    // the builder blank.
    for (let i = 0; i < before + ALL_BLOCK_TYPES.length; i += 1) {
      studio.el('.outline-row [data-action="delete-item"]').click();
    }
    expect(studio.all(".outline-row").length).toBe(0);
    expect(studio.el("#inspectorTitle").textContent).toBe("Document Settings");
  });

  it("adds every block type via the drawer as a form section without breaking the builder", async () => {
    const studio = await loadStudio("?new=form");
    const before = studio.all(".outline-row").length;

    ALL_BLOCK_TYPES.forEach((type) => {
      studio.insertViaDrawer("section", type);
    });
    expect(studio.all(".outline-row").length).toBe(
      before + ALL_BLOCK_TYPES.length,
    );
    expect(studio.el("#pv").innerHTML.length).toBeGreaterThan(0);
  });

  it("filters the Add Block drawer by search query", async () => {
    const studio = await loadStudio("?new=document");
    studio.openDrawer("block");
    const allButtons = studio.all('[data-action="insert-block"]');
    expect(allButtons.length).toBe(ALL_BLOCK_TYPES.length);

    studio.fireInput(studio.el("#blockSearch"), "signature");
    const filtered = studio.all('[data-action="insert-block"]');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(allButtons.length);
    // Matches label OR description, so "ack" (description mentions
    // "signature") is expected alongside "signature" itself.
    expect(filtered.map((button) => button.dataset.type)).toContain(
      "signature",
    );

    studio.fireInput(studio.el("#blockSearch"), "nonexistent-xyz");
    expect(studio.all('[data-action="insert-block"]').length).toBe(0);
    expect(studio.el("#blockCatalog").textContent).toContain("No blocks match");
  });

  it("inserts a new block at a specific position via an inline insertion point", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "prose");
    studio.insertViaDrawer("block", "note");
    // Layout so far: [default prose, prose, note]. Insert a callout between
    // the default prose (index 0) and the added prose (index 1).
    studio.insertViaDrawer("block", "callout", 1);

    const labels = studio.all(".outline-label").map((node) => node.textContent);
    expect(labels[1]).toBe("Highlighted statement");
    expect(labels[2]).toBe("New Section");
    expect(labels[3]).toBe("Note");
  });

  it("selects an outline row and shows its settings in the inspector", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "note");
    studio.selectRow("block", 1);

    expect(studio.el("#inspectorTitle").textContent).toBe("Note");
    expect(studio.el("#inspector").innerHTML).toContain("Note title");
    expect(studio.all(".outline-row.selected").length).toBe(1);
  });

  it("selects the underlying item when the preview is clicked, and highlights the outline row", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "note");

    studio.clickPreview("block", 1);

    expect(studio.el("#inspectorTitle").textContent).toBe("Note");
    expect(studio.all(".outline-row.selected").length).toBe(1);
    const selectedButton = studio.el(
      ".outline-row.selected [data-action='select-node']",
    );
    expect(selectedButton.dataset.index).toBe("1");
    expect(studio.el("#pv .preview-selected")).toBeTruthy();
  });

  it("keeps selection on the same item by reference after it is reordered", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "prose");
    studio.insertViaDrawer("block", "note");
    studio.selectRow("block", 2); // the "Note" block, currently last

    // The outline itself only supports drag-to-reorder now; the inspector's
    // move-up/move-down buttons on the selected item remain as the
    // non-drag fallback (keyboard/no-drag-support users).
    studio.el('#inspector [data-action="move-up"]').click();

    // The Note block moved from index 2 to index 1; selection should follow
    // it (by reference), not stay pinned to index 2.
    expect(studio.el("#inspectorTitle").textContent).toBe("Note");
    const selectedButton = studio.el(
      ".outline-row.selected [data-action='select-node']",
    );
    expect(selectedButton.dataset.index).toBe("1");
  });

  it("reorders outline rows via drag-and-drop onto an insertion point", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "prose");
    studio.insertViaDrawer("block", "note");

    const labelsBefore = studio
      .all(".outline-label")
      .map((node) => node.textContent);
    expect(labelsBefore[1]).toBe("New Section");
    expect(labelsBefore[2]).toBe("Note");

    // Drag the "Note" row (index 2) onto the insertion point before the
    // "New Section" row (index 1) -- i.e. drop at insertAt=1.
    const rows = studio.all(".outline-row");
    const noteRow = rows[2];
    const insertPoints = studio.all(
      '[data-action="open-add-drawer"][data-noun="block"]',
    );
    const dropTarget = insertPoints.find(
      (button) => button.dataset.insertAt === "1",
    );
    expect(dropTarget).toBeTruthy();

    const transfer = { effectAllowed: "", setData: () => undefined };
    studio.dispatchDrag(noteRow, "dragstart", transfer);
    studio.dispatchDrag(
      dropTarget as unknown as ElementLike,
      "dragover",
      transfer,
    );
    studio.dispatchDrag(dropTarget as unknown as ElementLike, "drop", transfer);

    const labelsAfter = studio
      .all(".outline-label")
      .map((node) => node.textContent);
    expect(labelsAfter[1]).toBe("Note");
    expect(labelsAfter[2]).toBe("New Section");
  });

  it("moves focus between outline rows with ArrowDown/ArrowUp", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "prose");

    const docHeader = studio.el('[data-action="select-document"]');
    docHeader.focus();
    expect(studio.doc.activeElement).toBe(docHeader);

    studio.pressKey(docHeader, "ArrowDown");
    const firstRow = studio.el(
      '[data-action="select-node"][data-noun="block"][data-index="0"]',
    );
    expect(studio.doc.activeElement).toBe(firstRow);

    studio.pressKey(firstRow, "ArrowDown");
    const secondRow = studio.el(
      '[data-action="select-node"][data-noun="block"][data-index="1"]',
    );
    expect(studio.doc.activeElement).toBe(secondRow);

    studio.pressKey(secondRow, "ArrowUp");
    expect(studio.doc.activeElement).toBe(firstRow);
  });

  it("falls back to Document Settings when the selected item is deleted", async () => {
    const studio = await loadStudio("?new=document");
    studio.insertViaDrawer("block", "note");
    studio.selectRow("block", 1);
    expect(studio.el("#inspectorTitle").textContent).toBe("Note");

    studio.el('.outline-row.selected [data-action="delete-item"]').click();
    expect(studio.el("#inspectorTitle").textContent).toBe("Document Settings");
  });

  it("never changes a field's stored id when its label is edited via the inspector (Issue #32)", async () => {
    const studio = await loadStudio("?new=form");
    studio.insertViaDrawer("section", "fields");
    const sectionRows = studio.all(
      '[data-action="select-node"][data-noun="section"]',
    );
    studio.selectRow(
      "section",
      Number(sectionRows[sectionRows.length - 1].dataset.index),
    );

    studio.el('#inspector [data-action="add-field"]').click();

    const firstSaved = await studio.save();
    const sections = firstSaved.sections ?? [];
    const section = sections[sections.length - 1];
    const fields = section.fields ?? [];
    const fieldId = fields[0].id;
    expect(fieldId).toBeTruthy();

    const labelInputs = studio.all(`[data-path$=".fields.0.label"]`);
    studio.fireInput(labelInputs[labelInputs.length - 1], "Renamed Label");

    const secondSaved = await studio.save();
    const renamedSections = secondSaved.sections ?? [];
    const renamedSection = renamedSections[renamedSections.length - 1];
    const renamedFields = renamedSection.fields ?? [];
    expect(renamedFields[0].label).toBe("Renamed Label");
    expect(renamedFields[0].id).toBe(fieldId);

    const filled = studio.base.render(secondSaved, { fill: true });
    expect(filled).toContain(`name="${fieldId}"`);
  });

  it("treats input style as explicit -- a tall field stays single-line unless Multiline is chosen", async () => {
    const studio = await loadStudio("?new=form");
    studio.insertViaDrawer("section", "fields");
    const sectionRows = studio.all(
      '[data-action="select-node"][data-noun="section"]',
    );
    studio.selectRow(
      "section",
      Number(sectionRows[sectionRows.length - 1].dataset.index),
    );
    studio.el('#inspector [data-action="add-field"]').click();

    const heightInputs = studio.all(`[data-path$=".fields.0.height"]`);
    studio.fireInput(heightInputs[heightInputs.length - 1], "90");

    const savedTall = await studio.save();
    const tallSections = savedTall.sections ?? [];
    const tallFields = tallSections[tallSections.length - 1].fields ?? [];
    expect(tallFields[0].height).toBe(90);
    expect(studio.base.render(savedTall, { fill: true })).not.toContain(
      "<textarea",
    );

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

    studio.insertViaDrawer("section", "prose");

    expect(studio.el("#pv").innerHTML).toBe(goodPreview);
    expect(studio.el("#toastStack").textContent).toContain(
      "Could not render the preview",
    );

    studio.base.render = original;
  });

  it("saves and reloads a document with the definition intact (save/reload round trip)", async () => {
    const created = await loadStudio("?new=form");
    created.insertViaDrawer("section", "fields");
    const sectionRows = created.all(
      '[data-action="select-node"][data-noun="section"]',
    );
    created.selectRow(
      "section",
      Number(sectionRows[sectionRows.length - 1].dataset.index),
    );
    created.el('#inspector [data-action="add-field"]').click();
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

    const reloadedTitles = reopened
      .all(".outline-label")
      .map((node) => node.textContent);
    expect(reloadedTitles).toContain("Information");
    const reloadedLabelInputs = reopened.all(`[data-path$=".fields.0.label"]`);
    // The reloaded document defaults to Document Settings selected, so the
    // field editor isn't mounted until the section is reselected.
    reopened.selectRow(
      "section",
      Number(
        reopened
          .all('[data-action="select-node"][data-noun="section"]')
          .slice(-1)[0].dataset.index,
      ),
    );
    const reselectedLabelInputs = reopened.all(
      `[data-path$=".fields.0.label"]`,
    );
    expect(reselectedLabelInputs.length).toBeGreaterThan(0);
    expect(reselectedLabelInputs[reselectedLabelInputs.length - 1].value).toBe(
      "Reload Field",
    );
    expect(reloadedLabelInputs.length).toBe(0);
  });
});
