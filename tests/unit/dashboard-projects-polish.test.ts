import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

// Structural tests for the PR #15 visual polish pass. They assert the DOM
// contract the styling depends on (header hierarchy, toolbar controls, table
// structure, dialog field order, compact summaries, navigation shortcuts) so a
// regression in layout markup is caught without brittle pixel snapshots.

const shells: Array<{ destroy(): void }> = [];

afterEach(() => {
  shells.splice(0).forEach((shell) => {
    shell.destroy();
  });
});

function json(payload: unknown, status = 200, requestId = "req-test") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
  });
}

function ok(data: unknown) {
  return json({ data, meta: { requestId: "req-ok" } });
}

const sessionData = {
  user: { id: "user-1" },
  organization: { id: "org-1", name: "BASE Construction" },
  membership: { role: "org_admin" },
  projectPermissions: [],
};

const projectsPayload = [
  {
    id: "proj-1",
    projectNumber: "P-001",
    name: "Operations Center",
    status: "active",
    address: { city: "Orlando", region: "FL" },
    updatedAt: "2026-07-18T10:00:00Z",
  },
  {
    id: "proj-2",
    projectNumber: "P-002",
    name: "Riverside Clinic",
    status: "planning",
    address: { city: "Tampa", region: "FL" },
    updatedAt: "2026-07-10T10:00:00Z",
  },
];

const dashboardPayload = {
  summary: {
    accessibleProjectCount: 2,
    draftRevisionCount: 1,
    readyToIssueCount: 1,
    activeRfiCount: 1,
  },
  draftRevisions: [],
  readyToIssue: [],
  activeRfis: [],
  recentFiles: [],
  recentIssuances: [],
};

const overviewPayload = {
  project: {
    id: "proj-1",
    projectNumber: "P-001",
    name: "Operations Center",
    status: "active",
  },
  counts: {
    records: 4,
    draftRevisions: 1,
    publishedRevisions: 2,
    files: 6,
    issuances: 3,
    activeRfis: 1,
    teamMembers: 5,
  },
  attention: { draftRevisions: [], readyToIssue: [], activeRfis: [] },
  recentActivity: [],
};

function mount(path: string) {
  const window = new Window({ url: `https://base.test${path}` });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';
  const fetch = vi.fn((input: string | URL | Request) => {
    const value =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const pathname = new URL(value, "https://base.test").pathname;
    if (pathname === "/api/v2/session") return Promise.resolve(ok(sessionData));
    if (pathname === "/api/v2/dashboard")
      return Promise.resolve(ok(dashboardPayload));
    if (pathname === "/api/v2/projects")
      return Promise.resolve(ok(projectsPayload));
    if (/\/overview$/.test(pathname))
      return Promise.resolve(ok(overviewPayload));
    if (/^\/api\/v2\/projects\/[^/]+$/.test(pathname))
      return Promise.resolve(ok(overviewPayload.project));
    return Promise.resolve(json({ error: { code: "X", message: "x" } }, 404));
  });
  const shell = createAppShell({ window, document, fetch });
  shells.push(shell);
  return { window, document, shell };
}

async function waitFor(assertion: () => void, tries = 40) {
  let lastError: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

function idOrder(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((el) => el.id);
}

describe("projects header and toolbar polish", () => {
  it("keeps eyebrow, title, and description together with the create action on the right", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".projects-view .page-heading"),
      ).not.toBeNull();
    });
    const flexRow = document.querySelector(".page-heading-actions > div");
    if (flexRow === null) throw new Error("Expected the header flex row.");
    const children = [...flexRow.children];
    // The text group (eyebrow + title + description) comes first, the action last.
    const textGroup = children[0];
    expect(textGroup.querySelector(".app-eyebrow")?.textContent).toContain(
      "Project directory",
    );
    expect(textGroup.querySelector("#page-title")?.textContent).toBe(
      "Projects",
    );
    expect(textGroup.querySelector("p:last-child")?.textContent).toContain(
      "Open a project workspace",
    );
    const action = children[children.length - 1];
    expect(action.getAttribute("data-create-project")).not.toBeNull();
    // The action is a sibling of the text group, not nested inside it.
    expect(textGroup.contains(action)).toBe(false);
  });

  it("exposes a single cohesive toolbar with search, compact status, count, and restrained clear", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-toolbar")).not.toBeNull();
    });
    const toolbar = document.querySelector(".projects-toolbar");
    expect(
      toolbar?.querySelector(".app-search-field #projects-search"),
    ).not.toBeNull();
    expect(
      toolbar?.querySelector(".app-filter-field #projects-status"),
    ).not.toBeNull();
    expect(toolbar?.querySelector("[data-result-count]")).not.toBeNull();
    expect(toolbar?.querySelectorAll(".app-field")).toHaveLength(2);
    expect(toolbar?.querySelector(".field")).toBeNull();
    // Clear filters is a restrained text link, not a heavy button.
    expect(
      toolbar
        ?.querySelector("[data-clear-filters]")
        ?.classList.contains("text-link"),
    ).toBe(true);
  });
});

