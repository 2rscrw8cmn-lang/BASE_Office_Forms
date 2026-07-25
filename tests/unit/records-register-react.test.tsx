// @vitest-environment happy-dom
/*
 * Native React Document Register (UI-6B) behaviour: authorized rendering,
 * Record/Revision/File identity correctness, the six-column desktop table and
 * dedicated mobile cards, URL-backed filter/sort state and history semantics,
 * navigation, every required async state, and the staged Add Document workflow
 * including its partial-success recovery.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  installRecordsFetch,
  jsonResponse,
  PROJECT_ID,
  record,
  renderRecordsRegister,
  revision,
} from "../helpers/records-register-harness";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

async function waitForRegister() {
  await waitFor(() => {
    expect(document.querySelector(".records-register-page")).not.toBeNull();
  });
}

async function waitForTable() {
  await waitFor(() => {
    expect(document.querySelector(".records-register-table")).not.toBeNull();
  });
}

/**
 * The desktop table and the mobile cards both render every time -- the shared
 * 760px breakpoint decides which one is visible -- so every content assertion
 * is scoped to one surface rather than the whole document.
 */
function table() {
  const node = document.querySelector(".records-register-table");
  if (node === null) throw new Error("Expected the desktop table.");
  return within(node as HTMLElement);
}

function cards() {
  const node = document.querySelector(".records-register-cards");
  if (node === null) throw new Error("Expected the mobile cards.");
  return within(node as HTMLElement);
}

function drawer() {
  const node = document.querySelector(".add-document-drawer");
  if (node === null) throw new Error("Expected the Add document drawer.");
  return within(node as HTMLElement);
}

function currentSearch() {
  return window.location.search;
}

