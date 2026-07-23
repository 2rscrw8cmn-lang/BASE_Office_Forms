import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRfisView } from "../../public/rfis-view.js";
import {
  TABULATOR_EDITABLE_ORDER,
  buildColumnDefinitions,
  buildPatchPayload,
  createRfiTabulatorGrid,
  isRowEditable,
  isTabulatorMode,
  normalizeCellValue,
  readGridMode,
  validateField,
} from "../../public/rfi-tabulator-adapter.js";
import { makeRfiDataset, fixtureContacts } from "../fixtures/rfi-dataset";

// ---------------------------------------------------------------------------
// A small Tabulator test double. It implements only the public surface the
// adapter uses (construction, on(), getRow/getCell, replaceData, update,
// destroy) plus a `simulateEdit` helper so tests can drive the cellEdited
// lifecycle without a layout-capable browser.
// ---------------------------------------------------------------------------

interface RowData {
  id: string;
  [key: string]: unknown;
}
interface ColumnDef {
  field: string;
  title?: string;
  editable?: unknown;
  editor?: unknown;
  formatter?: unknown;
  frozen?: boolean;
}
interface FakeConfig {
  data?: RowData[];
  columns?: ColumnDef[];
  [key: string]: unknown;
}
interface FakeCell {
  getRow(): FakeRow;
  getField(): string;
  getValue(): unknown;
  setValue(value: unknown): void;
  getElement(): { focus(): void };
  restoreOldValue(): void;
  reformat(): void;
  edit(ignore?: boolean): void;
}
interface FakeRow {
  getData(): RowData;
  update(data: Record<string, unknown>): void;
  getCell(field: string): FakeCell;
}

class FakeTabulator {
  static instances: FakeTabulator[] = [];
  rows = new Map<string, RowData>();
  edits = new Map<string, unknown>();
  edited: string[] = [];
  columns: ColumnDef[];
  destroyed = false;
  handlers: Partial<Record<string, (cell: FakeCell, value?: unknown) => void>> =
    {};
  element: unknown;

  constructor(element: unknown, config: FakeConfig) {
    this.element = element;
    this.columns = config.columns ?? [];
    for (const row of config.data ?? []) this.rows.set(row.id, { ...row });
    FakeTabulator.instances.push(this);
  }

  on(event: string, cb: (cell: FakeCell, value?: unknown) => void): void {
    this.handlers[event] = cb;
  }

  private makeCell(id: string, field: string): FakeCell {
    const key = `${id}:${field}`;
    const row = this.makeRow(id);
    return {
      getRow: () => row,
      getField: () => field,
      getValue: () =>
        this.edits.has(key) ? this.edits.get(key) : row.getData()[field],
      setValue: (value: unknown) => this.edits.set(key, value),
      getElement: () => ({ focus: () => undefined }),
      restoreOldValue: () => {
        this.edits.delete(key);
      },
      reformat: () => undefined,
      edit: () => {
        this.edited.push(key);
      },
    };
  }

  private makeRow(id: string): FakeRow {
    return {
      getData: () => this.rows.get(id) ?? { id },
      update: (data: Record<string, unknown>) => {
        const current = this.rows.get(id) ?? { id };
        this.rows.set(id, { ...current, ...data });
        for (const field of Object.keys(data))
          this.edits.delete(`${id}:${field}`);
      },
      getCell: (field: string) => this.makeCell(id, field),
    };
  }

  getRow(id: string): FakeRow | undefined {
    return this.rows.has(id) ? this.makeRow(id) : undefined;
  }

  replaceData(data: RowData[]): Promise<void> {
    this.rows = new Map(data.map((row) => [row.id, { ...row }]));
    this.edits.clear();
    return Promise.resolve();
  }

  destroy(): void {
    this.destroyed = true;
  }

  simulateEdit(id: string, field: string, value: unknown): void {
    const cell = this.makeCell(id, field);
    cell.setValue(value);
    this.handlers.cellEdited?.(cell);
  }
}

const fakeLoader = (): Promise<unknown> => Promise.resolve(FakeTabulator);

