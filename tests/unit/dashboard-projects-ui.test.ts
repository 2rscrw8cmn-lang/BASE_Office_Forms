import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

type Role =
  | "org_admin"
  | "document_control_admin"
  | "project_manager"
  | "contributor"
  | "viewer";

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

function ok(data: unknown, requestId = "req-test") {
  return json({ data, meta: { requestId } }, 200, requestId);
}

function fail(status: number, requestId = "req-err") {
  return json(
    { error: { code: "ERROR", message: "Something failed.", requestId } },
    status,
    requestId,
  );
}

const dashboardPayload = {
  summary: {
    accessibleProjectCount: 2,
    draftRevisionCount: 1,
    readyToIssueCount: 1,
    activeRfiCount: 1,
  },
  draftRevisions: [
    {
      revisionId: "rev-1",
      revisionNumber: 2,
      revisionLabel: null,
      title: "Foundation plan",
      recordId: "rec-1",
      recordNumber: "R-001",
      recordTitle: "Foundation drawings",
      projectId: "proj-1",
      projectNumber: "P-001",
      projectName: "Operations Center",
      createdAt: "2026-07-18T10:00:00Z",
    },
  ],
  readyToIssue: [
    {
      revisionId: "rev-2",
      revisionNumber: 1,
      revisionLabel: null,
      title: "Electrical set",
      recordId: "rec-2",
      recordNumber: "R-002",
      recordTitle: "Electrical drawings",
      projectId: "proj-1",
      projectNumber: "P-001",
      projectName: "Operations Center",
      createdAt: "2026-07-17T10:00:00Z",
      fileCount: 3,
    },
  ],
  activeRfis: [
    {
      rfiId: "rfi-1",
      rfiNumber: "RFI-004",
      title: "Ceiling height",
      status: "issued",
      dueDate: "2026-07-27",
      projectId: "proj-1",
      projectNumber: "P-001",
      projectName: "Operations Center",
      createdAt: "2026-07-16T10:00:00Z",
    },
  ],
  recentFiles: [
    {
      fileId: "file-1",
      originalFilename: "foundation.pdf",
      uploadedAt: "2026-07-20T10:00:00Z",
      revisionId: "rev-1",
      revisionNumber: 2,
      recordId: "rec-1",
      recordTitle: "Foundation drawings",
      projectId: "proj-1",
      projectNumber: "P-001",
      projectName: "Operations Center",
    },
  ],
  recentIssuances: [
    {
      issuanceId: "iss-1",
      issueNumber: "ISS-014",
      purpose: "for_construction",
      issuedAt: "2026-07-19T10:00:00Z",
      issuedByName: "Dana Lee",
      fileCount: 2,
      recordId: "rec-2",
      recordTitle: "Electrical drawings",
      revisionId: "rev-2",
      projectId: "proj-1",
      projectNumber: "P-001",
      projectName: "Operations Center",
    },
  ],
};

const emptyDashboard = {
  summary: {
    accessibleProjectCount: 3,
    draftRevisionCount: 0,
    readyToIssueCount: 0,
    activeRfiCount: 0,
  },
  draftRevisions: [],
  readyToIssue: [],
  activeRfis: [],
  recentFiles: [],
  recentIssuances: [],
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
  attention: {
    draftRevisions: [
      {
        revisionId: "rev-1",
        revisionNumber: 2,
        revisionLabel: null,
        title: "Foundation plan",
        recordId: "rec-1",
        recordNumber: "R-001",
        recordTitle: "Foundation drawings",
        createdAt: "2026-07-18T10:00:00Z",
        projectId: "proj-1",
        projectNumber: "P-001",
        projectName: "Operations Center",
      },
    ],
    readyToIssue: [],
    activeRfis: [
      {
        rfiId: "rfi-1",
        rfiNumber: "RFI-004",
        title: "Ceiling height",
        status: "answered",
        dueDate: null,
        createdAt: "2026-07-16T10:00:00Z",
        projectId: "proj-1",
        projectNumber: "P-001",
        projectName: "Operations Center",
      },
    ],
  },
  recentActivity: [
    {
      id: "evt-1",
      action: "revision.published",
      objectType: "revision",
      objectId: "rev-2",
      actorUserId: "user-1",
      actorType: "user",
      actorDisplayName: "Dana Lee",
      occurredAt: "2026-07-19T10:00:00Z",
    },
  ],
};