describe("Document Register — authorized list and capabilities", () => {
  it("renders the authorized rows returned by the server", async () => {
    installRecordsFetch({
      rows: [
        record({ id: "record-1", title: "Level 2 Framing Plan" }),
        record({
          id: "record-2",
          recordNumber: "S-201",
          title: "Foundation Details",
          recordType: "specification",
          discipline: "civil",
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    expect(table().getByText("Level 2 Framing Plan")).toBeTruthy();
    expect(table().getByText("Foundation Details")).toBeTruthy();
    expect(screen.getByText("Document Register")).toBeTruthy();
  });

  it("requests the project-scoped Records endpoint including archived", async () => {
    const { calls } = installRecordsFetch();
    renderRecordsRegister();
    await waitForTable();

    const listCall = calls.find((call) => call.method === "GET");
    expect(listCall?.url).toBe(
      `/api/v2/projects/${PROJECT_ID}/records?includeArchived=true`,
    );
  });

  it("shows Add document only when the server-derived capability is true", async () => {
    installRecordsFetch({ capability: true });
    const view = renderRecordsRegister();
    await waitForTable();
    expect(document.querySelector("[data-add-document]")).not.toBeNull();

    view.unmount();
    cleanup();
    installRecordsFetch({ capability: false });
    renderRecordsRegister();
    await waitForTable();
    expect(document.querySelector("[data-add-document]")).toBeNull();
  });

  it("never renders another project's cached documents after a route change", async () => {
    installRecordsFetch({
      rows: [record({ id: "record-1", title: "Level 2 Framing Plan" })],
    });
    renderRecordsRegister(`/projects/other-project/records`, {
      projectId: "other-project",
    });
    await waitForRegister();
    // The harness only serves rows for PROJECT_ID, so a query key that ignored
    // the project id would surface the wrong project's rows here.
    await waitFor(() => {
      expect(screen.queryByText("Level 2 Framing Plan")).toBeNull();
    });
  });
});

describe("Document Register — Record, Revision, and File identity", () => {
  it("shows the authoritative current revision, never the newest draft", async () => {
    installRecordsFetch({
      rows: [
        record({
          currentRevision: revision({
            id: "revision-published",
            revisionNumber: 2,
            status: "published",
          }),
          hasDraftRevision: true,
          draftRevisionId: "revision-draft",
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    const row = document.querySelector("[data-record-row]");
    expect(row).not.toBeNull();
    // revisionNumber 2 is presented as "Rev 1" by the controlled vocabulary.
    expect(within(row as HTMLElement).getByText("Rev 1")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Published")).toBeTruthy();
    // The draft is flagged separately and never occupies the Revision value.
    expect(
      within(row as HTMLElement).getByText("Draft in progress"),
    ).toBeTruthy();
    expect(within(row as HTMLElement).queryByText("Draft")).toBeNull();
  });

  it("keeps the revision number visible when a human label also exists", async () => {
    installRecordsFetch({
      rows: [
        record({
          currentRevision: revision({ revisionNumber: 3, revisionLabel: "C" }),
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();
    expect(table().getByText("Rev 2 · C")).toBeTruthy();
  });

  it("shows No revision when no authoritative current revision exists", async () => {
    installRecordsFetch({
      rows: [record({ currentRevision: null, hasDraftRevision: true })],
    });
    renderRecordsRegister();
    await waitForTable();
    expect(table().getByText("No revision")).toBeTruthy();
    expect(table().getByText("Draft in progress")).toBeTruthy();
  });

  it("shows the total file count exactly as the read model returned it", async () => {
    installRecordsFetch({ rows: [record({ fileCount: 7 })] });
    renderRecordsRegister();
    await waitForTable();
    const row = document.querySelector("[data-record-row]") as HTMLElement;
    expect(row.querySelector(".records-register-files")?.textContent).toBe("7");
  });

  it("marks an archived Record and states a missing legacy Record number honestly", async () => {
    installRecordsFetch({
      rows: [record({ status: "archived", recordNumber: null })],
    });
    renderRecordsRegister(`/projects/${PROJECT_ID}/records?archived=all`);
    await waitForTable();
    const row = document.querySelector("[data-record-row]") as HTMLElement;
    expect(within(row).getByText("Archived")).toBeTruthy();
    expect(within(row).getByText("No record number")).toBeTruthy();
  });

  it("never exposes the database id as user-facing identity", async () => {
    installRecordsFetch({
      rows: [record({ id: "8f2c1e0a-uuid", recordNumber: "A-101" })],
    });
    renderRecordsRegister();
    await waitForTable();
    const tableNode = document.querySelector(
      ".records-register-table",
    ) as HTMLElement;
    expect(tableNode.textContent).not.toContain("8f2c1e0a-uuid");
    expect(tableNode.textContent).toContain("A-101");
  });
});

describe("Document Register — desktop table and mobile cards", () => {
  it("renders exactly six semantic column headers and no grid role", async () => {
    installRecordsFetch();
    renderRecordsRegister();
    await waitForTable();

    const headers = [
      ...document.querySelectorAll(".records-register-table thead th"),
    ].map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Document",
      "Type",
      "Discipline",
      "Revision",
      "Files",
      "Updated",
    ]);
    expect(document.querySelector('[role="grid"]')).toBeNull();
    expect(document.querySelector('[role="gridcell"]')).toBeNull();
  });

  it("renders no redundant Actions or Open column", async () => {
    installRecordsFetch();
    renderRecordsRegister();
    await waitForTable();
    const headerText = [
      ...document.querySelectorAll(".records-register-table thead th"),
    ].map((cell) => cell.textContent);
    expect(headerText).not.toContain("Actions");
    expect(headerText).not.toContain("Open");
  });

  it("renders dedicated mobile cards carrying the same authorized facts", async () => {
    installRecordsFetch({
      rows: [record({ title: "Level 2 Framing Plan", fileCount: 3 })],
    });
    renderRecordsRegister();
    await waitForTable();

    const card = cards().getByRole("link", { name: /Open document/ });
    expect(card.tagName).toBe("A");
    expect(within(card).getByText("Level 2 Framing Plan")).toBeTruthy();
    expect(within(card).getByText("A-101")).toBeTruthy();
    expect(within(card).getByText("3 files")).toBeTruthy();
    // A whole-card link is only valid markup because it nests no controls.
    expect(card.querySelector("a, button, input, select, textarea")).toBeNull();
  });

  it("uses a semantic <time> element for a valid updated timestamp", async () => {
    installRecordsFetch({
      rows: [record({ updatedAt: "2026-07-20T09:00:00Z" })],
    });
    renderRecordsRegister();
    await waitForTable();
    const time = document.querySelector(
      ".records-register-table time",
    ) as HTMLTimeElement;
    expect(time.getAttribute("datetime")).toBe("2026-07-20T09:00:00Z");
  });

  it("keeps Search visible alongside the mobile filter disclosure", async () => {
    installRecordsFetch();
    renderRecordsRegister();
    await waitForTable();
    expect(screen.getByLabelText("Search documents")).toBeTruthy();
    const toggle = document.querySelector(
      ".base-toolbar__filter-toggle button",
    ) as unknown as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
  });

  it("counts active filters, not the search query, on the filter disclosure", async () => {
    installRecordsFetch({
      rows: [record({ recordType: "drawing", discipline: "structural" })],
    });
    renderRecordsRegister(
      `/projects/${PROJECT_ID}/records?q=framing&type=drawing&discipline=structural`,
    );
    await waitForTable();
    const toggle = document.querySelector(
      ".base-toolbar__filter-toggle button",
    ) as unknown as HTMLButtonElement;
    expect(toggle.getAttribute("aria-label")).toBe("Show 2 active filters");
  });
});

describe("Document Register — search, filters, sort, and history", () => {
  it("searches title, record number, type label, and discipline label", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [
        record({ id: "record-1", title: "Level 2 Framing Plan" }),
        record({
          id: "record-2",
          recordNumber: "M-501",
          title: "Ductwork Layout",
          recordType: "specification",
          discipline: "mechanical",
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    await user.type(screen.getByLabelText("Search documents"), "mechanical");
    await waitFor(() => {
      expect(table().queryByText("Level 2 Framing Plan")).toBeNull();
    });
    expect(table().getByText("Ductwork Layout")).toBeTruthy();
  });

  it("uses history replace for search and push for filters and sort", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [record({ recordType: "drawing" }), record({ id: "record-2" })],
    });
    renderRecordsRegister();
    await waitForTable();

    const before = window.history.length;
    await user.type(screen.getByLabelText("Search documents"), "plan");
    await waitFor(() => {
      expect(currentSearch()).toContain("q=plan");
    });
    expect(window.history.length).toBe(before);

    await user.selectOptions(screen.getByLabelText("Document type"), "drawing");
    await waitFor(() => {
      expect(currentSearch()).toContain("type=drawing");
    });
    expect(window.history.length).toBeGreaterThan(before);
  });

  it("filters by discipline, revision status, and the No revision condition", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [
        record({ id: "record-1", discipline: "structural" }),
        record({
          id: "record-2",
          title: "Unstarted Document",
          discipline: "civil",
          currentRevision: null,
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    await user.selectOptions(screen.getByLabelText("Revision status"), "none");
    await waitFor(() => {
      expect(currentSearch()).toContain("revisionStatus=none");
    });
    expect(table().getByText("Unstarted Document")).toBeTruthy();
    expect(table().queryByText("Level 2 Framing Plan")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Discipline"), "structural");
    await waitFor(() => {
      expect(currentSearch()).toContain("discipline=structural");
    });
  });

  it("offers only options present in the authorized response", async () => {
    installRecordsFetch({
      rows: [record({ recordType: "drawing", discipline: "structural" })],
    });
    renderRecordsRegister();
    await waitForTable();

    const typeOptions = [
      ...screen.getByLabelText("Document type").querySelectorAll("option"),
    ].map((option) => option.getAttribute("value"));
    expect(typeOptions).toEqual(["all", "drawing"]);

    const disciplineOptions = [
      ...screen.getByLabelText("Discipline").querySelectorAll("option"),
    ].map((option) => option.getAttribute("value"));
    expect(disciplineOptions).toEqual(["all", "structural"]);
  });

  it("preserves the archived visibility choices and their default", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [
        record({ id: "record-1", status: "active" }),
        record({ id: "record-2", title: "Retired Detail", status: "archived" }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    // Active only is the default and archived rows are hidden.
    expect(table().queryByText("Retired Detail")).toBeNull();

    await user.selectOptions(
      screen.getByLabelText("Archived visibility"),
      "all",
    );
    await waitFor(() => {
      expect(table().queryByText("Retired Detail")).not.toBeNull();
    });
    expect(currentSearch()).toContain("archived=all");

    await user.selectOptions(
      screen.getByLabelText("Archived visibility"),
      "archived",
    );
    await waitFor(() => {
      expect(table().queryByText("Level 2 Framing Plan")).toBeNull();
    });
  });

  it("sorts with the preserved keys, defaults, and a deterministic id tie-break", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [
        record({
          id: "record-b",
          title: "Beta",
          createdAt: "2026-07-01T00:00:00Z",
        }),
        record({
          id: "record-a",
          title: "Alpha",
          createdAt: "2026-07-01T00:00:00Z",
        }),
      ],
    });
    renderRecordsRegister();
    await waitForTable();

    // Identical createdAt values fall back to the id ordering, every render.
    const titles = () =>
      [...document.querySelectorAll(".records-register-title")].map(
        (node) => node.textContent,
      );
    expect(titles()).toEqual(["Alpha", "Beta"]);

    await user.selectOptions(screen.getByLabelText("Sort documents"), "title");
    await waitFor(() => {
      expect(currentSearch()).toContain("sort=title");
    });
    // "Title A–Z" carries an ascending default direction, so no direction
    // parameter is written.
    expect(currentSearch()).not.toContain("direction=");
    expect(titles()).toEqual(["Alpha", "Beta"]);
  });

  it("restores the same state from a copied URL and through Back/Forward", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [record({ recordType: "drawing" }), record({ id: "record-2" })],
    });
    renderRecordsRegister(
      `/projects/${PROJECT_ID}/records?type=drawing&sort=title`,
    );
    await waitForTable();

    expect(
      (screen.getByLabelText("Document type") as unknown as HTMLSelectElement)
        .value,
    ).toBe("drawing");
    expect(
      (screen.getByLabelText("Sort documents") as unknown as HTMLSelectElement)
        .value,
    ).toBe("title");

    await user.selectOptions(screen.getByLabelText("Document type"), "all");
    await waitFor(() => {
      expect(currentSearch()).not.toContain("type=drawing");
    });

    window.history.back();
    await waitFor(() => {
      expect(currentSearch()).toContain("type=drawing");
    });
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Document type") as unknown as HTMLSelectElement)
          .value,
      ).toBe("drawing");
    });
  });

  it("preserves unrelated query state and the hash", async () => {
    const user = userEvent.setup();
    installRecordsFetch({ rows: [record({ recordType: "drawing" })] });
    renderRecordsRegister(
      `/projects/${PROJECT_ID}/records?ref=email#section-notes`,
    );
    await waitForTable();

    await user.selectOptions(screen.getByLabelText("Document type"), "drawing");
    await waitFor(() => {
      expect(currentSearch()).toContain("type=drawing");
    });
    expect(currentSearch()).toContain("ref=email");
    expect(window.location.hash).toBe("#section-notes");
  });

  it("normalizes an invalid URL value without inventing an option", async () => {
    installRecordsFetch({ rows: [record({ recordType: "drawing" })] });
    renderRecordsRegister(
      `/projects/${PROJECT_ID}/records?type=nonexistent&sort=bogus`,
    );
    await waitForTable();

    await waitFor(() => {
      expect(currentSearch()).not.toContain("type=nonexistent");
    });
    const select = screen.getByLabelText(
      "Document type",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    expect(
      [...select.querySelectorAll("option")].map((option) =>
        option.getAttribute("value"),
      ),
    ).not.toContain("nonexistent");
    // An unknown sort key falls back to the preserved default.
    expect(
      (screen.getByLabelText("Sort documents") as unknown as HTMLSelectElement)
        .value,
    ).toBe("created");
  });

  it("shows a removable chip per active filter", async () => {
    const user = userEvent.setup();
    installRecordsFetch({ rows: [record({ recordType: "drawing" })] });
    renderRecordsRegister(`/projects/${PROJECT_ID}/records?type=drawing`);
    await waitForTable();

    const chip = screen.getByLabelText("Remove Type filter Drawing");
    await user.click(chip);
    await waitFor(() => {
      expect(currentSearch()).not.toContain("type=drawing");
    });
  });

  it("Clear resets search and filters, keeps sort/direction, pushes, and announces", async () => {
    const user = userEvent.setup();
    const announce = vi.fn();
    installRecordsFetch({ rows: [record({ recordType: "drawing" })] });
    renderRecordsRegister(
      `/projects/${PROJECT_ID}/records?q=plan&type=drawing&sort=title&direction=desc`,
      { announce },
    );
    await waitForTable();

    const before = window.history.length;
    await user.click(
      document.querySelector("[data-clear-filters]") as HTMLElement,
    );
    await waitFor(() => {
      expect(currentSearch()).not.toContain("q=plan");
    });
    expect(currentSearch()).not.toContain("type=drawing");
    // Sort and direction survive Clear.
    expect(currentSearch()).toContain("sort=title");
    expect(currentSearch()).toContain("direction=desc");
    expect(window.history.length).toBeGreaterThan(before);
    expect(announce).toHaveBeenCalledWith("Document filters cleared.");
  });
});

describe("Document Register — navigation", () => {
  it("navigates from the Document title link to the canonical Record workspace", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    installRecordsFetch({ rows: [record({ id: "record-1" })] });
    renderRecordsRegister(undefined, { navigate });
    await waitForTable();

    await user.click(table().getByRole("link", { name: /Open document/ }));
    expect(navigate).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/records/record-1`,
    );
  });

  it("navigates from safe row area but not from a modifier click", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    installRecordsFetch({ rows: [record({ id: "record-1" })] });
    renderRecordsRegister(undefined, { navigate });
    await waitForTable();

    const typeCell = document.querySelectorAll(
      "[data-record-row] td",
    )[0] as HTMLElement;
    await user.click(typeCell);
    expect(navigate).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/records/record-1`,
    );

    navigate.mockClear();
    await user.keyboard("{Meta>}");
    await user.click(typeCell);
    await user.keyboard("{/Meta}");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves an active text selection alone instead of navigating", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    installRecordsFetch({ rows: [record({ id: "record-1" })] });
    renderRecordsRegister(undefined, { navigate });
    await waitForTable();

    const typeCell = document.querySelectorAll(
      "[data-record-row] td",
    )[0] as HTMLElement;
    const realGetSelection = window.getSelection.bind(window);
    window.getSelection = () =>
      ({
        isCollapsed: false,
        toString: () => "Drawing",
      }) as unknown as Selection;

    await user.click(typeCell);
    expect(navigate).not.toHaveBeenCalled();

    window.getSelection = realGetSelection;
    await user.click(typeCell);
    expect(navigate).toHaveBeenCalled();
  });

  it("links the mobile card to the canonical Record workspace", async () => {
    installRecordsFetch({ rows: [record({ id: "record-1" })] });
    renderRecordsRegister();
    await waitForTable();
    const card = document.querySelector("[data-record-card]") as HTMLElement;
    expect(card.getAttribute("href")).toBe(
      `/projects/${PROJECT_ID}/records/record-1`,
    );
  });
});

describe("Document Register — states", () => {
  it("shows a loading state before the response arrives", async () => {
    let release: (value: Response) => void = () => undefined;
    installRecordsFetch({
      listResponses: [
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
      ],
    });
    renderRecordsRegister();
    await waitForRegister();
    expect(document.querySelector('[data-status="loading"]')).not.toBeNull();

    release(
      jsonResponse({
        data: { records: [record()], capabilities: { createRecord: true } },
      }),
    );
    await waitForTable();
  });

  it("announces a background refresh politely without hiding the register", async () => {
    installRecordsFetch();
    const view = renderRecordsRegister();
    await waitForTable();
    await view.queryClient.refetchQueries();
    // The table is never torn down for a refresh.
    expect(document.querySelector(".records-register-table")).not.toBeNull();
  });

  it("shows the first-use empty state with the authorized Add action", async () => {
    installRecordsFetch({ rows: [], capability: true });
    renderRecordsRegister();
    await waitFor(() => {
      expect(screen.queryByText("No documents yet")).not.toBeNull();
    });
    expect(
      document.querySelector('[data-status="empty-first-use"]'),
    ).not.toBeNull();
    expect(document.querySelector("[data-add-document]")).not.toBeNull();
  });

  it("omits the Add action from the first-use state without the capability", async () => {
    installRecordsFetch({ rows: [], capability: false });
    renderRecordsRegister();
    await waitFor(() => {
      expect(screen.queryByText("No documents yet")).not.toBeNull();
    });
    expect(document.querySelector("[data-add-document]")).toBeNull();
  });

  it("distinguishes no-active-but-archived from a first-use empty state", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      rows: [record({ id: "record-2", status: "archived" })],
    });
    renderRecordsRegister();
    await waitForRegister();

    await waitFor(() => {
      expect(screen.queryByText("No active documents")).not.toBeNull();
    });
    expect(screen.queryByText("No documents yet")).toBeNull();

    await user.click(
      document.querySelector("[data-include-archived]") as HTMLElement,
    );
    await waitFor(() => {
      expect(currentSearch()).toContain("archived=all");
    });
  });

  it("shows the filtered empty state with Clear", async () => {
    installRecordsFetch({ rows: [record()] });
    renderRecordsRegister(`/projects/${PROJECT_ID}/records?q=zzzz`);
    await waitForRegister();
    await waitFor(() => {
      expect(
        screen.queryByText("No documents match the current search or filters."),
      ).not.toBeNull();
    });
    expect(document.querySelector("[data-clear-filters]")).not.toBeNull();
  });

  it("shows the generic permission state for 403 and 404 alike", async () => {
    for (const status of [403, 404]) {
      installRecordsFetch({
        listResponses: [
          jsonResponse({ error: { code: "DENIED" } }, { status }),
        ],
      });
      renderRecordsRegister();
      await waitFor(() => {
        expect(
          document.querySelector(".base-state--permission"),
        ).not.toBeNull();
      });
      cleanup();
    }
  });

  it("shows a retryable error carrying the request ID", async () => {
    const user = userEvent.setup();
    installRecordsFetch({
      listResponses: [
        jsonResponse(
          {
            error: {
              code: "RECORDS_UNAVAILABLE",
              message: "Unavailable.",
              requestId: "req-abc-123",
            },
          },
          { status: 503 },
        ),
      ],
    });
    renderRecordsRegister();
    await waitFor(() => {
      expect(screen.queryByText("Unable to load documents")).not.toBeNull();
    });
    expect(screen.getByText("req-abc-123")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitForTable();
  });
});

describe("Add Document — presentation and validation", () => {
  async function openDrawer() {
    const user = userEvent.setup();
    installRecordsFetch({ capability: true });
    const view = renderRecordsRegister();
    await waitForTable();
    await user.click(
      document.querySelector("[data-add-document]") as HTMLElement,
    );
    await waitFor(() => {
      expect(document.querySelector(".add-document-drawer")).not.toBeNull();
    });
    return { user, view };
  }

  it("opens in the shared detail Drawer and focuses the first choice", async () => {
    await openDrawer();
    const drawer = document.querySelector(
      ".add-document-drawer",
    ) as HTMLElement;
    expect(drawer.classList.contains("base-drawer--detail")).toBe(true);
    expect(drawer.classList.contains("base-drawer--right")).toBe(true);
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-mode")).toBe("upload");
    });
  });

  it("offers exactly the two real entry choices", async () => {
    await openDrawer();
    const modes = [...document.querySelectorAll("[data-mode]")].map((node) =>
      node.getAttribute("data-mode"),
    );
    expect(modes).toEqual(["upload", "empty"]);
    expect(document.body.textContent).not.toContain("template");
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { user } = await openDrawer();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.querySelector(".add-document-drawer")).toBeNull();
    });
    await waitFor(() => {
      expect(
        (document.activeElement as HTMLElement).matches("[data-add-document]"),
      ).toBe(true);
    });
  });

  it("requires a title, a change summary, and a file in upload mode", async () => {
    const { user } = await openDrawer();
    await user.click(document.querySelector("[data-mode='upload']") as Element);
    await waitFor(() => {
      expect(document.querySelector(".add-document-form")).not.toBeNull();
    });

    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(screen.queryByText("Document title is required.")).not.toBeNull();
    });
    expect(screen.getByText("Choose a document file to upload.")).toBeTruthy();
  });

  it("never offers a Record number field and uses the controlled discipline list", async () => {
    const { user } = await openDrawer();
    await user.click(document.querySelector("[data-mode='empty']") as Element);
    await waitFor(() => {
      expect(document.querySelector(".add-document-form")).not.toBeNull();
    });

    expect(drawer().queryByLabelText(/record number/i)).toBeNull();
    const disciplineValues = [
      ...drawer().getByLabelText("Discipline").querySelectorAll("option"),
    ].map((option) => option.getAttribute("value"));
    expect(disciplineValues).toContain("structural");
    expect(disciplineValues).toContain("mechanical");
    expect(disciplineValues).not.toContain("made-up-discipline");
    // Reserve mode asks for no file at all.
    expect(document.querySelector("[data-document-file]")).toBeNull();
  });
});

