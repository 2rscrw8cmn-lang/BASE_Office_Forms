// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CONTACT,
  installRfiFetch,
  jsonResponse,
  renderRfiRegister,
  rfi,
} from "../helpers/rfi-register-harness";

async function openEditor() {
  const trigger = screen.getByRole("button", { name: "Door clearance" });
  await userEvent.click(trigger);
  return trigger;
}

/** Throwing DOM lookup so tests never rely on non-null assertions. */
function fieldInput(id: string, field: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    `[data-field-input][data-id="${id}"][data-field="${field}"]`,
  );
  if (!found) throw new Error(`Expected field input ${field} on ${id}`);
  return found;
}

describe("native RFI register — layout", () => {
  it("renders the five-column desktop hierarchy with no Action column", async () => {
    installRfiFetch({
      rows: [
        rfi({
          rfiNumber: "RFI-014",
          status: "open",
          capabilities: { updateDraft: false },
        }),
      ],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    const headers = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent.trim());
    expect(headers).toEqual(["RFI ↑", "Subject", "Party", "Due", "Updated"]);
    expect(screen.queryByText("Action")).toBeNull();
  });

  it("shows Unnumbered with a Draft status line for unissued rows", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    expect(screen.getAllByText("Unnumbered").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
  });

  it("keeps mobile cards alongside the desktop table", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const list = document.querySelector(".rfi-register-cards");
    expect(list).not.toBeNull();
    expect(
      within(list as HTMLElement).getByText("Door clearance"),
    ).toBeInTheDocument();
  });
});

describe("native RFI register — identity and subject navigation", () => {
  it("editable draft's Subject is a button, not a link, with aria-expanded/controls", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const trigger = screen.getByRole("button", { name: "Door clearance" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "rfi-editor-rfi-1");
    expect(screen.queryByRole("link", { name: "Door clearance" })).toBeNull();
  });

  it("locked row's Subject is a canonical workspace link with no editor", async () => {
    installRfiFetch({
      rows: [
        rfi({
          id: "rfi-locked",
          rfiNumber: "RFI-004",
          capabilities: { updateDraft: false },
        }),
      ],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    const link = screen.getByRole("link", { name: "Door clearance" });
    expect(link).toHaveAttribute("href", "/projects/project-1/rfis/rfi-locked");
    expect(
      document.querySelector('[data-subject-edit][data-id="rfi-locked"]'),
    ).toBeNull();
  });

  it("the RFI identity link navigates to the canonical workspace route", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const link = screen.getByRole("link", { name: /Open RFI Unnumbered/ });
    expect(link).toHaveAttribute("href", "/projects/project-1/rfis/rfi-1");
    await userEvent.click(link);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-1/rfis/rfi-1");
    });
  });

  it("ordinary data cells never navigate", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const before = window.location.pathname;
    const partyCell = document.querySelector(".rfi-register-cell-responsible");
    expect(partyCell).not.toBeNull();
    fireEvent.click(partyCell as HTMLElement);
    expect(window.location.pathname).toBe(before);
  });
});

