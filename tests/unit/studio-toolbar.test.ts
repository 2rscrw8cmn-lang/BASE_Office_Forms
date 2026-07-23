import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Structural + behavioral tests for the Issue #25 Document Studio command
// toolbar refresh. studio.js is a self-executing IIFE that binds to the DOM in
// builder.html and leans on the BASE / BASE_LIBRARY / BASE_TEMPLATES globals, so
// each case boots a fresh happy-dom window, injects the toolbar markup, loads
// the real engine.js for BASE, stubs the library/template APIs, and evaluates
// studio.js in a vm context. The render methods are overridden with no-ops so
// the tests stay focused on toolbar wiring and accessibility.

const engineSource = readFileSync("public/engine.js", "utf8");
const toastSource = readFileSync("public/studio-toast.js", "utf8");
const studioSource = readFileSync("public/studio.js", "utf8");
const builderHtml = readFileSync("public/builder.html", "utf8");

function toolbarBody(): string {
  const body = builderHtml.slice(
    builderHtml.indexOf("<body>") + "<body>".length,
    builderHtml.indexOf("</body>"),
  );
  // Drop the <script> tags — engine.js and studio.js are evaluated separately.
  return body.replace(/<script[\s\S]*?<\/script>/g, "");
}

interface ElementLike {
  click(): void;
  focus(): void;
  hidden: boolean;
  textContent: string | null;
  classList: { contains(token: string): boolean };
  getAttribute(name: string): string | null;
  querySelector(selector: string): ElementLike | null;
  contains(other: ElementLike | null): boolean;
  dispatchEvent(event: unknown): boolean;
}

interface InputLike {
  type: string;
  accept: string;
}

interface DocumentLike {
  body: ElementLike & { innerHTML: string };
  activeElement: ElementLike | null;
  querySelector(selector: string): ElementLike | null;
  createElement(tag: string): InputLike;
}

type Mock = ReturnType<typeof vi.fn>;

interface Studio {
  window: Window;
  doc: DocumentLike;
  clipboard: { writeText: Mock };
  library: Record<string, Mock>;
  templates: Record<string, Mock>;
  print: Mock;
  confirm: Mock;
  createdInputs: InputLike[];
  createObjectURL: Mock;
  el(selector: string): ElementLike;
  key(target: ElementLike, keyName: string): void;
  settle(): Promise<void>;
}

const windows: Window[] = [];

afterEach(() => {
  windows.splice(0).forEach((win) => {
    void win.happyDOM.abort();
  });
  vi.clearAllMocks();
});

