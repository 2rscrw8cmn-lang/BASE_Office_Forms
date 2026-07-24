// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  installProjectsFetch,
  jsonResponse,
  project,
  renderProjectsRegister,
} from "../helpers/projects-register-harness";

async function loadedTable() {
  return screen.findByRole("table", {
    name: "Projects you are authorized to access",
  });
}

async function openCreateDialog() {
  const trigger = await screen.findByRole("button", {
    name: "Create project",
  });
  await userEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole("dialog") };
}

describe("native Projects register — layout and authorized data", () => {
  it("renders the four-column semantic table without an Actions/Open column or grid semantics", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    const table = await loadedTable();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Project", "Status", "Location", "Updated"]);
    expect(screen.queryByRole("grid")).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: /actions|open/i }),
    ).toBeNull();
  });

  it("renders authorized identity hierarchy, honest missing numbers, and no database UUID text", async () => {
    installProjectsFetch({
      rows: [
        project({
          id: "project-private-uuid",
          projectNumber: null,
          name: "No Number Project",
        }),
      ],
    });
    renderProjectsRegister();
    const table = await loadedTable();
    const rowHeader = within(table).getByRole("rowheader");
    expect(rowHeader).toHaveTextContent("No Number Project");
    expect(rowHeader).toHaveTextContent("No project number");
    expect(table).not.toHaveTextContent("project-private-uuid");
  });

  it("orders active projects first, then number, name, and id deterministically", async () => {
    installProjectsFetch({
      rows: [
        project({
          id: "z",
          projectNumber: "P-002",
          name: "Zulu",
          status: "planning",
        }),
        project({
          id: "b",
          projectNumber: "P-010",
          name: "Beta",
          status: "active",
        }),
        project({
          id: "c",
          projectNumber: "P-002",
          name: "Charlie",
          status: "active",
        }),
        project({
          id: "a",
          projectNumber: "P-002",
          name: "Alpha",
          status: "active",
        }),
      ],
    });
    renderProjectsRegister();
    const table = await loadedTable();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((row) => within(row).getByRole("rowheader").textContent),
    ).toEqual(["AlphaP-002", "CharlieP-002", "BetaP-010", "ZuluP-002"]);
  });

  it("renders a dedicated mobile card list from the same project data", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    await loadedTable();
    const cards = document.querySelector(".projects-register-cards");
    expect(cards).not.toBeNull();
    const card = within(cards as HTMLElement).getByRole("link", {
      name: "Open Riverside Tower (P-001)",
    });
    expect(card).toHaveAttribute("href", "/projects/project-1/overview");
    expect(card).toHaveTextContent("Orlando, FL");
    expect(card).toHaveTextContent("Updated");
  });
});