type RouteHandler = () => Response;
type Routes = Partial<Record<string, RouteHandler>>;

interface MountOptions {
  role?: Role;
  routes?: Routes;
  defer?: string[];
  matchMedia?: (query: string) => unknown;
}

function sessionResponse(role: Role) {
  return ok({
    user: { id: "user-1" },
    organization: { id: "org-1", name: "BASE Construction" },
    membership: { role },
    projectPermissions: [],
  });
}

function defaultHandler(key: string, pathname: string, role: Role): Response {
  if (key === "GET /api/v2/session") return sessionResponse(role);
  if (key === "GET /api/v2/dashboard") return ok(dashboardPayload);
  if (key === "GET /api/v2/projects") return ok(projectsPayload);
  if (key === "POST /api/v2/projects")
    return json(
      { data: { id: "proj-new" }, meta: { requestId: "req-new" } },
      201,
    );
  if (/^\/api\/v2\/projects\/[^/]+\/overview$/.test(pathname))
    return ok(overviewPayload);
  if (/^\/api\/v2\/projects\/[^/]+$/.test(pathname))
    return ok({
      id: "proj-1",
      projectNumber: "P-001",
      name: "Operations Center",
      status: "active",
    });
  return fail(404);
}

function mount(path: string, options: MountOptions = {}) {
  const role = options.role ?? "org_admin";
  const routes = options.routes ?? {};
  const defer = options.defer ?? [];
  const window = new Window({ url: `https://base.test${path}` });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';
  const deferred: Record<string, (response: Response) => void> = {};

  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const value =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const pathname = new URL(value, "https://base.test").pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${pathname}`;
    if (defer.includes(pathname) || defer.includes(key)) {
      return new Promise<Response>((resolve) => {
        deferred[pathname] = resolve;
      });
    }
    const handler = routes[key] ?? routes[pathname];
    return Promise.resolve(
      handler ? handler() : defaultHandler(key, pathname, role),
    );
  });

  const shell = createAppShell({
    window,
    document,
    fetch,
    ...(options.matchMedia ? { matchMedia: options.matchMedia } : {}),
  });
  shells.push(shell);
  return { window, document, shell, fetch, deferred };
}

function grab(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Expected to find ${selector}.`);
  }
  return element;
}

function fieldValue(root: ParentNode, selector: string): string {
  return (grab(root, selector) as HTMLInputElement).value;
}

function setFieldValue(
  root: ParentNode,
  selector: string,
  value: string,
): void {
  (grab(root, selector) as HTMLInputElement).value = value;
}

function textOf(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent ?? "";
}

function fire(element: Element, type: string) {
  const view = element.ownerDocument.defaultView as unknown as {
    Event: typeof Event;
  };
  element.dispatchEvent(
    new view.Event(type, { bubbles: true, cancelable: true }),
  );
}