describe("projects table and cards polish", () => {
  it("renders readable header labels, a name row header, and a strong Open affordance", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-table")).not.toBeNull();
    });
    const headers = [
      ...document.querySelectorAll(".projects-table thead th"),
    ].map((th) => th.textContent.trim());
    expect(headers.slice(0, 5)).toEqual([
      "Number",
      "Project",
      "Status",
      "Location",
      "Updated",
    ]);
    // Project name uses a semantic row header.
    expect(
      document.querySelector('.projects-table tbody th[scope="row"] a'),
    ).not.toBeNull();
    // Open affordance is a dedicated chip link with an arrow.
    const open = document.querySelector(
      ".projects-table .cell-open .open-link",
    );
    expect(open).not.toBeNull();
    expect(open?.querySelector(".open-arrow")).not.toBeNull();
  });

  it("still renders touch-friendly mobile cards alongside the table", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".project-cards")).not.toBeNull();
    });
    expect(
      document.querySelectorAll(".project-cards .project-card").length,
    ).toBe(2);
  });
});

describe("create project dialog polish", () => {
  it("orders fields as number+status, name, city+region, description", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector("[data-create-project]")).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>("[data-create-project]")?.click();
    const body = document.querySelector(".app-dialog-body");
    expect(body).not.toBeNull();
    expect(idOrder(body as ParentNode, "input, select, textarea")).toEqual([
      "pf-number",
      "pf-status",
      "pf-name",
      "pf-city",
      "pf-region",
      "pf-description",
    ]);
    // Row 1 pairs number and status; row 3 pairs city and region.
    const rows = body?.querySelectorAll(".app-field-row");
    expect(idOrder(rows?.[0] as ParentNode, "input, select")).toEqual([
      "pf-number",
      "pf-status",
    ]);
    expect(idOrder(rows?.[1] as ParentNode, "input, select")).toEqual([
      "pf-city",
      "pf-region",
    ]);
    expect(body?.querySelectorAll(".app-field")).toHaveLength(6);
    expect(body?.querySelector(".field")).toBeNull();
  });

  it("does not mark fields as validation errors merely because the dialog opened", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector("[data-create-project]")).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>("[data-create-project]")?.click();
    const number = document.querySelector("#pf-number");
    number?.dispatchEvent(
      new (document.defaultView as unknown as { Event: typeof Event }).Event(
        "focus",
        { bubbles: true },
      ),
    );
    expect(number?.getAttribute("aria-invalid")).toBeNull();
    expect(
      document.querySelector("#pf-number-error")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      document.querySelector('.app-dialog [aria-invalid="true"]'),
    ).toBeNull();
  });
});

describe("dashboard and overview summary polish", () => {
  it("renders a compact four-metric dashboard operational strip", async () => {
    const { document, shell } = mount("/dashboard");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });
    const labels = [
      ...document.querySelectorAll(".dashboard-view .summary-metric dt"),
    ].map((dt) => dt.textContent.trim());
    expect(labels).toEqual([
      "Accessible projects",
      "Draft revisions",
      "Ready to issue",
      "Active RFIs",
    ]);
  });

  it("renders a compact shared overview summary and navigation-style shortcuts", async () => {
    const { document, shell } = mount("/projects/proj-1/overview");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".overview-view .overview-summary"),
      ).not.toBeNull();
    });
    // Single shared strip holding all six counts.
    expect(
      document.querySelectorAll(".overview-summary .overview-metric").length,
    ).toBe(6);
    // Shortcuts are a labelled nav whose cards carry a directional affordance.
    const nav = document.querySelector("nav.overview-shortcuts");
    expect(nav).not.toBeNull();
    expect(nav?.querySelector(".shortcut-card .shortcut-arrow")).not.toBeNull();
  });
});
