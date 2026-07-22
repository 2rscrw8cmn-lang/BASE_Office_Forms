import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { Window } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";

// BASE.paginate() mutates real DOM (cloneNode, scrollHeight, classList) and
// had zero test coverage before this file -- every other test stubs it out
// as a no-op, since happy-dom doesn't compute real layout. To test the
// long-table splitting logic (Issue #32 follow-up) deterministically, a
// fake scrollHeight is installed that counts live <tr> descendants instead
// of relying on real layout, mirroring "more rows = taller" without needing
// an actual browser.

const engineSource = readFileSync("public/engine.js", "utf8");

const ROW_HEIGHT = 50;
const BASE_OFFSET = 250; // header/cover chrome above the table on each page

interface RuntimeWindow {
  BASE: {
    render(
      definition: Record<string, unknown>,
      options?: { fill?: boolean },
    ): string;
    paginate(container: unknown): void;
  };
}

const windows: Window[] = [];

afterEach(() => {
  windows.splice(0).forEach((win) => {
    void win.happyDOM.abort();
  });
});

function loadEngine(): { window: Window; base: RuntimeWindow["BASE"] } {
  const window = new Window();
  windows.push(window);
  const context: Record<string, unknown> = { window };
  runInNewContext(engineSource, context);
  const base = (context.window as RuntimeWindow).BASE;

  // Fake layout: each page's simulated height is proportional to how many
  // <tr> rows are currently inside it, plus a fixed offset for everything
  // else on the page (heading, doc chrome). This is scoped to element
  // instances actually queried by paginate() (page/.sheet elements), which
  // only ever call scrollHeight on themselves.
  Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: { querySelectorAll: (s: string) => unknown[] }) {
      return BASE_OFFSET + this.querySelectorAll("tr").length * ROW_HEIGHT;
    },
  });

  return { window, base };
}

function scheduleDefinition(rowCount: number) {
  return {
    kind: "document",
    no: "SCHED-1",
    title: "Long Schedule Test",
    layout: { cover: false },
    toc: false,
    blocks: [
      {
        type: "schedule",
        heading: "Schedule",
        columns: ["Milestone", "Owner", "Due", "Status"],
        rows: Array.from({ length: rowCount }, (_, i) => [
          `Milestone ${String(i + 1)}`,
          "Owner",
          "2026-01-01",
          "Not Started",
        ]),
      },
    ],
  };
}

describe("BASE.paginate table splitting (Issue #32 follow-up)", () => {
  it("leaves a short table on a single page untouched", () => {
    const { window, base } = loadEngine();
    const doc = window.document;
    doc.body.innerHTML = base.render(scheduleDefinition(3), { fill: false });
    const container = doc.body;

    base.paginate(container);

    const sheets = container.querySelectorAll(".sheet");
    expect(sheets.length).toBe(1);
    expect(container.querySelectorAll("tr").length).toBe(4); // header + 3 rows
    expect(sheets[0].classList.contains("oversize")).toBe(false);
  });

  it("splits a long table across multiple pages instead of marking it oversize", () => {
    const { window, base } = loadEngine();
    const doc = window.document;
    const rowCount = 40;
    doc.body.innerHTML = base.render(scheduleDefinition(rowCount), {
      fill: false,
    });
    const container = doc.body;

    base.paginate(container);

    const sheets = Array.prototype.slice.call(
      container.querySelectorAll(".sheet"),
    ) as {
      classList: { contains: (c: string) => boolean };
      dataset: Record<string, string>;
    }[];
    expect(sheets.length).toBeGreaterThan(1);

    // No page should be left flagged oversize -- the whole table fit once split.
    sheets.forEach((sheet) => {
      expect(sheet.classList.contains("oversize")).toBe(false);
    });
    // First page is the original sheet; the rest are continuations.
    expect(sheets[0].dataset.autoPage).toBeUndefined();
    sheets.slice(1).forEach((sheet) => {
      expect(sheet.dataset.autoPage).toBe("true");
    });

    // Every milestone row survives, in original order, across all pages,
    // with no duplication or loss.
    const milestoneCells = Array.prototype.slice.call(
      container.querySelectorAll("tbody tr td:first-child"),
    ) as { textContent: string | null }[];
    expect(milestoneCells).toHaveLength(rowCount);
    milestoneCells.forEach((cell, index) => {
      expect(cell.textContent).toBe(`Milestone ${String(index + 1)}`);
    });

    // The continuation page's copy of the table is marked "(continued)".
    const continuedHeadings = Array.prototype.slice.call(
      container.querySelectorAll("h3"),
    ) as { textContent: string | null }[];
    expect(
      continuedHeadings.some((h) =>
        (h.textContent ?? "").includes("(continued)"),
      ),
    ).toBe(true);
  });

  it("marks a page oversize when even a single row doesn't fit", () => {
    const { window, base } = loadEngine();
    const doc = window.document;
    doc.body.innerHTML = base.render(scheduleDefinition(1), { fill: false });
    const container = doc.body;

    // Force an impossible budget: even one row plus the fixed offset can't
    // fit on any page (pageHeight is a fixed 1056/816 in engine.js, not
    // configurable per test, so simulate the "nothing helps" case directly
    // by inflating what a single row reports).
    Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: { querySelectorAll: (s: string) => unknown[] }) {
        return 5000 + this.querySelectorAll("tr").length;
      },
    });

    base.paginate(container);

    const sheet = container.querySelector(".sheet");
    expect(sheet?.classList.contains("oversize")).toBe(true);
  });
});