describe("native RFI register — expandable editor", () => {
  it("opens one editor with every editable field and closes any other open editor", async () => {
    installRfiFetch({
      rows: [rfi({ id: "rfi-1" }), rfi({ id: "rfi-2", subject: "Second RFI" })],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: "Door clearance" }),
    );
    for (const field of [
      "subject",
      "responsiblePartyId",
      "requestedResponseDate",
      "question",
      "contractorSuggestion",
      "drawingReferences",
      "specificationReferences",
    ]) {
      expect(fieldInput("rfi-1", field)).not.toBeNull();
    }
    expect(document.querySelector('[data-editor-row="rfi-1"]')).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Second RFI" }));
    expect(document.querySelector('[data-editor-row="rfi-1"]')).toBeNull();
    expect(document.querySelector('[data-editor-row="rfi-2"]')).not.toBeNull();
  });

  it("focuses the Subject field on open and returns focus to the trigger on Done", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const trigger = await openEditor();
    await waitFor(() => {
      expect(document.activeElement).toBe(fieldInput("rfi-1", "subject"));
    });
    await userEvent.click(
      document.querySelector(
        '[data-editor-done][data-id="rfi-1"]',
      ) as HTMLElement,
    );
    expect(document.querySelector('[data-editor-row="rfi-1"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the editor on Escape from a field and returns focus to the trigger", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const trigger = await openEditor();
    const input = fieldInput("rfi-1", "subject");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.querySelector('[data-editor-row="rfi-1"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("native RFI register — commit behavior", () => {
  it("does not PATCH on every keystroke, only commits changed values on blur", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Updated clearance" } });
    fireEvent.change(input, { target: { value: "Updated clearance 2" } });
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    fireEvent.blur(input);
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      subject: "Updated clearance 2",
      lockVersion: 1,
    });
  });

  it("does not call the API when the value is unchanged on blur", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("commits a select field (Party) immediately on selection using the contact id", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const select = fieldInput(
      "rfi-1",
      "responsiblePartyId",
    ) as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      responsiblePartyId: null,
      lockVersion: 1,
    });
  });

  it("commits a date field on blur", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const date = fieldInput(
      "rfi-1",
      "requestedResponseDate",
    ) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-08-15" } });
    fireEvent.blur(date);
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        requestedResponseDate: "2026-08-15",
        lockVersion: 1,
      });
    });
  });

  it("commits a textarea on blur and Enter inserts a newline instead of committing", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const question = fieldInput("rfi-1", "question") as HTMLTextAreaElement;
    question.focus();
    fireEvent.change(question, { target: { value: "Revised question text" } });
    fireEvent.keyDown(question, { key: "Enter" });
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    expect(document.activeElement).toBe(question);
    fireEvent.blur(question);
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        question: "Revised question text",
        lockVersion: 1,
      });
    });
  });

  it("Enter commits a non-textarea field by blurring it", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "drawingReferences") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "A-701" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        drawingReferences: "A-701",
        lockVersion: 1,
      });
    });
  });

  it("blocks an empty required field with a message and issues no save", async () => {
    const { calls } = installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText("Subject is required.")).toBeInTheDocument();
    });
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("shows Saving then Saved for a successful commit", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Updated clearance" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("shows a permission-loss message at the affected field on 403", async () => {
    installRfiFetch({
      rows: [rfi()],
      onUpdate: () =>
        jsonResponse(
          { error: { code: "AUTHORIZATION_DENIED", message: "Forbidden" } },
          { status: 403 },
        ),
    });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "drawingReferences") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "A-701" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(
        screen.getByText("You no longer have permission to edit this draft."),
      ).toBeInTheDocument();
    });
  });

  it("reloads the latest values and shows a conflict message on 409", async () => {
    installRfiFetch({
      rows: [rfi()],
      onUpdate: () =>
        jsonResponse(
          { error: { code: "RFI_VERSION_CONFLICT", message: "Conflict" } },
          { status: 409 },
        ),
      reloadRows: [
        rfi({ subject: "Changed by another editor", lockVersion: 3 }),
      ],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My stale change" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Changed elsewhere. Latest values loaded; review and retry.",
        ),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Changed by another editor" }),
      ).toBeInTheDocument();
    });
  });
});

describe("native RFI register — Add RFI", () => {
  it("creates an unnumbered draft, opens its editor, and focuses Subject", async () => {
    installRfiFetch({ rows: [] });
    renderRfiRegister();
    await screen.findByText("No RFIs yet");
    const button = screen.getAllByRole("button", { name: "Add RFI" })[0];
    await userEvent.click(button);
    await waitFor(() => {
      expect(
        document.querySelector('[data-editor-row="rfi-new"]'),
      ).not.toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(fieldInput("rfi-new", "subject"));
    });
  });
});