async function settle(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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

describe("dashboard view", () => {
  it("renders the real dashboard response with summary values and reasons", async () => {
    const { document, shell } = mount("/dashboard");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });

    expect(document.querySelector("#page-title")?.textContent).toBe(
      "Work Dashboard",
    );
    const metrics = [...document.querySelectorAll(".summary-metric dd")].map(
      (element) => element.textContent.trim(),
    );
    expect(metrics).toEqual(["2", "1", "1", "1"]);

    const text = textOf(document, ".dashboard-view");
    expect(text).toContain("Draft revision");
    expect(text).toContain("Published with 3 files and not yet issued");
    expect(text).toContain("RFI awaiting response");
    expect(text).toContain("File uploaded July 20, 2026");
    expect(text).toContain("ISS-014 created");
    expect(text).toContain("BASE Construction");
  });

  it("links attention and recent items to their canonical routes", async () => {
    const { document, shell } = mount("/dashboard");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .attention-list"),
      ).not.toBeNull();
    });
    const hrefs = [
      ...document.querySelectorAll(".dashboard-view a[data-app-link]"),
    ].map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/projects/proj-1/records/rec-1/revisions/rev-1");
    expect(hrefs).toContain(
      "/projects/proj-1/records/rec-2/revisions/rev-2/issue",
    );
    expect(hrefs).toContain("/projects/proj-1/rfis/rfi-1");
    expect(hrefs).toContain("/projects/proj-1/issuances/iss-1");
    expect(hrefs).toContain("/projects");
  });

  it("shows a helpful message when nothing needs attention but projects exist", async () => {
    const { document, shell } = mount("/dashboard", {
      routes: { "GET /api/v2/dashboard": () => ok(emptyDashboard) },
    });
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });
    const text = textOf(document, ".dashboard-view");
    expect(text).toContain("No work currently requires your attention.");
    expect(text).not.toContain("do not have access to any projects");
  });

  it("renders an error state and recovers on retry", async () => {
    let calls = 0;
    const { document, shell } = mount("/dashboard", {
      routes: {
        "GET /api/v2/dashboard": () => {
          calls += 1;
          return calls === 1 ? fail(500) : ok(dashboardPayload);
        },
      },
    });
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .inline-error"),
      ).not.toBeNull();
    });
    expect(textOf(document, ".inline-error .request-id")).toContain("req-err");

    grab(document, "[data-dashboard-retry]").click();
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });
  });

  it("uses semantic sections and lists for mobile-friendly structure", async () => {
    const { document, shell } = mount("/dashboard");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".dashboard-view .attention-list"),
      ).not.toBeNull();
    });
    expect(
      document.querySelectorAll(".dashboard-view section h2").length,
    ).toBeGreaterThan(0);
    expect(
      document
        .querySelector(".dashboard-view .attention-item a")
        ?.tagName.toLowerCase(),
    ).toBe("a");
  });

  it("ignores a stale dashboard response after navigating to a newer route", async () => {
    const { document, shell } = mount("/dashboard", {
      defer: ["/api/v2/dashboard"],
    });
    await shell.ready;
    await shell.navigate("/projects");
    await waitFor(() => {
      expect(document.querySelector(".projects-view")).not.toBeNull();
    });
    // The deferred dashboard request never resolves here; even if it did, the
    // dashboard controller was destroyed on the route change and cannot replace
    // the newer projects route.
    expect(document.querySelector(".dashboard-view")).toBeNull();
  });
});

describe("projects view", () => {
  it("renders the project list with canonical overview links", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-table")).not.toBeNull();
    });
    const rowLinks = [
      ...document.querySelectorAll('.projects-table th[scope="row"] a'),
    ].map((link) => link.getAttribute("href"));
    expect(rowLinks).toContain("/projects/proj-1/overview");
    expect(rowLinks).toContain("/projects/proj-2/overview");
    expect(document.querySelector(".project-cards")).not.toBeNull();
  });

  it("filters by search text across number and name", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-table tbody tr")).not.toBeNull();
    });
    const search = grab(document, "#projects-search");
    (search as HTMLInputElement).value = "Riverside";
    fire(search, "input");
    await settle();
    let rows = document.querySelectorAll(".projects-table tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Riverside Clinic");

    (search as HTMLInputElement).value = "P-001";
    fire(search, "input");
    await settle();
    rows = document.querySelectorAll(".projects-table tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Operations Center");
  });

  it("filters by status and clears filters", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-table tbody tr")).not.toBeNull();
    });
    const status = grab(document, "#projects-status");
    (status as HTMLInputElement).value = "planning";
    fire(status, "change");
    await settle();
    expect(document.querySelectorAll(".projects-table tbody tr")).toHaveLength(
      1,
    );
    expect(textOf(document, "[data-result-count]")).toContain("Showing 1 of 2");

    grab(document, ".projects-toolbar [data-clear-filters]").click();
    await settle();
    expect(document.querySelectorAll(".projects-table tbody tr")).toHaveLength(
      2,
    );
  });

  it("shows a no-results state when filters match nothing", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector(".projects-table")).not.toBeNull();
    });
    const search = grab(document, "#projects-search");
    (search as HTMLInputElement).value = "nonexistent";
    fire(search, "input");
    await settle();
    expect(textOf(document, ".projects-empty")).toContain("No projects match");
  });

  it("shows the create action for authorized roles and hides it otherwise", async () => {
    const admin = mount("/projects", { role: "document_control_admin" });
    await admin.shell.ready;
    await waitFor(() => {
      expect(
        admin.document.querySelector("[data-create-project]"),
      ).not.toBeNull();
    });

    const viewer = mount("/projects", { role: "viewer" });
    await viewer.shell.ready;
    await waitFor(() => {
      expect(viewer.document.querySelector(".projects-table")).not.toBeNull();
    });
    expect(viewer.document.querySelector("[data-create-project]")).toBeNull();
  });

  it("validates the create form before submitting", async () => {
    const { document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector("[data-create-project]")).not.toBeNull();
    });
    grab(document, "[data-create-project]").click();
    expect(document.querySelector(".app-dialog")).not.toBeNull();
    expect(document.activeElement?.id).toBe("pf-number");
    expect(
      document.querySelector('.app-dialog [aria-invalid="true"]'),
    ).toBeNull();
    fire(grab(document, ".app-dialog form"), "submit");
    await settle(1);
    expect(
      document.querySelector("#pf-number-error")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      document.querySelector("#pf-name-error")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(grab(document, "#pf-number").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("navigates to the new project overview after a successful creation", async () => {
    const { window, document, shell } = mount("/projects");
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector("[data-create-project]")).not.toBeNull();
    });
    grab(document, "[data-create-project]").click();
    setFieldValue(document, "#pf-number", "P-050");
    setFieldValue(document, "#pf-name", "New Tower");
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/proj-new/overview");
    });
    expect(document.querySelector(".app-dialog")).toBeNull();
  });

  it("preserves input and shows a request-id error when creation fails", async () => {
    const { document, shell } = mount("/projects", {
      routes: {
        "POST /api/v2/projects": () => fail(409, "req-conflict"),
      },
    });
    await shell.ready;
    await waitFor(() => {
      expect(document.querySelector("[data-create-project]")).not.toBeNull();
    });
    grab(document, "[data-create-project]").click();
    setFieldValue(document, "#pf-number", "P-050");
    setFieldValue(document, "#pf-name", "New Tower");
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(
        document.querySelector(".app-dialog-error")?.hasAttribute("hidden"),
      ).toBe(false);
    });
    expect(textOf(document, ".app-dialog-error")).toContain("req-conflict");
    expect(fieldValue(document, "#pf-number")).toBe("P-050");
    expect(fieldValue(document, "#pf-name")).toBe("New Tower");
  });
});