describe("native Projects register — search, status, URL, and mobile disclosure", () => {
  const rows = [
    project(),
    project({
      id: "project-2",
      projectNumber: "P-002",
      name: "Planning Annex",
      status: "planning",
    }),
  ];

  it("searches by project name or number and replaces the current history entry", async () => {
    installProjectsFetch({ rows });
    renderProjectsRegister();
    await loadedTable();
    const search = screen.getByRole("searchbox", { name: "Search projects" });
    const historyLength = window.history.length;
    await userEvent.type(search, "P-002");
    await waitFor(() => {
      expect(window.location.search).toContain("q=P-002");
      expect(screen.getByText("1 of 2 projects")).toBeInTheDocument();
    });
    expect(window.history.length).toBe(historyLength);
    expect(screen.queryAllByText("Planning Annex").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("rowheader", { name: /Riverside Tower/ }),
    ).toBeNull();
  });

  it("pushes status changes, shows a removable chip, and does not count search in the mobile badge", async () => {
    installProjectsFetch({ rows });
    renderProjectsRegister();
    await loadedTable();
    const toggle = screen.getByRole("button", { name: "Show filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const historyLength = window.history.length;
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "planning" },
    });
    await waitFor(() => {
      expect(window.location.search).toContain("status=planning");
    });
    expect(window.history.length).toBe(historyLength + 1);
    expect(
      screen.getByRole("button", {
        name: "Remove Status filter Planning",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide filters" }).parentElement,
    ).toHaveTextContent("1");

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search projects" }),
      "annex",
    );
    expect(
      screen.getByRole("button", { name: "Hide filters" }).parentElement,
    ).toHaveTextContent("1");
  });

  it("keeps chips and Clear available while mobile filters are collapsed", async () => {
    installProjectsFetch({ rows });
    renderProjectsRegister();
    await loadedTable();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "planning" },
    });
    await waitFor(() => {
      expect(screen.getByText("Status:")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Show 1 active filter/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(window.location.search).not.toContain("status=");
    });
  });

  it("restores direct URL state and browser Back/Forward while preserving the hash", async () => {
    installProjectsFetch({ rows });
    renderProjectsRegister("/projects?q=annex&status=planning#notes");
    await loadedTable();
    expect(screen.getByRole("searchbox")).toHaveValue("annex");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "planning",
    );
    expect(window.location.hash).toBe("#notes");

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "active" },
    });
    await waitFor(() => {
      expect(window.location.search).toContain("status=active");
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "planning" },
    });
    await waitFor(() => {
      expect(window.location.search).toContain("status=planning");
    });
    window.history.back();
    await waitFor(() => {
      expect(window.location.search).toContain("status=active");
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
        "active",
      );
    });
    window.history.forward();
    await waitFor(() => {
      expect(window.location.search).toContain("status=planning");
    });
    expect(window.location.hash).toBe("#notes");
  });

  it("normalizes unknown or unavailable status values without inventing an option", async () => {
    installProjectsFetch({ rows: [project()] });
    renderProjectsRegister("/projects?status=made_up#kept");
    await loadedTable();
    await waitFor(() => {
      expect(window.location.search).not.toContain("status=");
    });
    expect(window.location.hash).toBe("#kept");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
      "Active",
    );
    expect(
      screen.getByRole("combobox", { name: "Status" }),
    ).not.toHaveTextContent("made_up");
  });

  it("distinguishes filtered-empty from first-use empty and Clear restores results", async () => {
    installProjectsFetch({ rows });
    renderProjectsRegister("/projects?q=missing");
    await screen.findByText(
      "No projects match the current search or status filter.",
    );
    expect(
      screen.queryByText("No projects are available to you yet."),
    ).toBeNull();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Clear" }).at(-1) as HTMLElement,
    );
    await loadedTable();
  });
});

describe("native Projects register — navigation safety", () => {
  it("leaves modifier clicks on the project link to native browser behavior", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    const table = await loadedTable();
    const row = within(table).getAllByRole("row")[1];
    const link = within(row).getByRole("link", {
      name: "Open Riverside Tower (P-001)",
    });
    const modifierClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    link.dispatchEvent(modifierClick);
    expect(modifierClick.defaultPrevented).toBe(false);
  });

  it("navigates from a safe row area", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    const table = await loadedTable();
    const row = within(table).getAllByRole("row")[1];

    fireEvent.click(within(row).getByText("Orlando, FL"));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/project-1/overview");
    });
  });

  it("does not navigate a row during text selection", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    const table = await loadedTable();
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "selected text",
    } as Selection);
    fireEvent.click(within(table).getByText("Orlando, FL"));
    expect(window.location.pathname).toBe("/projects");
    selection.mockRestore();
  });
});

