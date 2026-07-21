import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

const shells: Array<{ destroy(): void }> = [];
afterEach(() => {
  shells.splice(0).forEach((shell) => {
    shell.destroy();
  });
});

function response(data: unknown, status = 200, requestId = "req-test") {
  return new Response(JSON.stringify({ data, meta: { requestId } }), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

function failure(status: number, message: string, requestId: string) {
  return new Response(
    JSON.stringify({ error: { code: "ERROR", message, requestId } }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
    },
  );
}

const project = {
  id: "proj-1",
  projectNumber: "P-001",
  name: "Operations Center",
  status: "active",
};
const record = {
  id: "rec-1",
  projectId: "proj-1",
  recordType: "drawing",
  recordNumber: "A-201",
  title: "Second Floor Plan",
  description: null,
  discipline: "ARCH",
  source: null,
  status: "active",
  archivedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
interface FileFixture {
  id: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  uploadedAt: string;
}
const draftRevision = {
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
  fileCount: 0,
  files: [] as FileFixture[],
  issuanceCount: 0,
  isCurrent: false,
  capabilities: { uploadFile: true, publishRevision: true },
};

function workspace(revision = draftRevision) {
  return { record, revision, currentRevisionId: "rev-1" };
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let index = 0; index < 50; index += 1) {
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

type Handler = () => Response;
async function mount(overrides: Partial<Record<string, Handler>> = {}) {
  const window = new Window({
    url: "https://base.test/projects/proj-1/records/rec-1/revisions/rev-2",
  });
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
    const key = `${(init?.method || "GET").toUpperCase()} ${pathname}`;
    const override = overrides[key];
    if (override) return Promise.resolve(override());
    if (key === "GET /api/v2/session")
      return Promise.resolve(
        response({
          user: { id: "user-1" },
          organization: { id: "org-1", name: "BASE" },
          membership: { role: "org_admin" },
          projectPermissions: [],
        }),
      );
    if (key === "GET /api/v2/projects/proj-1")
      return Promise.resolve(response(project));
    if (
      key ===
      "GET /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/workspace"
    )
      return Promise.resolve(response(workspace()));
    if (
      key === "POST /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/files"
    )
      return Promise.resolve(response({ id: "file-new" }, 201));
    if (
      key ===
      "POST /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/publish"
    )
      return Promise.resolve(response({ id: "rev-2", status: "published" }));
    return Promise.resolve(failure(404, "Not found", "req-missing"));
  });
  const shell = createAppShell({ window, document, fetch });
  shells.push(shell);
  await shell.ready;
  await waitFor(() => {
    expect(document.querySelector(".revision-identity")).not.toBeNull();
  });
  return { window, document, fetch };
}

function selectFile(window: Window, document: Document) {
  const file = new window.File(["pdf-content"], "A-201-rev-B.pdf", {
    type: "application/pdf",
  });
  const input = document.querySelector<HTMLInputElement>("#revision-file");
  if (!input) throw new Error("Expected revision file input");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(
    new window.Event("change", {
      bubbles: true,
      cancelable: true,
    }) as unknown as Event,
  );
  return file;
}

describe("revision document workspace", () => {
  it("renders revision identity, actual files, and canonical scoped download URLs", async () => {
    const withFile = {
      ...draftRevision,
      fileCount: 1,
      files: [
        {
          id: "file-1",
          originalFilename: "A-201-rev-B.pdf",
          mediaType: "application/pdf",
          byteSize: 12000,
          uploadedAt: "2026-07-02T00:00:00Z",
        },
      ],
    };
    const { document, fetch } = await mount({
      "GET /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/workspace":
        () => response(workspace(withFile)),
    });
    expect(document.querySelector("#page-title")?.textContent).toBe(
      "Revision B",
    );
    expect(
      document.querySelector(".document-file-card")?.textContent,
    ).toContain("A-201-rev-B.pdf");
    expect(
      document.querySelector(".document-file-card a")?.getAttribute("href"),
    ).toBe(
      "/api/v2/projects/proj-1/records/rec-1/revisions/rev-2/files/file-1/content",
    );
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
    ).toHaveLength(1);
  });

  it("shows an upload-first empty draft and refreshes after a successful upload", async () => {
    const { window, document, fetch } = await mount();
    expect(
      document.querySelector(".document-upload-empty")?.textContent,
    ).toContain("No files attached");
    selectFile(window, document);
    await waitFor(() => {
      expect(
        document.querySelector("[data-upload-form] button")?.textContent,
      ).toContain("A-201-rev-B.pdf");
    });
    const form = document.querySelector<HTMLFormElement>("[data-upload-form]");
    form?.dispatchEvent(
      new window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event,
    );
    await waitFor(() => {
      expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
        true,
      );
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

  it("preserves the selected file and reports the request id when upload fails", async () => {
    const { window, document } = await mount({
      "POST /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/files": () =>
        failure(503, "Storage unavailable", "req-upload"),
    });
    selectFile(window, document);
    await waitFor(() => {
      expect(
        document.querySelector("[data-upload-form] button")?.textContent,
      ).toContain("A-201-rev-B.pdf");
    });
    document.querySelector("[data-upload-form]")?.dispatchEvent(
      new window.Event("submit", {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event,
    );
    await waitFor(() => {
      expect(document.querySelector(".revision-upload")?.textContent).toContain(
        "req-upload",
      );
      expect(document.querySelector(".revision-upload")?.textContent).toContain(
        "A-201-rev-B.pdf",
      );
    });
  });

  it("publishes and reloads the revision into a read-only state", async () => {
    const draftWithFile = {
      ...draftRevision,
      fileCount: 1,
      files: [
        {
          id: "file-1",
          originalFilename: "A-201-rev-B.pdf",
          mediaType: "application/pdf",
          byteSize: 12000,
          uploadedAt: "2026-07-02T00:00:00Z",
        },
      ],
    };
    const published = {
      ...draftWithFile,
      status: "published",
      isCurrent: true,
      capabilities: { uploadFile: false, publishRevision: false },
    };
    let loads = 0;
    const { document } = await mount({
      "GET /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/workspace":
        () => {
          loads += 1;
          return response(workspace(loads === 1 ? draftWithFile : published));
        },
    });
    document.querySelector<HTMLElement>("[data-publish]")?.click();
    await waitFor(() => {
      expect(
        document.querySelector(".document-read-only")?.textContent,
      ).toContain("Read-only revision");
      expect(document.querySelector("#revision-file")).toBeNull();
      expect(document.querySelector("[data-publish]")).toBeNull();
    });
  });

  it("never offers upload controls for a published revision", async () => {
    const published = {
      ...draftRevision,
      status: "published",
      isCurrent: true,
      capabilities: { uploadFile: false, publishRevision: false },
    };
    const { document } = await mount({
      "GET /api/v2/projects/proj-1/records/rec-1/revisions/rev-2/workspace":
        () => response(workspace(published)),
    });
    expect(document.querySelector("#revision-file, [data-publish]")).toBeNull();
    expect(document.querySelector(".document-read-only")).not.toBeNull();
  });
});