describe("native RFI register — sorting", () => {
  it("sorts on header click, toggles direction, and sets aria-sort", async () => {
    installRfiFetch({
      rows: [
        rfi({ id: "rfi-1", subject: "Bravo item" }),
        rfi({ id: "rfi-2", subject: "Alpha item" }),
      ],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    const subjectHeader = screen.getByRole("button", { name: /Subject/ });
    await userEvent.click(subjectHeader);
    await waitFor(() => {
      expect(window.location.search).toContain("sort=subject");
    });
    expect(subjectHeader.closest("th")).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    const rowIds = [...document.querySelectorAll("[data-rfi-row]")].map((row) =>
      row.getAttribute("data-rfi-row"),
    );
    expect(rowIds).toEqual(["rfi-2", "rfi-1"]);

    await userEvent.click(subjectHeader);
    await waitFor(() => {
      expect(window.location.search).toContain("direction=desc");
    });
    expect(subjectHeader.closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });
});

describe("native RFI register — search, filters, and URL state", () => {
  it("keeps Search, Status, Party, and Due as the only filter controls (no sort dropdown)", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    expect(
      screen.getByRole("searchbox", { name: "Search RFIs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Status" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Party" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Due" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /sort/i })).toBeNull();
  });

  it("replaces history on search but pushes a new entry on filter/sort/clear changes", async () => {
    installRfiFetch({ rows: [rfi(), rfi({ id: "rfi-2" })] });
    renderRfiRegister();
    await screen.findByRole("table");
    const search = screen.getByRole("searchbox", { name: "Search RFIs" });
    const lengthBeforeSearch = window.history.length;
    await userEvent.type(search, "door");
    await waitFor(() => {
      expect(window.location.search).toContain("q=door");
    });
    // Typing replaces the current entry; history length should not grow.
    expect(window.history.length).toBe(lengthBeforeSearch);

    const lengthBeforeStatus = window.history.length;
    const status = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(status, { target: { value: "draft" } });
    await waitFor(() => {
      expect(window.location.search).toContain("status=draft");
    });
    expect(window.history.length).toBe(lengthBeforeStatus + 1);
  });

  it("preserves URL filters across an in-progress edit", async () => {
    installRfiFetch({ rows: [rfi()] });
    renderRfiRegister();
    await screen.findByRole("table");
    const status = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(status, { target: { value: "draft" } });
    await waitFor(() => {
      expect(window.location.search).toContain("status=draft");
    });
    await openEditor();
    const input = fieldInput("rfi-1", "subject") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Filtered edit" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
    expect(window.location.search).toContain("status=draft");
  });

  it("shows a filtered-empty state with Clear all, distinct from first-use empty", async () => {
    installRfiFetch({ rows: [rfi({ status: "draft" })] });
    renderRfiRegister();
    await screen.findByRole("table");
    const status = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(status, { target: { value: "closed" } });
    await waitFor(() => {
      expect(
        screen.getByText("No RFIs match these filters."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).toBeNull();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Clear all" })[0],
    );
    await screen.findByRole("table");
  });

  it("restores filters on browser Back", async () => {
    installRfiFetch({
      rows: [
        rfi({ status: "draft" }),
        rfi({
          id: "rfi-closed",
          status: "closed",
          capabilities: { updateDraft: false },
        }),
      ],
    });
    renderRfiRegister();
    await screen.findByRole("table");
    const status = screen.getByRole("combobox", {
      name: "Status",
    }) as unknown as HTMLSelectElement;
    fireEvent.change(status, { target: { value: "closed" } });
    await waitFor(() => {
      expect(window.location.search).toContain("status=closed");
    });
    fireEvent.change(status, { target: { value: "draft" } });
    await waitFor(() => {
      expect(window.location.search).toContain("status=draft");
    });
    window.history.back();
    await waitFor(() => {
      expect(window.location.search).toContain("status=closed");
    });
  });
});

describe("native RFI register — states", () => {
  it("shows a loading state before data resolves", async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((r) => {
      resolve = r;
    });
    globalThis.fetch = vi.fn(() => pending);
    renderRfiRegister();
    expect(screen.getByLabelText("Loading RFIs")).toBeInTheDocument();
    resolve(
      jsonResponse({
        data: {
          project: {
            id: "project-1",
            projectNumber: "P-001",
            name: "Library",
            status: "active",
          },
          responsibleContacts: [CONTACT],
          rfis: [],
          capabilities: { createRfi: true },
        },
      }),
    );
    await screen.findByText("No RFIs yet");
  });

  it("shows the first-use empty state when there are no RFIs at all", async () => {
    installRfiFetch({ rows: [] });
    renderRfiRegister();
    await waitFor(() => {
      expect(screen.getByText("No RFIs yet")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Create the first working draft."),
    ).toBeInTheDocument();
  });

  it("shows a permission-denied state for a 403/404 on the register itself", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({}, { status: 403 })),
    );
    renderRfiRegister();
    await waitFor(() => {
      expect(
        screen.getByText(
          "These RFIs are unavailable or you do not have access.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows a retryable error state on request failure", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(() => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve(jsonResponse({}, { status: 500 }));
      return Promise.resolve(
        jsonResponse({
          data: {
            project: {
              id: "project-1",
              projectNumber: "P-001",
              name: "Library",
              status: "active",
            },
            responsibleContacts: [CONTACT],
            rfis: [rfi()],
            capabilities: { createRfi: true },
          },
        }),
      );
    });
    renderRfiRegister();
    await waitFor(() => {
      expect(
        screen.getByText("The RFIs could not be loaded. No changes were made."),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("table");
  });
});