function loadStudio(options: { editKey?: unknown } = {}): Studio {
  const window = new Window({ url: "https://base.test/builder.html" });
  windows.push(window);
  const doc = window.document as unknown as DocumentLike;
  doc.body.innerHTML = toolbarBody();

  const library: Record<string, Mock> = {
    editKey: vi.fn(() => options.editKey ?? null),
    saveDocument: vi.fn(() =>
      Promise.resolve({
        document: { id: "doc-1", version: 1, folderId: null },
      }),
    ),
    listDocuments: vi.fn(() => Promise.resolve([])),
    listFolders: vi.fn(() => Promise.resolve([])),
    getDocument: vi.fn((id: string) =>
      Promise.resolve({
        id,
        definition: {
          kind: "document",
          title: "Doc",
          blocks: [],
          layout: { cover: true },
          control: {},
          controlVisibility: {},
          appearance: {},
        },
        version: 1,
        folderId: null,
      }),
    ),
    deleteDocument: vi.fn(() => Promise.resolve()),
    createFolder: vi.fn((name: string) =>
      Promise.resolve({ id: "folder-1", name }),
    ),
    viewUrl: vi.fn((id: string) => `https://base.test/viewer.html?id=${id}`),
    editUrl: vi.fn((id: string) => `https://base.test/builder.html?id=${id}`),
    rememberEditKey: vi.fn(() => undefined),
  };

  const templates: Record<string, Mock> = {
    getTemplate: vi.fn(() =>
      Promise.reject(new Error("no published override")),
    ),
    publishTemplate: vi.fn(() =>
      Promise.resolve({ publishedVersion: { versionNumber: 2 } }),
    ),
  };

  const clipboard = { writeText: vi.fn(() => Promise.resolve()) };
  const print = vi.fn();
  const confirm = vi.fn(() => true);
  const createObjectURL = vi.fn(() => "blob:mock");
  const createdInputs: InputLike[] = [];

  const realCreateElement = doc.createElement.bind(doc);
  doc.createElement = (tag: string): InputLike => {
    const element = realCreateElement(tag);
    if (tag.toLowerCase() === "input") createdInputs.push(element);
    return element;
  };

  (window as unknown as { print: Mock }).print = print;
  (window as unknown as { confirm: Mock }).confirm = confirm;

  const context: Record<string, unknown> = {
    window,
    document: doc,
    localStorage: window.localStorage,
    location: window.location,
    history: window.history,
    navigator: { clipboard },
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
    URL: { createObjectURL, revokeObjectURL: () => undefined },
    URLSearchParams,
    Blob: globalThis.Blob,
    FileReader: window.FileReader,
    TextEncoder,
    TextDecoder,
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
    atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    BASE_LIBRARY: library,
    BASE_TEMPLATES: templates,
  };

  runInNewContext(engineSource, context);
  const base = (context.window as { BASE: Record<string, unknown> }).BASE;
  base.render = () => "";
  base.paginate = () => undefined;
  base.updatePackageIndex = () => undefined;
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
  const key = (target: ElementLike, keyName: string) => {
    const event = new window.KeyboardEvent("keydown", {
      key: keyName,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
  };
  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

  return {
    window,
    doc,
    clipboard,
    library,
    templates,
    print,
    confirm,
    createdInputs,
    createObjectURL,
    el,
    key,
    settle,
  };
}

describe("Studio command toolbar (Issue #25)", () => {
  it("keeps backup actions inside the accessible More Actions menu", () => {
    const studio = loadStudio();
    const toggle = studio.el("#moreActionsButton");
    const menu = studio.el("#moreActionsMenu");

    expect(toggle.getAttribute("aria-haspopup")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("moreActionsMenu");
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.contains(studio.el("#loadButton"))).toBe(true);
    expect(menu.contains(studio.el("#downloadButton"))).toBe(true);
    expect(studio.el("#loadButton").getAttribute("role")).toBe("menuitem");
    expect(studio.el("#downloadButton").getAttribute("role")).toBe("menuitem");
  });

  it("Import backup still invokes the existing import behavior", () => {
    const studio = loadStudio();
    studio.el("#moreActionsButton").click();
    studio.el("#loadButton").click();

    const fileInput = studio.createdInputs.find(
      (input) => input.type === "file",
    );
    expect(fileInput).toBeTruthy();
    expect(fileInput?.accept).toContain("json");
    // Choosing an action closes the menu.
    expect(studio.el("#moreActionsMenu").hidden).toBe(true);
  });

  it("Export backup still invokes the existing export behavior", () => {
    const studio = loadStudio();
    studio.el("#downloadButton").click();

    expect(studio.createObjectURL).toHaveBeenCalledTimes(1);
    expect(studio.el("#toastStack").textContent).toContain("backup exported");
  });

  it("Share is an icon-only control with an accessible name and decorative icon", async () => {
    const studio = loadStudio();
    const share = studio.el("#shareButton");

    expect(share.getAttribute("aria-label")).toBe("Share document");
    expect(share.getAttribute("title")).toBeTruthy();
    expect(share.classList.contains("cmd-icon-btn")).toBe(true);
    expect((share.textContent ?? "").trim()).toBe("");
    expect(share.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    share.click();
    await studio.settle();
    expect(studio.library.viewUrl).toHaveBeenCalled();
    expect(studio.clipboard.writeText).toHaveBeenCalledWith(
      "https://base.test/viewer.html?id=doc-1",
    );
  });

  it("combines AI Kit and Import AI into a single accessible menu", () => {
    const studio = loadStudio();
    const toggle = studio.el("#aiKitButton");
    const menu = studio.el("#aiKitMenu");

    expect(toggle.getAttribute("aria-haspopup")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("aiKitMenu");
    expect(toggle.getAttribute("aria-label")).toBe("AI Kit");
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.contains(studio.el("#aiButton"))).toBe(true);
    expect(menu.contains(studio.el("#aiImportButton"))).toBe(true);
  });

  it("preserves both AI menu actions", async () => {
    const studio = loadStudio();

    studio.el("#aiKitButton").click();
    studio.el("#aiButton").click();
    await studio.settle();
    expect(studio.clipboard.writeText).toHaveBeenCalledTimes(1);
    const firstCall = studio.clipboard.writeText.mock.calls[0][0] as string;
    expect(firstCall).toContain("BASE controlled");

    studio.el("#aiKitButton").click();
    studio.el("#aiImportButton").click();
    expect(studio.el("#modal").hidden).toBe(false);
    expect(studio.el("#modalTitle").textContent).toBe("Import AI JSON");
  });

  it("Export PDF remains functional", async () => {
    const studio = loadStudio();
    studio.el("#printButton").click();
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(studio.print).toHaveBeenCalled();
  });

  it("Save to Library is the primary action and still saves", async () => {
    const studio = loadStudio();
    const save = studio.el("#saveButton");

    expect(save.classList.contains("accent")).toBe(true);
    expect(save.classList.contains("cmd-primary")).toBe(true);
    expect(save.textContent).toContain("Save to Library");

    save.click();
    await studio.settle();
    expect(studio.library.saveDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps conditional Delete and Update Template behavior intact", async () => {
    const studio = loadStudio({ editKey: "edit-key" });
    const del = studio.el("#deleteButton");
    const updateTemplate = studio.el("#updateTemplateButton");
    const divider = studio.el("[data-conditional-divider]");

    // Hidden on a fresh local draft with no library id and no template key.
    expect(del.hidden).toBe(true);
    expect(updateTemplate.hidden).toBe(true);
    expect(divider.hidden).toBe(true);

    // Saving establishes a library id -> Delete becomes reachable.
    studio.el("#saveButton").click();
    await studio.settle();
    expect(del.hidden).toBe(false);
    expect(divider.hidden).toBe(false);

    studio.confirm.mockReturnValue(true);
    studio.el("#deleteButton").click();
    await studio.settle();
    expect(studio.library.deleteDocument).toHaveBeenCalled();

    // Starting from a template exposes Update Template.
    studio.el("#newButton").click();
    await studio.settle();
    expect(updateTemplate.hidden).toBe(false);
  });

  it("supports keyboard operation and close behavior for menus", () => {
    const studio = loadStudio();
    const toggle = studio.el("#moreActionsButton");
    const menu = studio.el("#moreActionsMenu");

    // ArrowDown opens the menu and focuses its first item.
    studio.key(toggle, "ArrowDown");
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(studio.doc.activeElement).toBe(studio.el("#loadButton"));

    // Escape closes and returns focus to the toggle.
    studio.key(studio.el("#loadButton"), "Escape");
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(studio.doc.activeElement).toBe(toggle);

    // Outside click closes an open menu.
    toggle.click();
    expect(menu.hidden).toBe(false);
    studio.doc.body.dispatchEvent(
      new studio.window.MouseEvent("click", { bubbles: true }),
    );
    expect(menu.hidden).toBe(true);
  });

  it("only allows one toolbar menu open at a time", () => {
    const studio = loadStudio();
    const moreMenu = studio.el("#moreActionsMenu");
    const aiMenu = studio.el("#aiKitMenu");

    studio.el("#moreActionsButton").click();
    expect(moreMenu.hidden).toBe(false);

    studio.el("#aiKitButton").click();
    expect(aiMenu.hidden).toBe(false);
    expect(moreMenu.hidden).toBe(true);
    expect(studio.el("#moreActionsButton").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("gives every icon-only control an accessible name", () => {
    const studio = loadStudio();
    ["#shareButton", "#moreActionsButton"].forEach((selector) => {
      const button = studio.el(selector);
      expect(button.getAttribute("aria-label")).toBeTruthy();
      expect(button.getAttribute("title")).toBeTruthy();
      expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    });
  });

  it("keeps legacy Studio independent from the migrated icon runtime", () => {
    expect(builderHtml.toLowerCase()).not.toContain("lucide");
    expect(studioSource.toLowerCase()).not.toContain("lucide");
  });
});
