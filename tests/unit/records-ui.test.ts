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

const projectDetail = {
  id: "proj-1",
  projectNumber: "P-001",
  name: "Operations Center",
  status: "active",
};

function record(overrides: Record<string, unknown>) {
  return {
    id: "rec-x",
    projectId: "proj-1",
    recordNumber: null,
    title: "Untitled",
    recordType: "document",
    discipline: null,
    status: "active",
    currentRevision: null,
    hasDraftRevision: false,
    draftRevisionId: null,
    fileCount: 0,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    capabilities: { update: true, archive: true },
    ...overrides,
  };
}

const recordsPayload = {
  records: [
    record({
      id: "rec-1",
      recordNumber: "A-101",
      title: "Floor Plan",
      recordType: "drawing",
      discipline: "Architecture",
      status: "active",
      currentRevision: {
        id: "rev-1",
        revisionNumber: 1,
        revisionLabel: null,
        status: "published",
        title: "Published",
      },
      hasDraftRevision: true,
      draftRevisionId: "rev-2",
      fileCount: 2,
      createdAt: "2026-07-05T00:00:00Z",
    }),
    record({
      id: "rec-2",
      recordNumber: null,
      title: "Site Notes",
      recordType: "document",
      discipline: null,
      status: "active",
      currentRevision: null,
      hasDraftRevision: false,
      fileCount: 0,
      createdAt: "2026-07-04T00:00:00Z",
    }),
    record({
      id: "rec-3",
      recordNumber: "S-200",
      title: "Framing Spec",
      recordType: "specification",
      discipline: "Structural",
      status: "archived",
      currentRevision: {
        id: "rev-3",
        revisionNumber: 2,
        revisionLabel: "B",
        status: "superseded",
        title: "Old",
      },
      fileCount: 1,
      createdAt: "2026-07-03T00:00:00Z",
      capabilities: { update: false, archive: false },
    }),
  ],
  capabilities: { createRecord: true },
};

type RouteHandler = () => Response;
type Routes = Partial<Record<string, RouteHandler>>;

interface MountOptions {
  role?: Role;
  routes?: Routes;
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
  if (key === "POST /api/v2/projects/proj-1/records")
    return json(
      {
        data: record({ id: "rec-new", title: "New Record" }),
        meta: { requestId: "req-new" },
      },
      201,
    );
  if (/^\/api\/v2\/projects\/[^/]+\/records$/.test(pathname))
    return ok(recordsPayload);
  if (/^\/api\/v2\/projects\/[^/]+$/.test(pathname)) return ok(projectDetail);
  return fail(404);
}

function mount(path: string, options: MountOptions = {}) {
  const role = options.role ?? "org_admin";
  const routes = options.routes ?? {};
  const window = new Window({ url: `https://base.test${path}` });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';

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
    const handler = routes[key] ?? routes[pathname];
    return Promise.resolve(
      handler ? handler() : defaultHandler(key, pathname, role),
    );
  });

  const shell = createAppShell({ window, document, fetch });
  shells.push(shell);
  return { window, document, shell, fetch };
}