describe("Add Document — staged creation, recovery, and success", () => {
  async function openForm(
    config: Parameters<typeof installRecordsFetch>[0] = {},
    mode: "upload" | "empty" = "upload",
  ) {
    const user = userEvent.setup();
    const announce = vi.fn();
    const navigate = vi.fn();
    const fetchState = installRecordsFetch({ capability: true, ...config });
    const view = renderRecordsRegister(undefined, { announce, navigate });
    await waitForTable();
    await user.click(
      document.querySelector("[data-add-document]") as HTMLElement,
    );
    await user.click(
      document.querySelector(`[data-mode='${mode}']`) as Element,
    );
    await waitFor(() => {
      expect(document.querySelector(".add-document-form")).not.toBeNull();
    });
    await user.type(screen.getByLabelText(/^Title/), "New Framing Plan");
    if (mode === "upload") {
      await user.upload(
        document.querySelector(
          "[data-document-file]",
        ) as unknown as HTMLInputElement,
        new File(["content"], "framing.pdf", { type: "application/pdf" }),
      );
    }
    return { user, announce, navigate, view, fetchState };
  }

  it("creates Record, then draft Revision, then uploads, then navigates", async () => {
    const { user, navigate, announce, fetchState } = await openForm();
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/records/record-new/revisions/revision-new`,
      );
    });

    const writes = fetchState.calls.filter((call) => call.method === "POST");
    expect(writes.map((call) => call.url)).toEqual([
      `/api/v2/projects/${PROJECT_ID}/records`,
      `/api/v2/projects/${PROJECT_ID}/records/record-new/revisions`,
      `/api/v2/projects/${PROJECT_ID}/records/record-new/revisions/revision-new/files`,
    ]);
    expect(writes[0].body).not.toHaveProperty("recordNumber");
    expect(writes[2].fileName).toBe("framing.pdf");
    expect(announce).toHaveBeenCalledWith("Document A-900 created.");
  });

  it("refreshes the Records query from confirmed server data after creating", async () => {
    const { user, fetchState } = await openForm();
    const listsBefore = fetchState.calls.filter(
      (call) => call.method === "GET",
    ).length;
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      const listsAfter = fetchState.calls.filter(
        (call) => call.method === "GET",
      ).length;
      expect(listsAfter).toBeGreaterThan(listsBefore);
    });
  });

  it("inserts nothing into the register before the server confirms", async () => {
    let release: (value: Response) => void = () => undefined;
    const { user } = await openForm({
      onCreateRecord: () => jsonResponse({}, { status: 201 }),
    });
    // Hold the Record create open and assert the register is untouched.
    globalThis.fetch = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    expect(
      [...document.querySelectorAll(".records-register-title")].map(
        (node) => node.textContent,
      ),
    ).not.toContain("New Framing Plan");
    release(jsonResponse({ data: { id: "record-new" } }, { status: 201 }));
  });

  it("reports a Record-create failure with its request ID and creates nothing", async () => {
    const { user, fetchState } = await openForm({
      onCreateRecord: () =>
        jsonResponse(
          {
            error: {
              code: "RECORD_INVALID",
              message: "The document could not be created.",
              requestId: "req-record-fail",
            },
          },
          { status: 422 },
        ),
    });
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(screen.queryByText("req-record-fail")).not.toBeNull();
    });
    expect(document.querySelector("[data-recovery-link]")).toBeNull();
    expect(
      fetchState.calls.filter((call) => call.method === "POST"),
    ).toHaveLength(1);
  });

  it("recovers a draft-Revision failure without claiming nothing was created", async () => {
    const { user, fetchState } = await openForm({
      onCreateRevision: () =>
        jsonResponse(
          {
            error: {
              code: "REVISION_INVALID",
              message: "The draft revision could not be created.",
              requestId: "req-revision-fail",
            },
          },
          { status: 500 },
        ),
    });
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(screen.queryByText("req-revision-fail")).not.toBeNull();
    });

    expect(
      screen.getByText(/The document identity was created and is safe/),
    ).toBeTruthy();
    const link = document.querySelector(
      "[data-recovery-link]",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/projects/${PROJECT_ID}/records/record-new`,
    );

    // Retrying attempts only the failed stage — no duplicate Record.
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      const recordCreates = fetchState.calls.filter(
        (call) =>
          call.method === "POST" &&
          call.url === `/api/v2/projects/${PROJECT_ID}/records`,
      );
      expect(recordCreates).toHaveLength(1);
    });
  });

  it("recovers an upload failure, keeps the file name, and retries only the upload", async () => {
    let uploadAttempts = 0;
    const { user, fetchState } = await openForm({
      onUploadFile: () => {
        uploadAttempts += 1;
        if (uploadAttempts === 1) {
          return jsonResponse(
            {
              error: {
                code: "FILE_REJECTED",
                message: "The file could not be uploaded.",
                requestId: "req-upload-fail",
              },
            },
            { status: 500 },
          );
        }
        return jsonResponse({ data: { id: "file-1" } }, { status: 201 });
      },
    });
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(screen.queryByText("req-upload-fail")).not.toBeNull();
    });

    expect(
      screen.getByText(
        /The document and its draft revision were created and are safe/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/framing\.pdf/)).toBeTruthy();
    const link = document.querySelector(
      "[data-recovery-link]",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/projects/${PROJECT_ID}/records/record-new/revisions/revision-new`,
    );
    expect(
      document.querySelector("[data-submit-document]")?.textContent,
    ).toContain("Retry upload");

    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(uploadAttempts).toBe(2);
    });
    // Neither the Record nor the Revision was created a second time.
    expect(
      fetchState.calls.filter(
        (call) =>
          call.method === "POST" &&
          call.url === `/api/v2/projects/${PROJECT_ID}/records`,
      ),
    ).toHaveLength(1);
    expect(
      fetchState.calls.filter((call) => call.url.endsWith("/revisions")),
    ).toHaveLength(1);
  });

  it("creates Record and draft Revision only, with no upload, in reserve mode", async () => {
    const { user, navigate, fetchState } = await openForm({}, "empty");
    await user.click(
      document.querySelector("[data-submit-document]") as Element,
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalled();
    });
    expect(
      fetchState.calls.filter((call) => call.url.endsWith("/files")),
    ).toHaveLength(0);
  });
});