async function settle(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Polls the async grid pipeline (import -> construct -> replaceData -> edit)
// until a condition holds, so tests don't depend on a fixed number of ticks.
async function waitFor(predicate: () => boolean, tries = 40): Promise<void> {
  for (let index = 0; index < tries; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface CellState {
  status: string;
  message: string;
}
function cellState(value: unknown): CellState {
  return (value ?? { status: "", message: "" }) as CellState;
}

afterEach(() => {
  FakeTabulator.instances = [];
  Reflect.deleteProperty(globalThis, "document");
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("Tabulator adapter helpers", () => {
  it("activates only with the exact grid=tabulator opt-in", () => {
    expect(readGridMode("?grid=tabulator")).toBe("tabulator");
    expect(isTabulatorMode("?grid=tabulator&status=draft")).toBe(true);
    expect(readGridMode("?grid=fancy")).toBe("custom");
    expect(readGridMode("?status=draft")).toBe("custom");
    expect(isTabulatorMode("")).toBe(false);
  });

  it("gates editability strictly on the server capability", () => {
    expect(isRowEditable({ capabilities: { updateDraft: true } })).toBe(true);
    expect(isRowEditable({ capabilities: { updateDraft: false } })).toBe(false);
    expect(isRowEditable({ status: "draft" })).toBe(false);
    expect(isRowEditable({ subject: "" })).toBe(false);
    expect(isRowEditable(null)).toBe(false);
  });

  it("builds a changed-field PATCH body with the current lock version only", () => {
    expect(buildPatchPayload("subject", "  New subject ", 4)).toEqual({
      subject: "New subject",
      lockVersion: 4,
    });
    expect(buildPatchPayload("drawingReferences", "", 2)).toEqual({
      drawingReferences: null,
      lockVersion: 2,
    });
  });

  it("normalizes blank values to null", () => {
    expect(normalizeCellValue("  ")).toBeNull();
    expect(normalizeCellValue("A-1")).toBe("A-1");
    expect(normalizeCellValue(null)).toBeNull();
  });

  it("validates required and date fields consistently with the custom register", () => {
    expect(validateField("subject", "")).toContain("required");
    expect(validateField("question", "  ")).toContain("required");
    expect(validateField("requestedResponseDate", "not-a-date")).toContain(
      "valid date",
    );
    expect(validateField("requestedResponseDate", "2026-07-30")).toBeNull();
    expect(validateField("subject", "ok")).toBeNull();
  });

  it("defines the thirteen register columns with capability-gated editors", () => {
    const columns = buildColumnDefinitions({
      projectId: "project-1",
      getContacts: () => fixtureContacts(),
      getCellState: () => undefined,
    });
    const fields = columns.map((column) => column.field);
    expect(fields).toEqual([
      "rfiNumber",
      "subject",
      "status",
      "responsiblePartyId",
      "requestedResponseDate",
      "question",
      "contractorSuggestion",
      "drawingReferences",
      "specificationReferences",
      "latestResponse",
      "issuedAt",
      "updatedAt",
      "open",
    ]);
    // Every editable draft field carries an editor; identity/status/date-derived
    // columns never do.
    for (const field of TABULATOR_EDITABLE_ORDER) {
      const column = columns.find((candidate) => candidate.field === field);
      expect(column?.editor).toBeDefined();
    }
    for (const readOnly of [
      "rfiNumber",
      "status",
      "issuedAt",
      "updatedAt",
      "open",
    ]) {
      const column = columns.find((candidate) => candidate.field === readOnly);
      expect(column?.editor).toBeUndefined();
      expect(column?.editable).toBe(false);
    }
    // Identity columns stay visible while scrolling horizontally.
    expect(columns.find((column) => column.field === "rfiNumber")?.frozen).toBe(
      true,
    );
    expect(columns.find((column) => column.field === "subject")?.frozen).toBe(
      true,
    );
  });

  it("only allows editing of capable rows via the editable callback", () => {
    const columns = buildColumnDefinitions({
      projectId: "project-1",
      getContacts: () => fixtureContacts(),
      getCellState: () => undefined,
    });
    const subject = columns.find((column) => column.field === "subject");
    const editable = subject?.editable as (cell: unknown) => boolean;
    const cellFor = (row: RowData): unknown => ({
      getRow: () => ({ getData: () => row }),
    });
    expect(
      editable(cellFor({ id: "a", capabilities: { updateDraft: true } })),
    ).toBe(true);
    expect(
      editable(cellFor({ id: "b", capabilities: { updateDraft: false } })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Grid controller (with the Tabulator test double)
// ---------------------------------------------------------------------------

function gridHarness(overrides: { commit?: ReturnType<typeof vi.fn> } = {}) {
  const window = new Window({
    url: "https://base.test/projects/project-1/rfis",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.querySelector("#host") as unknown as HTMLElement;
  const rows = makeRfiDataset(3);
  const commit =
    overrides.commit ??
    vi.fn(() =>
      Promise.resolve({ status: "saved", row: { ...rows[0], lockVersion: 2 } }),
    );
  const onOpen = vi.fn();
  const announce = vi.fn();
  const grid = createRfiTabulatorGrid({
    projectId: "project-1",
    loadTabulator: fakeLoader,
    getRows: () => rows,
    getContacts: () => fixtureContacts(),
    commit,
    onOpen,
    announce,
    window,
  });
  return { grid, host, rows, commit, onOpen, announce, document, window };
}

describe("Tabulator grid controller", () => {
  it("sends a cell edit through commit and applies the saved row", async () => {
    const harness = gridHarness();
    await harness.grid.mount(harness.host);
    await settle();
    const table = FakeTabulator.instances[0];
    table.simulateEdit(harness.rows[0].id, "subject", "Reworked subject");
    await settle();
    expect(harness.commit).toHaveBeenCalledWith({
      id: harness.rows[0].id,
      field: "subject",
      value: "Reworked subject",
    });
    expect(table.getRow(harness.rows[0].id)?.getData().lockVersion).toBe(2);
    expect(
      harness.grid._getCellState(harness.rows[0].id, "subject"),
    ).toMatchObject({
      status: "saved",
    });
  });

  it("keeps an invalid edit at the cell without calling commit", async () => {
    const harness = gridHarness();
    await harness.grid.mount(harness.host);
    await settle();
    const table = FakeTabulator.instances[0];
    table.simulateEdit(harness.rows[0].id, "subject", "   ");
    await settle();
    expect(harness.commit).not.toHaveBeenCalled();
    expect(
      harness.grid._getCellState(harness.rows[0].id, "subject"),
    ).toMatchObject({
      status: "failed",
    });
  });

  it("reloads and restores focus on a version conflict", async () => {
    const reloaded = makeRfiDataset(3).map((row) => ({
      ...row,
      subject: `Reloaded ${row.id}`,
    }));
    const commit = vi.fn(() =>
      Promise.resolve({
        status: "conflict",
        message: "Changed elsewhere. Latest value loaded; review and retry.",
        rows: reloaded,
      }),
    );
    const harness = gridHarness({ commit });
    await harness.grid.mount(harness.host);
    await settle();
    const table = FakeTabulator.instances[0];
    table.simulateEdit(harness.rows[0].id, "subject", "My stale change");
    await settle();
    const state = cellState(
      harness.grid._getCellState(harness.rows[0].id, "subject"),
    );
    expect(state.status).toBe("failed");
    expect(state.message).toContain("Latest value loaded");
    expect(table.getRow(harness.rows[0].id)?.getData().subject).toContain(
      "Reloaded",
    );
  });

  it("marks the cell read-only-failed on permission loss", async () => {
    const commit = vi.fn(() =>
      Promise.resolve({
        status: "permission",
        message: "You no longer have permission to edit this draft.",
      }),
    );
    const harness = gridHarness({ commit });
    await harness.grid.mount(harness.host);
    await settle();
    const table = FakeTabulator.instances[0];
    table.simulateEdit(harness.rows[0].id, "subject", "Denied change");
    await settle();
    const state = cellState(
      harness.grid._getCellState(harness.rows[0].id, "subject"),
    );
    expect(state.status).toBe("failed");
    expect(state.message).toContain("permission");
  });

  it("navigates only on an unmodified click of an explicit open link", async () => {
    const harness = gridHarness();
    await harness.grid.mount(harness.host);
    await settle();
    const link = harness.document.createElement("a");
    link.setAttribute("data-open-rfi", "rfi-00001");
    harness.host.appendChild(link);

    const modified = new harness.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    }) as unknown as Event;
    link.dispatchEvent(modified);
    expect(harness.onOpen).not.toHaveBeenCalled();

    const plain = new harness.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }) as unknown as Event;
    Object.defineProperty(plain, "button", { value: 0 });
    link.dispatchEvent(plain);
    expect(harness.onOpen).toHaveBeenCalledWith("rfi-00001");
  });

  it("destroys the underlying table on teardown", async () => {
    const harness = gridHarness();
    await harness.grid.mount(harness.host);
    await settle();
    const table = FakeTabulator.instances[0];
    harness.grid.destroy();
    expect(table.destroyed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Register view A/B integration
// ---------------------------------------------------------------------------

function mountRegister(
  options: {
    url?: string;
    rows?: RowData[];
    update?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    reloadRows?: RowData[];
  } = {},
) {
  const window = new Window({
    url:
      options.url ?? "https://base.test/projects/project-1/rfis?grid=tabulator",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<main id="root"></main>';
  const root = document.querySelector("#root") as unknown as HTMLElement;
  const rows = options.rows ?? makeRfiDataset(4);
  let reads = 0;
  const api = {
    getProjectRfis: vi.fn(() =>
      Promise.resolve({
        data: {
          project: { id: "project-1", name: "Library" },
          rfis: reads++ > 0 && options.reloadRows ? options.reloadRows : rows,
          responsibleContacts: fixtureContacts(),
          capabilities: { createRfi: true },
        },
      }),
    ),
    updateRfi:
      options.update ??
      vi.fn((_projectId: string, id: string, values: Record<string, unknown>) =>
        Promise.resolve({
          data: {
            ...rows.find((row) => row.id === id),
            ...values,
            lockVersion: 2,
          },
        }),
      ),
    createRfi:
      options.create ??
      vi.fn(() =>
        Promise.resolve({
          data: {
            ...makeRfiDataset(1)[0],
            id: "rfi-new",
            subject: "Untitled RFI",
            rfiNumber: null,
            capabilities: { updateDraft: true },
          },
        }),
      ),
  };
  const navigate = vi.fn();
  const announce = vi.fn();
  const holder: { current?: ReturnType<typeof createRfisView> } = {};
  const render = () => {
    holder.current?.mount(root);
  };
  const view = createRfisView({
    api,
    navigate,
    announce,
    requestRender: render,
    projectId: "project-1",
    tabulatorLoader: fakeLoader,
  });
  holder.current = view;
  return { window, document, root, api, navigate, announce, view };
}

describe("RFI register A/B mode", () => {
  it("renders the Tabulator host only when grid=tabulator is set", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    await settle();
    expect(harness.root.querySelector("[data-tabulator-host]")).not.toBeNull();
    expect(harness.root.querySelector(".rfi-table")).toBeNull();
    expect(FakeTabulator.instances.length).toBeGreaterThan(0);
    harness.view.destroy();
  });

  it("keeps the custom table as the default implementation", async () => {
    const harness = mountRegister({
      url: "https://base.test/projects/project-1/rfis",
    });
    await harness.view.reload();
    await settle();
    expect(harness.root.querySelector(".rfi-table")).not.toBeNull();
    expect(harness.root.querySelector("[data-tabulator-host]")).toBeNull();
    expect(FakeTabulator.instances.length).toBe(0);
    harness.view.destroy();
  });

  it("still renders the dedicated mobile cards alongside the grid", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    await settle();
    const cards = harness.root.querySelector(".rfi-cards");
    expect(cards).not.toBeNull();
    expect(cards?.textContent).toContain("coordination of assembly");
    harness.view.destroy();
  });

  it("PATCHes only the changed field plus lockVersion and preserves URL filters", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    await settle();
    const status = harness.root.querySelector(
      "#rfi-status",
    ) as unknown as HTMLSelectElement;
    status.value = "draft";
    status.dispatchEvent(
      new harness.window.Event("change", { bubbles: true }) as unknown as Event,
    );
    expect(harness.window.location.search).toContain("status=draft");
    expect(harness.window.location.search).toContain("grid=tabulator");

    const table = FakeTabulator.instances[0];
    table.simulateEdit("rfi-00000", "subject", "Edited via Tabulator");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledWith(
      "project-1",
      "rfi-00000",
      {
        subject: "Edited via Tabulator",
        lockVersion: 1,
      },
    );
    expect(harness.window.location.search).toContain("grid=tabulator");
    harness.view.destroy();
  });

  it("reloads the authorized list on a 409 conflict", async () => {
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    const update = vi.fn(() => Promise.reject(conflict));
    const reloadRows = makeRfiDataset(4).map((row) => ({
      ...row,
      subject: `Changed elsewhere ${row.id}`,
    }));
    const harness = mountRegister({ update, reloadRows });
    await harness.view.reload();
    await settle();
    const table = FakeTabulator.instances[0];
    table.simulateEdit("rfi-00000", "subject", "My stale value");
    await settle();
    expect(harness.api.getProjectRfis).toHaveBeenCalledTimes(2);
    expect(table.getRow("rfi-00000")?.getData().subject).toContain(
      "Changed elsewhere",
    );
    harness.view.destroy();
  });

  it("adds an RFI and drops focus into the new Subject editor", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    await settle();
    const addButton = harness.root.querySelector(
      ".rfi-heading [data-create-rfi]",
    ) as unknown as HTMLButtonElement;
    addButton.dispatchEvent(
      new harness.window.Event("click", { bubbles: true }) as unknown as Event,
    );
    await waitFor(() =>
      FakeTabulator.instances.some((t) => t.edited.includes("rfi-new:subject")),
    );
    expect(harness.api.createRfi).toHaveBeenCalledTimes(1);
    const table = FakeTabulator.instances.find((t) =>
      t.edited.includes("rfi-new:subject"),
    );
    expect(table?.edited).toContain("rfi-new:subject");
    harness.view.destroy();
  });

  it("destroys the Tabulator instance when the route is left", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    await settle();
    const table = FakeTabulator.instances[0];
    harness.view.destroy();
    expect(table.destroyed).toBe(true);
  });
});
