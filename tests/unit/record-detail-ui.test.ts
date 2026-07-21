import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

const shells: Array<{ destroy(): void }> = [];
afterEach(() => {
  shells.splice(0).forEach((shell) => {
    shell.destroy();
  });
});

function ok(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ data, meta: { requestId: "req-test" } }),
    { status, headers: { "content-type": "application/json" } },
  );
}
const project = {
  id: "proj-1",
  projectNumber: "P-001",
  name: "Operations Center",
  status: "active",
};
const workspace = {
  record: {
    id: "rec-1",
    projectId: "proj-1",
    recordType: "drawing",
    recordNumber: "A-201",
    title: "Second Floor Plan",
    description: "Architectural plan record",
    discipline: "ARCH",
    source: "Consultant",
    status: "active",
    archivedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  },
  currentRevision: {
    id: "rev-1",
    revisionNumber: 1,
    revisionLabel: "A",
    title: "Second Floor Plan",
    changeSummary: "Initial issue",
    status: "published",
    createdAt: "2026-07-01T00:00:00Z",
    fileCount: 2,
    isCurrent: true,
  },
  revisions: [
    {
      id: "rev-2",
      revisionNumber: 2,
      revisionLabel: "B",
      title: "Second Floor Plan",
      description: null,
      discipline: "ARCH",
      source: null,
      changeSummary: "Coordination update",
      status: "draft",
      createdAt: "2026-07-02T00:00:00Z",
      fileCount: 1,
      isCurrent: false,
    },
    {
      id: "rev-1",
      revisionNumber: 1,
      revisionLabel: "A",
      title: "Second Floor Plan",
      description: null,
      discipline: "ARCH",
      source: null,
      changeSummary: "Initial issue",
      status: "published",
      createdAt: "2026-07-01T00:00:00Z",
      fileCount: 2,
      isCurrent: true,
    },
  ],
  totalFileCount: 3,
  capabilities: {
    updateRecord: true,
    archiveRecord: true,
    createRevision: true,
  },
};

async function waitFor(assertion: () => void) {
  let error: unknown;
  for (let count = 0; count < 40; count += 1) {
    try {
      assertion();
      return;
    } catch (caught) {
      error = caught;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw error;
}

async function mount(overrides: Partial<Record<string, () => Response>> = {}) {
  const window = new Window({
    url: "https://base.test/projects/proj-1/records/rec-1",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      "https://base.test",
    );
    const key = `${(init?.method || "GET").toUpperCase()} ${url.pathname}`;
    const override = overrides[key];
    if (override) return Promise.resolve(override());
    if (key === "GET /api/v2/session")
      return Promise.resolve(
        ok({
          user: { id: "user-1" },
          organization: { id: "org-1", name: "BASE" },
          membership: { role: "org_admin" },
          projectPermissions: [],
        }),
      );
    if (key === "GET /api/v2/projects/proj-1")
      return Promise.resolve(ok(project));
    if (key === "GET /api/v2/projects/proj-1/records/rec-1/workspace")
      return Promise.resolve(ok(workspace));
    return Promise.resolve(ok({}, 404));
  });
  const shell = createAppShell({ window, document, fetch });
  shells.push(shell);
  await shell.ready;
  await waitFor(() => {
    expect(document.querySelector(".record-detail-header")).not.toBeNull();
  });
  return { window, document, fetch };
}

function click(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  element.click();
}
function submit(document: Document) {
  const form = document.querySelector(".app-dialog form");
  if (!form) throw new Error("Missing dialog form");
  const view = form.ownerDocument.defaultView as unknown as {
    Event: typeof Event;
  };
  form.dispatchEvent(
    new view.Event("submit", { bubbles: true, cancelable: true }),
  );
}

describe("record detail workspace", () => {
  it("loads one workspace endpoint and renders authoritative current, drafts, semantic history, and metadata", async () => {
    const { document, fetch } = await mount();
    expect(document.querySelector("#page-title")?.textContent).toBe(
      "Second Floor Plan",
    );
    expect(document.querySelector(".record-current")?.textContent).toContain(
      "Rev A",
    );
    expect(document.querySelector(".record-drafts")?.textContent).toContain(
      "Rev B",
    );
    expect(document.querySelector(".record-history table")).not.toBeNull();
    expect(document.querySelector(".record-history-cards")).not.toBeNull();
    expect(
      document.querySelector(
        'a[href="/projects/proj-1/records/rec-1/revisions/rev-2"]',
      ),
    ).not.toBeNull();
    const urls = fetch.mock.calls.map(([input]) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    expect(urls.filter((url) => url.includes("/workspace"))).toHaveLength(1);
    expect(urls.some((url) => /\/revisions$/.test(url))).toBe(false);
  });

  it("edits only mutable fields and reloads after server confirmation", async () => {
    const { document, fetch } = await mount({
      "PATCH /api/v2/projects/proj-1/records/rec-1": () => ok({}),
    });
    click(document, "[data-edit-record]");
    (document.querySelector('[name="title"]') as HTMLInputElement).value =
      "Updated plan";
    submit(document);
    await waitFor(() => {
      expect(
        fetch.mock.calls.filter(([, init]) => init?.method === "PATCH"),
      ).toHaveLength(1);
    });
    const call = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    const patchBody = call?.[1]?.body;
    if (typeof patchBody !== "string") throw new Error("Expected JSON body");
    expect(JSON.parse(patchBody)).toMatchObject({ title: "Updated plan" });
    expect(JSON.parse(patchBody)).not.toHaveProperty("recordType");
    await waitFor(() => {
      expect(
        fetch.mock.calls.filter(([input]) => {
          const value =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          return value.includes("/workspace");
        }),
      ).toHaveLength(2);
    });
  });

  it("creates a draft without a revision number and navigates to its canonical route", async () => {
    const { document, window, fetch } = await mount({
      "POST /api/v2/projects/proj-1/records/rec-1/revisions": () =>
        ok({ id: "rev-3" }, 201),
    });
    click(document, ".record-detail-actions [data-create-revision]");
    (
      document.querySelector('[name="changeSummary"]') as HTMLTextAreaElement
    ).value = "New coordination";
    submit(document);
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/projects/proj-1/records/rec-1/revisions/rev-3",
      );
    });
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    const createBody = call?.[1]?.body;
    if (typeof createBody !== "string") throw new Error("Expected JSON body");
    expect(JSON.parse(createBody)).toEqual({
      changeSummary: "New coordination",
    });
    expect(document.querySelector('[name="revisionNumber"]')).toBeNull();
  });

  it("renders archived records as readable with no mutation actions", async () => {
    const archived = {
      ...workspace,
      record: {
        ...workspace.record,
        status: "archived",
        archivedAt: "2026-07-03T00:00:00Z",
      },
      capabilities: {
        updateRecord: false,
        archiveRecord: false,
        createRevision: false,
      },
    };
    const { document } = await mount({
      "GET /api/v2/projects/proj-1/records/rec-1/workspace": () => ok(archived),
    });
    expect(
      document.querySelector(".record-archived-note")?.textContent,
    ).toContain("read-only");
    expect(
      document.querySelector(
        "[data-edit-record], [data-archive-record], [data-create-revision]",
      ),
    ).toBeNull();
    expect(document.querySelector(".record-history a")).not.toBeNull();
  });
});