function grab(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Expected to find ${selector}.`);
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

function rowIds(document: Document): string[] {
  return [
    ...document.querySelectorAll('.records-table tbody th[scope="row"] a'),
  ].map((link) => {
    const href = link.getAttribute("href") ?? "";
    return href.slice(href.lastIndexOf("/") + 1);
  });
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

async function mountRecords(
  path = "/projects/proj-1/records",
  options: MountOptions = {},
) {
  const harness = mount(path, options);
  await harness.shell.ready;
  await waitFor(() => {
    expect(
      harness.document.querySelector(
        ".records-view .records-table, .records-view .records-empty",
      ),
    ).not.toBeNull();
  });
  return harness;
}

describe("records register view", () => {
  it("renders active records as a table with canonical detail links and mobile cards", async () => {
    const { document } = await mountRecords();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
    const openHrefs = [
      ...document.querySelectorAll(".records-table .cell-open a"),
    ].map((link) => link.getAttribute("href"));
    expect(openHrefs).toContain("/projects/proj-1/records/rec-1");
    expect(document.querySelector(".record-cards")).not.toBeNull();
    expect(document.querySelectorAll(".record-cards li")).toHaveLength(2);
    const toolbar = grab(document, ".records-toolbar");
    expect(toolbar.querySelectorAll(".app-field")).toHaveLength(6);
    expect(toolbar.querySelector(".field")).toBeNull();
  });

  it("shows the current revision, no-revision state, draft presence, and file count", async () => {
    const { document } = await mountRecords();
    const firstRow = grab(document, ".records-table tbody tr");
    expect(firstRow.textContent).toContain("Revision 1");
    expect(firstRow.textContent).toContain("Published");
    expect(firstRow.textContent).toContain("Draft in progress");
    expect(firstRow.querySelector(".cell-files")?.textContent).toBe("2");
    expect(textOf(document, ".records-table")).toContain(
      "No published revision",
    );
  });

  it("hides archived records by default and reveals them on request as read-only", async () => {
    const { document } = await mountRecords();
    expect(rowIds(document)).not.toContain("rec-3");

    const archived = grab(document, "#records-archived");
    (archived as HTMLInputElement).value = "all";
    fire(archived, "change");
    await settle();
    expect(rowIds(document)).toContain("rec-3");
    const archivedRow = [
      ...document.querySelectorAll(".records-table tbody tr"),
    ].find((row) => row.textContent.includes("Framing Spec"));
    expect(archivedRow?.textContent).toContain("Archived");
  });

  it("searches case-insensitively across title and record number", async () => {
    const { document } = await mountRecords();
    const search = grab(document, "#records-search") as HTMLInputElement;
    search.value = "site";
    fire(search, "input");
    await settle();
    expect(rowIds(document)).toEqual(["rec-2"]);

    search.value = "A-101";
    fire(search, "input");
    await settle();
    expect(rowIds(document)).toEqual(["rec-1"]);
  });

  it("filters by type, discipline, and current-revision status and reports the count", async () => {
    const { document } = await mountRecords();
    const type = grab(document, "#records-type") as HTMLInputElement;
    type.value = "document";
    fire(type, "change");
    await settle();
    expect(rowIds(document)).toEqual(["rec-2"]);
    expect(textOf(document, "[data-result-count]")).toContain("Showing 1 of 2");

    grab(document, ".records-toolbar [data-clear-filters]").click();
    await settle();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);

    const revision = grab(document, "#records-revision") as HTMLInputElement;
    revision.value = "none";
    fire(revision, "change");
    await settle();
    expect(rowIds(document)).toEqual(["rec-2"]);
  });

  it("shows a filtered empty state that retains filters and can be cleared", async () => {
    const { document } = await mountRecords();
    const search = grab(document, "#records-search") as HTMLInputElement;
    search.value = "nonexistent";
    fire(search, "input");
    await settle();
    expect(textOf(document, ".records-empty")).toContain(
      "No records match these filters",
    );
    grab(document, ".records-empty [data-clear-filters]").click();
    await settle();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
  });

  it("restores list state from the URL query string", async () => {
    const { document } = await mountRecords("/projects/proj-1/records?q=Site");
    expect(fieldValue(document, "#records-search")).toBe("Site");
    expect(rowIds(document)).toEqual(["rec-2"]);

    const archivedOnly = await mountRecords(
      "/projects/proj-1/records?archived=archived",
    );
    expect(rowIds(archivedOnly.document)).toEqual(["rec-3"]);
  });

  it("mirrors filter changes into the URL query string", async () => {
    const { document, window } = await mountRecords();
    const type = grab(document, "#records-type") as HTMLInputElement;
    type.value = "document";
    fire(type, "change");
    await settle();
    expect(window.location.search).toContain("type=document");
  });

  it("restores the previous list state on browser back", async () => {
    const { document, window } = await mountRecords();
    const type = grab(document, "#records-type") as HTMLInputElement;
    type.value = "document";
    fire(type, "change");
    await settle();
    expect(rowIds(document)).toEqual(["rec-2"]);
    window.history.back();
    await settle(8);
    await waitFor(() => {
      expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
    });
  });
});

describe("records create authorization and dialog", () => {
  it("shows Create record when the capability is present", async () => {
    const { document } = await mountRecords();
    expect(
      document.querySelector(".records-heading [data-create-record]"),
    ).not.toBeNull();
  });

  it("hides Create record when the capability is absent but still lists records", async () => {
    const readOnly = {
      records: recordsPayload.records.map((r) => ({
        ...r,
        capabilities: { update: false, archive: false },
      })),
      capabilities: { createRecord: false },
    };
    const { document } = await mountRecords("/projects/proj-1/records", {
      role: "viewer",
      routes: { "GET /api/v2/projects/proj-1/records": () => ok(readOnly) },
    });
    expect(document.querySelector("[data-create-record]")).toBeNull();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
  });

  it("validates the create form before submitting", async () => {
    const { document } = await mountRecords();
    grab(document, ".records-heading [data-create-record]").click();
    expect(document.querySelector(".app-dialog")).not.toBeNull();
    expect(document.activeElement?.id).toBe("rf-title-input");
    expect(
      document.querySelector('.app-dialog [aria-invalid="true"]'),
    ).toBeNull();
    expect(document.querySelector(".app-dialog .field")).toBeNull();
    fire(grab(document, ".app-dialog form"), "submit");
    await settle(1);
    expect(
      document.querySelector("#rf-title-error")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(grab(document, "#rf-title-input").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("navigates to the new record detail route after a successful creation", async () => {
    const { document, window } = await mountRecords();
    grab(document, ".records-heading [data-create-record]").click();
    setFieldValue(document, "#rf-title-input", "New Record");
    (grab(document, "#rf-type") as HTMLInputElement).value = "drawing";
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects/proj-1/records/rec-new");
    });
    expect(document.querySelector(".app-dialog")).toBeNull();
  });

  it("preserves input and surfaces the request id when creation fails", async () => {
    const { document } = await mountRecords("/projects/proj-1/records", {
      routes: {
        "POST /api/v2/projects/proj-1/records": () => fail(409, "req-conflict"),
      },
    });
    grab(document, ".records-heading [data-create-record]").click();
    setFieldValue(document, "#rf-title-input", "New Record");
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(
        document.querySelector(".app-dialog-error")?.hasAttribute("hidden"),
      ).toBe(false);
    });
    expect(textOf(document, ".app-dialog-error")).toContain("req-conflict");
    expect(fieldValue(document, "#rf-title-input")).toBe("New Record");
  });

  it("closes the create dialog on Escape", async () => {
    const { document } = await mountRecords();
    grab(document, ".records-heading [data-create-record]").click();
    expect(document.querySelector(".app-dialog")).not.toBeNull();
    const overlay = grab(document, ".app-dialog-overlay");
    const view = overlay.ownerDocument.defaultView as unknown as {
      KeyboardEvent: typeof KeyboardEvent;
    };
    overlay.dispatchEvent(
      new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle(1);
    expect(document.querySelector(".app-dialog")).toBeNull();
  });
});
