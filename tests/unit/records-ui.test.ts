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
      updatedAt: "2026-07-20T12:00:00Z",
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
        data: record({
          id: "rec-new",
          recordNumber: "0004",
          title: "New Record",
        }),
        meta: { requestId: "req-new" },
      },
      201,
    );
  if (key === "POST /api/v2/projects/proj-1/records/rec-new/revisions")
    return json(
      { data: { id: "rev-new" }, meta: { requestId: "req-revision" } },
      201,
    );
  if (
    key ===
    "POST /api/v2/projects/proj-1/records/rec-new/revisions/rev-new/files"
  )
    return json(
      { data: { id: "file-new" }, meta: { requestId: "req-file" } },
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
  it("uses the compact register header with total count and capability-gated action", async () => {
    const { document } = await mountRecords();
    const header = grab(document, ".records-heading");
    expect(header.classList.contains("app-register-header")).toBe(true);
    expect(header.classList.contains("app-container-register")).toBe(true);
    expect(header.querySelector("h2")?.textContent).toBe("Document Register");
    expect(header.querySelector(".app-register-count")?.textContent).toBe(
      "3 records",
    );
    expect(header.querySelector("[data-create-record]")).not.toBeNull();
    expect(header.querySelector(".app-eyebrow")).toBeNull();
    expect(header.querySelector("p")).toBeNull();
  });

  it("renders active records as a table with canonical detail links and mobile cards", async () => {
    const { document } = await mountRecords();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
    const recordHrefs = [
      ...document.querySelectorAll('.records-table th[scope="row"] a'),
    ].map((link) => link.getAttribute("href"));
    expect(recordHrefs).toContain("/projects/proj-1/records/rec-1");
    expect(document.querySelector(".records-table .cell-open")).toBeNull();
    expect(document.querySelector(".record-cards")).not.toBeNull();
    expect(document.querySelectorAll(".record-cards li")).toHaveLength(2);
    expect(
      document
        .querySelector(".records-view")
        ?.classList.contains("app-register-page"),
    ).toBe(true);
    const toolbar = grab(document, ".records-toolbar");
    expect(toolbar.querySelectorAll(".app-field")).toHaveLength(6);
    expect(toolbar.querySelector(".field")).toBeNull();
  });

  it("shows the current revision, no-revision state, draft presence, and file count", async () => {
    const { document } = await mountRecords();
    const firstRow = grab(document, ".records-table tbody tr");
    expect(firstRow.textContent).toContain("Original");
    expect(firstRow.textContent).toContain("Published");
    expect(firstRow.textContent).toContain("Draft in progress");
    expect(firstRow.querySelector(".cell-files")?.textContent).toBe("2");
    expect(textOf(document, ".records-table")).toContain("No revision");
    const headers = [
      ...document.querySelectorAll(".records-table thead th"),
    ].map((header) => header.textContent.trim());
    expect(headers).toEqual([
      "Record",
      "Type",
      "Discipline",
      "Revision",
      "Files",
      "Updated",
    ]);
    expect(firstRow.querySelector(".cell-date")?.textContent).toContain(
      "July 20, 2026",
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
    expect(textOf(document, "[data-result-count]")).toBe("1 of 2 records");

    grab(document, ".records-toolbar [data-clear-filters]").click();
    await settle();
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);

    const revision = grab(document, "#records-revision") as HTMLInputElement;
    revision.value = "none";
    fire(revision, "change");
    await settle();
    expect(rowIds(document)).toEqual(["rec-2"]);
  });

  it("renders removable chips and resets only the selected filter", async () => {
    const { document, window } = await mountRecords();
    const type = grab(document, "#records-type") as HTMLInputElement;
    type.value = "drawing";
    fire(type, "change");
    const discipline = grab(
      document,
      "#records-discipline",
    ) as HTMLInputElement;
    discipline.value = "Architecture";
    fire(discipline, "change");
    await settle();

    const chips = document.querySelectorAll(".app-filter-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute("aria-label")).toBe(
      "Remove Type filter: Drawing",
    );
    expect(window.location.search).toContain("type=drawing");
    expect(window.location.search).toContain("discipline=Architecture");

    grab(document, '[data-remove-filter="type"]').click();
    await settle();
    expect(fieldValue(document, "#records-type")).toBe("all");
    expect(fieldValue(document, "#records-discipline")).toBe("Architecture");
    expect(window.location.search).not.toContain("type=");
    expect(window.location.search).toContain("discipline=Architecture");
    expect(document.querySelectorAll(".app-filter-chip")).toHaveLength(1);
  });

  it("shows Clear all only for active filters, not sorting alone", async () => {
    const { document } = await mountRecords();
    const clear = grab(document, ".records-toolbar [data-clear-filters]");
    expect(clear.hasAttribute("hidden")).toBe(true);

    const sort = grab(document, "#records-sort") as HTMLInputElement;
    sort.value = "title";
    fire(sort, "change");
    await settle();
    expect(clear.hasAttribute("hidden")).toBe(true);

    const search = grab(document, "#records-search") as HTMLInputElement;
    search.value = "site";
    fire(search, "input");
    await settle();
    expect(clear.hasAttribute("hidden")).toBe(false);
    clear.click();
    await settle();
    expect(fieldValue(document, "#records-search")).toBe("");
    expect(fieldValue(document, "#records-sort")).toBe("title");
    expect(clear.hasAttribute("hidden")).toBe(true);
  });

  it("opens a record from non-interactive row space and ignores interactive descendants", async () => {
    const { document, window } = await mountRecords();
    const row = grab(document, ".records-table tbody tr");
    row.querySelector("td")?.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        button: 0,
      }) as unknown as Event,
    );
    await settle();
    expect(window.location.pathname).toBe("/projects/proj-1/records/rec-1");

    const modified = await mountRecords();
    await waitFor(() => {
      expect(
        modified.document.querySelector(".records-table tbody tr a"),
      ).not.toBeNull();
    });
    const modifiedRow = grab(modified.document, ".records-table tbody tr");
    const control = modified.document.createElement("button");
    control.type = "button";
    modifiedRow.querySelector("td")?.appendChild(control);
    control.dispatchEvent(
      new modified.window.MouseEvent("click", {
        bubbles: true,
        button: 0,
      }) as unknown as Event,
    );
    await settle();
    expect(modified.window.location.pathname).toBe("/projects/proj-1/records");
  });

  it("falls back safely from invalid URL filter values", async () => {
    const { document, window } = await mountRecords(
      "/projects/proj-1/records?type=invalid&discipline=unknown&revisionStatus=bad",
    );
    expect(fieldValue(document, "#records-type")).toBe("all");
    expect(fieldValue(document, "#records-discipline")).toBe("all");
    expect(fieldValue(document, "#records-revision")).toBe("all");
    expect(window.location.search).toBe("");
    expect(rowIds(document)).toEqual(["rec-1", "rec-2"]);
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

  it("renders true-empty guidance and preserves archived-only guidance", async () => {
    const empty = await mountRecords("/projects/proj-1/records", {
      routes: {
        "GET /api/v2/projects/proj-1/records": () =>
          ok({ records: [], capabilities: { createRecord: true } }),
      },
    });
    expect(textOf(empty.document, ".records-empty h3")).toBe("No records yet");
    expect(textOf(empty.document, ".records-empty")).toContain(
      "tracking revisions and files",
    );
    expect(
      empty.document.querySelector(".records-empty [data-create-record]"),
    ).not.toBeNull();

    const archivedRecord = record({
      id: "rec-archived",
      title: "Archived record",
      status: "archived",
    });
    const archived = await mountRecords("/projects/proj-1/records", {
      routes: {
        "GET /api/v2/projects/proj-1/records": () =>
          ok({
            records: [archivedRecord],
            capabilities: { createRecord: false },
          }),
      },
    });
    expect(textOf(archived.document, ".records-empty")).toContain(
      "This project has archived records",
    );
    grab(archived.document, "[data-include-archived]").click();
    await settle();
    expect(rowIds(archived.document)).toEqual(["rec-archived"]);
    expect(fieldValue(archived.document, "#records-archived")).toBe("all");
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
  it("shows Add document when the capability is present", async () => {
    const { document } = await mountRecords();
    expect(
      document.querySelector(".records-heading [data-create-record]"),
    ).not.toBeNull();
    expect(textOf(document, ".records-heading [data-create-record]")).toBe(
      "Add document",
    );
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
    grab(document, "[data-mode='upload']").click();
    expect(document.activeElement?.id).toBe("add-title");
    expect(
      document.querySelector('.app-dialog [aria-invalid="true"]'),
    ).toBeNull();
    expect(document.querySelector(".app-dialog .field")).toBeNull();
    fire(grab(document, ".app-dialog form"), "submit");
    await settle(1);
    expect(
      document.querySelector("#add-title-error")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(grab(document, "#add-title").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("navigates to the new record detail route after a successful creation", async () => {
    const { document, window, fetch } = await mountRecords();
    grab(document, ".records-heading [data-create-record]").click();
    grab(document, "[data-mode='empty']").click();
    expect(document.querySelector("#add-number")).toBeNull();
    expect(document.querySelector("#add-discipline")?.tagName).toBe("SELECT");
    setFieldValue(document, "#add-title", "New Document");
    (grab(document, "#add-type") as HTMLInputElement).value = "drawing";
    setFieldValue(document, "#add-discipline", "architectural");
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/proj-1/records/rec-new/revisions/rev-new",
      );
    });
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    const body = call?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected JSON body");
    expect(JSON.parse(body)).toMatchObject({
      recordType: "drawing",
      discipline: "architectural",
      title: "New Document",
    });
    expect(JSON.parse(body)).not.toHaveProperty("recordNumber");
    expect(document.querySelector(".app-dialog")).toBeNull();
  });

  it("preserves input and surfaces the request id when creation fails", async () => {
    const { document } = await mountRecords("/projects/proj-1/records", {
      routes: {
        "POST /api/v2/projects/proj-1/records": () => fail(409, "req-conflict"),
      },
    });
    grab(document, ".records-heading [data-create-record]").click();
    grab(document, "[data-mode='empty']").click();
    setFieldValue(document, "#add-title", "New Document");
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(
        document.querySelector(".app-dialog-error")?.hasAttribute("hidden"),
      ).toBe(false);
    });
    expect(textOf(document, ".app-dialog-error")).toContain("req-conflict");
    expect(fieldValue(document, "#add-title")).toBe("New Document");
  });

  it("creates a document, initial revision, and uploaded file before navigating", async () => {
    const { document, window, fetch } = await mountRecords();
    grab(document, ".records-heading [data-create-record]").click();
    grab(document, "[data-mode='upload']").click();
    setFieldValue(document, "#add-title", "Uploaded Plan");
    const file = new window.File(["drawing"], "A-301.pdf", {
      type: "application/pdf",
    });
    const input = grab(document, "#add-file") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/proj-1/records/rec-new/revisions/rev-new",
      );
    });
    const mutationPaths = fetch.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([input]) => {
        const value =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return new URL(value, "https://base.test").pathname;
      });
    expect(mutationPaths).toEqual([
      "/api/v2/projects/proj-1/records",
      "/api/v2/projects/proj-1/records/rec-new/revisions",
      "/api/v2/projects/proj-1/records/rec-new/revisions/rev-new/files",
    ]);
  });

  it("keeps a created draft recoverable when its file upload fails", async () => {
    const { document, window } = await mountRecords(
      "/projects/proj-1/records",
      {
        routes: {
          "POST /api/v2/projects/proj-1/records/rec-new/revisions/rev-new/files":
            () => fail(503, "req-file-failed"),
        },
      },
    );
    grab(document, ".records-heading [data-create-record]").click();
    grab(document, "[data-mode='upload']").click();
    setFieldValue(document, "#add-title", "Uploaded Plan");
    const file = new window.File(["drawing"], "A-301.pdf", {
      type: "application/pdf",
    });
    const input = grab(document, "#add-file") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    fire(grab(document, ".app-dialog form"), "submit");
    await waitFor(() => {
      expect(textOf(document, ".app-dialog-error")).toContain(
        "req-file-failed",
      );
    });
    expect(textOf(document, ".add-document-recovery")).toContain(
      "Open original and retry upload",
    );
    expect(
      document.querySelector("[data-recovery]")?.getAttribute("href"),
    ).toBe("/projects/proj-1/records/rec-new/revisions/rev-new");
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