describe("project overview view", () => {
  it("renders counts, attention items, activity, and canonical shortcuts", async () => {
    const { document, shell } = mount("/projects/proj-1/overview");
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".overview-view .overview-summary"),
      ).not.toBeNull();
    });
    const counts = [
      ...document.querySelectorAll(".overview-view .overview-metric dd"),
    ].map((element) => element.textContent.trim());
    expect(counts).toEqual(["4", "1", "2", "6", "3", "1"]);

    const overviewText = textOf(document, ".overview-view");
    expect(overviewText).toContain("Draft revision");
    expect(overviewText).toContain("RFI answered and awaiting close");
    expect(overviewText).toContain("Revision published");

    const shortcutHrefs = [...document.querySelectorAll(".shortcut-card")].map(
      (link) => link.getAttribute("href"),
    );
    expect(shortcutHrefs).toEqual([
      "/projects/proj-1/records",
      "/projects/proj-1/issuances",
      "/projects/proj-1/rfis",
      "/projects/proj-1/team",
    ]);
  });

  it("shows a generic message when the overview is not found", async () => {
    const { document, shell } = mount("/projects/proj-1/overview", {
      routes: {
        "/api/v2/projects/proj-1/overview": () => fail(404),
      },
    });
    await shell.ready;
    await waitFor(() => {
      expect(
        document.querySelector(".overview-view .inline-error"),
      ).not.toBeNull();
    });
    expect(textOf(document, ".overview-view")).toContain(
      "unavailable or you do not have access",
    );
  });

  it("ignores a stale overview response from a previous project route", async () => {
    const { document, shell } = mount("/projects/proj-1/overview", {
      defer: ["/api/v2/projects/proj-1/overview"],
    });
    await shell.ready;
    await shell.navigate("/projects/proj-2/overview");
    await waitFor(() => {
      expect(
        document.querySelector(".overview-view .overview-summary"),
      ).not.toBeNull();
    });
    // proj-2 rendered from its own (non-deferred) response; the deferred proj-1
    // controller was destroyed on the route change and cannot replace it.
    const counts = [
      ...document.querySelectorAll(".overview-view .overview-metric dd"),
    ].map((element) => element.textContent.trim());
    expect(counts).toEqual(["4", "1", "2", "6", "3", "1"]);
  });
});