describe("native Projects register — loading, empty, error, and capability", () => {
  it("shows initial loading while the request is pending", () => {
    installProjectsFetch({ listResponses: [new Promise(() => undefined)] });
    renderProjectsRegister();
    const loadingStatus = screen.getByRole("status");
    expect(
      within(loadingStatus).getByText("Loading projects"),
    ).toBeInTheDocument();
  });

  it("shows a cautious first-use empty state and hides Create when capability is absent", async () => {
    installProjectsFetch({ rows: [], capability: false });
    renderProjectsRegister();
    expect(
      await screen.findByText("No projects are available to you yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Projects you are authorized to access will appear here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create project" })).toBeNull();
  });

  it("shows request ID, retries a failed request, and recovers", async () => {
    installProjectsFetch({
      rows: [project()],
      listResponses: [
        jsonResponse(
          {
            error: {
              code: "FAILED",
              message: "Failed",
              requestId: "req-failed",
            },
          },
          { status: 500 },
        ),
      ],
    });
    renderProjectsRegister();
    expect(await screen.findByText("req-failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await loadedTable();
  });
});

describe("native Create Project dialog", () => {
  it("uses server capability, focuses Project number, traps Escape, and restores trigger focus", async () => {
    installProjectsFetch();
    renderProjectsRegister();
    await loadedTable();
    const { trigger } = await openCreateDialog();
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Project number" }),
      ).toHaveFocus();
    });
    expect(
      screen.getByRole("combobox", { name: "Status" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "City" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "State / region" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Description" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  it("connects client validation to fields and does not call the server", async () => {
    const { calls } = installProjectsFetch();
    renderProjectsRegister();
    await loadedTable();
    await openCreateDialog();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create project",
      }),
    );
    const projectNumber = screen.getByRole("textbox", {
      name: "Project number",
    });
    expect(projectNumber).toHaveAttribute("aria-invalid", "true");
    const describedBy = projectNumber.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Project number is required.",
    );
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("keeps values after a server validation failure, shows request ID, and supports retry", async () => {
    let createCount = 0;
    installProjectsFetch({
      onCreate: () => {
        createCount += 1;
        return createCount === 1
          ? jsonResponse(
              {
                error: {
                  code: "VALIDATION_FAILED",
                  message: "Project number already exists.",
                  requestId: "req-create-failed",
                },
              },
              { status: 400 },
            )
          : jsonResponse(
              { data: project({ id: "created-on-retry" }) },
              { status: 201 },
            );
      },
    });
    renderProjectsRegister();
    await loadedTable();
    await openCreateDialog();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project number" }),
      "P-999",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project name" }),
      "Retry Project",
    );
    const submit = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Create project",
    });
    await userEvent.click(submit);
    expect(
      await screen.findByText("Project number already exists."),
    ).toBeInTheDocument();
    expect(screen.getByText(/req-create-failed/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
      "Retry Project",
    );
    await userEvent.click(submit);
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/created-on-retry/overview",
      );
    });
  });

  it("submits the supported payload, shows loading without optimistic insertion, and navigates after confirmation", async () => {
    let resolveCreate: ((response: Response) => void) | undefined;
    const createResponse = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const { calls } = installProjectsFetch({
      onCreate: () => createResponse,
    });
    renderProjectsRegister();
    const table = await loadedTable();
    await openCreateDialog();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project number" }),
      "P-404",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project name" }),
      "Confirmed Project",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "City" }),
      "Tampa",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "State / region" }),
      "FL",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Confirmed by server",
    );
    const submit = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Create project",
    });
    await userEvent.click(submit);
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(table.querySelectorAll("tr")).toHaveLength(2);
    expect(window.location.pathname).toBe("/projects");
    expect(calls.at(-1)?.body).toEqual({
      projectNumber: "P-404",
      name: "Confirmed Project",
      status: "planning",
      description: "Confirmed by server",
      address: { city: "Tampa", region: "FL" },
    });

    resolveCreate?.(
      jsonResponse(
        { data: project({ id: "confirmed-project" }) },
        { status: 201 },
      ),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/confirmed-project/overview",
      );
    });
  });

  it("refreshes the confirmed Projects query before returning from canonical navigation", async () => {
    const existing = project();
    const created = project({
      id: "created-project",
      projectNumber: "P-777",
      name: "Confirmed after navigation",
    });
    const { calls } = installProjectsFetch({
      listResponses: [
        jsonResponse({
          data: [existing],
          meta: {
            requestId: "req-initial",
            capabilities: { createProject: true },
          },
        }),
        jsonResponse({
          data: [existing, created],
          meta: {
            requestId: "req-refreshed",
            capabilities: { createProject: true },
          },
        }),
      ],
      onCreate: () => jsonResponse({ data: created }, { status: 201 }),
    });
    renderProjectsRegister();
    await loadedTable();
    await openCreateDialog();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project number" }),
      "P-777",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Project name" }),
      "Confirmed after navigation",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create project",
      }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/created-project/overview",
      );
      expect(calls.filter((call) => call.method === "GET")).toHaveLength(2);
    });
    window.history.back();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
    expect(
      screen.getAllByText("Confirmed after navigation").length,
    ).toBeGreaterThan(0);
  });
});
