import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

interface FillHandle {
  targets: unknown[];
  flush(): unknown;
  reset(): void;
  isEmpty(): boolean;
  detach(): void;
}

interface BaseFill {
  collect(container: Element, definition: Record<string, unknown>): unknown;
  apply(
    container: Element,
    definition: Record<string, unknown>,
    data: unknown,
  ): void;
  reset(container: Element, definition: Record<string, unknown>): void;
  isEmpty(container: Element, definition: Record<string, unknown>): boolean;
  attach(
    container: Element,
    definition: Record<string, unknown>,
    key: string,
  ): FillHandle;
  clearStored(key: string): void;
}

interface Base {
  render(definition: Record<string, unknown>): string;
}

function loadRuntime() {
  const window = new Window({ url: "https://base.test/" });
  const context = { window };
  runInNewContext(readFileSync("public/engine.js", "utf8"), context);
  runInNewContext(readFileSync("public/form-fill.js", "utf8"), context);
  return {
    window,
    document: window.document as unknown as Document,
    BASE: (window as unknown as { BASE: Base }).BASE,
    BASE_FILL: (window as unknown as { BASE_FILL: BaseFill }).BASE_FILL,
  };
}

const soloForm = {
  kind: "form",
  no: "SOLO-1",
  title: "Solo form",
  sections: [
    { name: "Details", fields: [{ label: "Name", w: 1 }] },
    { name: "Pick one", single: true, checks: ["Option A", "Option B"] },
  ],
};

const packageWithForms = {
  kind: "package",
  no: "PKG-1",
  title: "Package",
  documents: [
    { def: { kind: "document", no: "PKG-1-A", title: "Static", blocks: [] } },
    {
      def: {
        kind: "form",
        no: "PKG-1-B",
        title: "Nested form",
        sections: [{ name: "Details", fields: [{ label: "Name", w: 1 }] }],
      },
    },
  ],
};

function mountedRoot(
  runtime: ReturnType<typeof loadRuntime>,
  definition: Record<string, unknown>,
) {
  const root = runtime.document.createElement("div");
  root.innerHTML = runtime.BASE.render(definition);
  runtime.document.body.appendChild(root);
  return root as unknown as Element;
}

function fireInput(
  runtime: ReturnType<typeof loadRuntime>,
  name: string,
  root: Element,
) {
  const EventCtor = runtime.window.Event as unknown as typeof Event;
  const element = root.querySelector(`[name="${name}"]`);
  if (!element) throw new Error(`No element named "${name}" found.`);
  element.dispatchEvent(new EventCtor("input", { bubbles: true }));
}

describe("BASE_FILL collect/apply", () => {
  it("collects a flat answers shape for a standalone form", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, soloForm);
    (root.querySelector('[name="name"]') as HTMLInputElement).value = "Jane";
    (
      root.querySelector(
        '[name="pick_one"][value="Option B"]',
      ) as HTMLInputElement
    ).checked = true;

    const data = runtime.BASE_FILL.collect(root, soloForm) as {
      form: string;
      answers: Record<string, unknown>;
    };
    expect(data).toEqual({
      form: "SOLO-1",
      answers: { name: "Jane", pick_one: "Option B" },
    });
  });

  it("applies a flat answers shape back onto the rendered inputs", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, soloForm);

    runtime.BASE_FILL.apply(root, soloForm, {
      answers: { name: "Jane", pick_one: "Option A" },
    });

    expect(
      (root.querySelector('[name="name"]') as HTMLInputElement).value,
    ).toBe("Jane");
    expect(
      (
        root.querySelector(
          '[name="pick_one"][value="Option A"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("keys nested package forms by their namePrefix and keeps them separate", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, packageWithForms);
    (root.querySelector('[name="package_1_name"]') as HTMLInputElement).value =
      "Package answer";

    const data = runtime.BASE_FILL.collect(root, packageWithForms) as {
      package: string;
      documents: { no: string; answers: Record<string, unknown> }[];
    };
    expect(data.package).toBe("PKG-1");
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0]).toMatchObject({
      no: "PKG-1-B",
      answers: { name: "Package answer" },
    });
  });

  it("round-trips a package answers shape through apply", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, packageWithForms);

    runtime.BASE_FILL.apply(root, packageWithForms, {
      package: "PKG-1",
      documents: [{ no: "PKG-1-B", answers: { name: "Restored" } }],
    });

    expect(
      (root.querySelector('[name="package_1_name"]') as HTMLInputElement).value,
    ).toBe("Restored");
  });

  it("reports isEmpty until at least one field has a value", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, soloForm);
    expect(runtime.BASE_FILL.isEmpty(root, soloForm)).toBe(true);

    (root.querySelector('[name="name"]') as HTMLInputElement).value = "Jane";
    expect(runtime.BASE_FILL.isEmpty(root, soloForm)).toBe(false);
  });

  it("reset clears every field back to blank", () => {
    const runtime = loadRuntime();
    const root = mountedRoot(runtime, soloForm);
    (root.querySelector('[name="name"]') as HTMLInputElement).value = "Jane";
    (
      root.querySelector(
        '[name="pick_one"][value="Option A"]',
      ) as HTMLInputElement
    ).checked = true;

    runtime.BASE_FILL.reset(root, soloForm);

    expect(
      (root.querySelector('[name="name"]') as HTMLInputElement).value,
    ).toBe("");
    expect(
      (
        root.querySelector(
          '[name="pick_one"][value="Option A"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });
});

describe("BASE_FILL persistence (localStorage)", () => {
  it("restores previously saved answers on attach", () => {
    const runtime = loadRuntime();
    const key = "test:restore";
    const first = mountedRoot(runtime, soloForm);
    const handle = runtime.BASE_FILL.attach(first, soloForm, key);
    (first.querySelector('[name="name"]') as HTMLInputElement).value =
      "Persisted";
    fireInput(runtime, "name", first);
    handle.detach();

    const second = mountedRoot(runtime, soloForm);
    runtime.BASE_FILL.attach(second, soloForm, key);

    expect(
      (second.querySelector('[name="name"]') as HTMLInputElement).value,
    ).toBe("Persisted");
  });

  it("reset clears both the DOM and the stored answers", () => {
    const runtime = loadRuntime();
    const key = "test:reset";
    const root = mountedRoot(runtime, soloForm);
    const handle = runtime.BASE_FILL.attach(root, soloForm, key);
    (root.querySelector('[name="name"]') as HTMLInputElement).value =
      "Temporary";
    fireInput(runtime, "name", root);
    expect(handle.isEmpty()).toBe(false);

    handle.reset();
    expect(handle.isEmpty()).toBe(true);

    const reattached = mountedRoot(runtime, soloForm);
    runtime.BASE_FILL.attach(reattached, soloForm, key);
    expect(
      (reattached.querySelector('[name="name"]') as HTMLInputElement).value,
    ).toBe("");
  });

  it("keeps answers for different storage keys independent", () => {
    const runtime = loadRuntime();
    const rootA = mountedRoot(runtime, soloForm);
    runtime.BASE_FILL.attach(rootA, soloForm, "form:a");
    (rootA.querySelector('[name="name"]') as HTMLInputElement).value = "A";
    fireInput(runtime, "name", rootA);

    const rootB = mountedRoot(runtime, soloForm);
    runtime.BASE_FILL.attach(rootB, soloForm, "form:b");

    expect(
      (rootB.querySelector('[name="name"]') as HTMLInputElement).value,
    ).toBe("");
  });
});
