// @vitest-environment happy-dom
/*
 * Native React Record workspace (UI-7): the shared Record Workspace hierarchy,
 * Record/Revision/File identity discipline, capability-gated actions, the
 * archived read-only presentation, publication as a confirmed official
 * transition, and every required async state.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordWorkspaceFeature } from "../../src/ui/features/record-workspace/RecordWorkspaceFeature";
import {
  installWorkspaceFetch,
  jsonResponse,
  PROJECT_ID,
  RECORD_ID,
  recordWorkspace,
  renderWorkspace,
  revision,
  file,
  workspaceRecord,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;
const PATH = `/projects/${PROJECT_ID}/records/${RECORD_ID}`;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

function render(options: Parameters<typeof renderWorkspace>[2] = {}) {
  return renderWorkspace(
    <RecordWorkspaceFeature projectId={PROJECT_ID} recordId={RECORD_ID} />,
    PATH,
    options,
  );
}

/** Waits for the ready state: the identity header only renders when loaded. */
async function waitForWorkspace() {
  await waitFor(() => {
    expect(
      document.querySelector(".record-workspace .base-workspace__identity"),
    ).not.toBeNull();
  });
}

function workspaceRoot(): HTMLElement {
  const node = document.querySelector(".record-workspace");
  if (node === null) throw new Error("Expected the record workspace.");
  return node as HTMLElement;
}

describe("Record workspace — hierarchy and identity", () => {
  it("renders the required workspace hierarchy in order", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const root = workspaceRoot();
    expect(root.querySelector(".base-breadcrumbs")).not.toBeNull();
    expect(root.querySelector(".base-workspace__identity")).not.toBeNull();
    expect(root.querySelector(".base-workspace__metadata")).not.toBeNull();
    expect(root.querySelector('[data-work="current"]')).not.toBeNull();

    // Breadcrumbs lead back to the Document Register.
    const crumb = within(root).getByRole("link", { name: "Documents" });
    expect(crumb.getAttribute("href")).toBe(`/projects/${PROJECT_ID}/records`);
  });

  it("shows Record identity in the header and Record facts in the metadata strip", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const root = workspaceRoot();
    expect(
      within(root).getByRole("heading", { name: "Level 2 Framing Plan" }),
    ).toBeInTheDocument();
    expect(root.textContent).toContain("A-101 · Drawing");

    const metadata = root.querySelector(".base-workspace__metadata");
    expect(metadata?.textContent).toContain("Discipline");
    expect(metadata?.textContent).toContain("Structural");
    expect(metadata?.textContent).toContain("Files");
    // Revision facts are NOT in the record strip: no duplicated facts.
    expect(metadata?.textContent).not.toContain("Change summary");
    expect(metadata?.textContent).not.toContain("Issuance");
  });

  it("never presents a database id as user-facing identity", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    expect(workspaceRoot().textContent).not.toContain(RECORD_ID);
  });

  it("says a record has no number rather than inventing one", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        record: workspaceRecord({ recordNumber: null }),
      }),
    });
    render();
    await waitForWorkspace();
    expect(workspaceRoot().textContent).toContain("Unnumbered document");
  });

  it("keeps a draft from standing in for the authoritative current revision", async () => {
    const published = revision({
      id: "revision-published",
      revisionNumber: 1,
      status: "published",
      isCurrent: true,
    });
    const draft = revision({
      id: "revision-draft",
      revisionNumber: 2,
      status: "draft",
      isCurrent: false,
      changeSummary: "Coordination updates",
      files: [],
      fileCount: 0,
      capabilities: { uploadFile: true, publishRevision: true },
    });
    installWorkspaceFetch({
      record: recordWorkspace({ revisions: [draft, published] }),
    });
    render();
    await waitForWorkspace();

    const root = workspaceRoot();
    // The draft is labelled as current WORK, not as the current version.
    const work = root.querySelector('[data-work="draft"]');
    expect(work?.textContent).toContain("Current work");
    expect(work?.textContent).toContain("Rev 1");
    expect(work?.textContent).toContain("Draft");
    // The authoritative current version keeps its own panel alongside the
    // draft, so the draft is never the only version on screen.
    const currentPanel = root.querySelector('[data-work="current"]');
    expect(currentPanel?.textContent).toContain("Current version");
    expect(currentPanel?.textContent).toContain("Original");
    expect(currentPanel?.textContent).toContain("Published");
  });

  it("lists multiple drafts instead of guessing which one is current", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        revisions: [
          revision({
            id: "d1",
            revisionNumber: 2,
            status: "draft",
            isCurrent: false,
          }),
          revision({
            id: "d2",
            revisionNumber: 3,
            status: "draft",
            isCurrent: false,
          }),
        ],
      }),
    });
    render();
    await waitForWorkspace();
    expect(
      document.querySelector('[data-work="multiple-drafts"]')?.textContent,
    ).toContain("2 drafts in progress");
  });
});

describe("Record workspace — files", () => {
  it("shows file name, readable type, size, and an authenticated download", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const row = document.querySelector(".base-file-row");
    expect(row?.textContent).toContain("level-2-framing.pdf");
    expect(row?.textContent).toContain("PDF document");
    expect(row?.textContent).toContain("2.0 KB");

    const download = screen.getByRole("link", {
      name: "Download level-2-framing.pdf",
    });
    expect(download.getAttribute("href")).toBe(
      `/api/v2/projects/${PROJECT_ID}/records/${RECORD_ID}/revisions/revision-1/files/file-1/content`,
    );
    // Never a storage key, bucket, or public R2 URL.
    expect(download.getAttribute("href")).not.toContain("r2");
  });

  it("distinguishes a draft with no files from a version with no file", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        revisions: [
          revision({
            status: "draft",
            isCurrent: false,
            files: [],
            fileCount: 0,
            capabilities: { uploadFile: true, publishRevision: false },
          }),
        ],
      }),
    });
    render();
    await waitForWorkspace();
    expect(workspaceRoot().textContent).toContain("No document file yet");
    expect(workspaceRoot().textContent).toContain(
      "Add the document file to this draft before it is published",
    );
  });
});

describe("Record workspace — capabilities and lifecycle", () => {
  it("offers no mutation actions when the server grants none", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        capabilities: {
          updateRecord: false,
          archiveRecord: false,
          createRevision: false,
        },
      }),
    });
    render();
    await waitForWorkspace();
    expect(document.querySelector("[data-record-actions]")).toBeNull();
    expect(document.querySelector("[data-create-revision]")).toBeNull();
  });

  it("states the archived lifecycle reason instead of silently dropping actions", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        record: workspaceRecord({
          status: "archived",
          archivedAt: "2026-07-15T09:00:00Z",
        }),
        capabilities: {
          updateRecord: false,
          archiveRecord: false,
          createRevision: false,
        },
      }),
    });
    render();
    await waitForWorkspace();

    const notice = document.querySelector(".base-workspace-notice");
    expect(notice?.textContent).toContain("Archived document");
    expect(notice?.textContent).toContain("cannot receive new revisions");
    expect(notice?.textContent).toContain("Jul 15, 2026");
  });

  it("offers publish only for a draft the server says can be published and that has a file", async () => {
    installWorkspaceFetch({
      record: recordWorkspace({
        revisions: [
          revision({
            status: "draft",
            isCurrent: false,
            files: [],
            fileCount: 0,
            capabilities: { uploadFile: true, publishRevision: true },
          }),
        ],
      }),
    });
    render();
    await waitForWorkspace();
    expect(document.querySelector("[data-publish-revision]")).toBeNull();
  });

  it("treats publication as a confirmed official transition, not a save", async () => {
    const draft = revision({
      id: "revision-draft",
      status: "draft",
      isCurrent: false,
      capabilities: { uploadFile: true, publishRevision: true },
    });
    const { calls } = installWorkspaceFetch({
      record: recordWorkspace({ revisions: [draft] }),
    });
    const { announcements } = render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Publish revision" }),
    );
    // A confirmation appears first; nothing has been sent yet.
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("supersedes the previous current");
    expect(calls.some((call) => call.url.includes("/publish"))).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish revision" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes("/publish"))).toBe(true);
    });
    const publish = calls.find((call) => call.url.includes("/publish"));
    expect(publish?.method).toBe("POST");
    // Success is claimed only after the server confirms.
    await waitFor(() => {
      expect(announcements).toContain("Revision published.");
    });
  });

  it("keeps the confirmation open and explains a failed publication", async () => {
    const draft = revision({
      id: "revision-draft",
      status: "draft",
      isCurrent: false,
      capabilities: { uploadFile: true, publishRevision: true },
    });
    installWorkspaceFetch({
      record: recordWorkspace({ revisions: [draft] }),
      onPublishRevision: () =>
        jsonResponse(
          {
            error: {
              code: "REVISION_NOT_PUBLISHABLE",
              message: "This revision cannot be published.",
              requestId: "req-publish",
            },
          },
          { status: 422 },
        ),
    });
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Publish revision" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish revision" }),
    );

    await waitFor(() => {
      expect(dialog.textContent).toContain(
        "This revision cannot be published.",
      );
    });
    expect(dialog.textContent).toContain("req-publish");
  });
});

describe("Record workspace — record workflows", () => {
  it("edits document details through the shared form dialog", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit document details" }),
    );

    const title = await screen.findByLabelText(/Title/);
    await userEvent.clear(title);
    await userEvent.type(title, "Level 2 Framing Plan (revised)");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === "PATCH")).toBe(true);
    });
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body?.title).toBe("Level 2 Framing Plan (revised)");
  });

  it("blocks an empty title client-side without sending a request", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit document details" }),
    );
    const title = await screen.findByLabelText(/Title/);
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Document title is required."),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("confirms archiving before sending it", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Archive document" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("read-only");
    expect(calls.some((call) => call.url.includes("/archive"))).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive document" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes("/archive"))).toBe(true);
    });
  });

  it("creates a draft revision and navigates to it only after the server confirms", async () => {
    const { calls } = installWorkspaceFetch();
    const { navigations } = render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Document actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Create draft revision" }),
    );
    await userEvent.type(
      await screen.findByLabelText(/Change summary/),
      "Coordination updates",
    );
    expect(navigations).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => {
      expect(navigations).toEqual([
        `/projects/${PROJECT_ID}/records/${RECORD_ID}/revisions/revision-new`,
      ]);
    });
    const created = calls.find((call) => call.url.endsWith("/revisions"));
    expect(created?.body?.changeSummary).toBe("Coordination updates");
    // The revision number is never supplied by the browser.
    expect(created?.body).not.toHaveProperty("revisionNumber");
  });
});

describe("Record workspace — navigation safety", () => {
  it("navigates through the shell on a plain click of the primary action", async () => {
    installWorkspaceFetch();
    const { navigations } = render();
    await waitForWorkspace();

    const primary = screen.getByRole("link", { name: "View current version" });
    await userEvent.click(primary);
    expect(navigations).toEqual([
      `/projects/${PROJECT_ID}/records/${RECORD_ID}/revisions/revision-1`,
    ]);
  });

  it("leaves a modifier-clicked primary action to native browser behaviour", async () => {
    installWorkspaceFetch();
    const { navigations } = render();
    await waitForWorkspace();

    const primary = screen.getByRole("link", { name: "View current version" });
    const modifierClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    primary.dispatchEvent(modifierClick);

    // Ctrl/cmd/shift/alt-click and middle-click must open a new tab, not be
    // hijacked into an in-app navigation the browser never gets to see.
    expect(modifierClick.defaultPrevented).toBe(false);
    expect(navigations).toEqual([]);
  });
});

describe("Record workspace — async states", () => {
  it("shows a loading state before the workspace resolves", async () => {
    const release: { current: ((value: Response) => void) | null } = {
      current: null,
    };
    installWorkspaceFetch({
      recordResponses: [
        new Promise<Response>((resolve) => {
          release.current = resolve;
        }),
      ],
    });
    render();
    await waitFor(() => {
      expect(document.querySelector(".base-workspace__loading")).not.toBeNull();
    });
    release.current?.(jsonResponse({ data: recordWorkspace() }));
    await waitFor(() => {
      expect(document.querySelector(".base-workspace__loading")).toBeNull();
    });
  });

  it("uses one generic not-found surface for 403 and 404 alike", async () => {
    for (const status of [403, 404]) {
      installWorkspaceFetch({
        recordResponses: [jsonResponse({ error: {} }, { status })],
      });
      render();
      await waitFor(() => {
        expect(
          document.querySelector(".base-state--permission")?.textContent,
        ).toContain("Document not found");
      });
      // Nothing distinguishes "forbidden" from "absent".
      expect(document.body.textContent).not.toContain("Forbidden");
      expect(document.body.textContent).not.toContain("permission");
      cleanup();
    }
  });

  it("offers a retry with the request id when the load fails", async () => {
    installWorkspaceFetch({
      recordResponses: [
        jsonResponse(
          { error: { message: "Unavailable", requestId: "req-77" } },
          { status: 503 },
        ),
        jsonResponse({ data: recordWorkspace() }),
      ],
    });
    render();

    await screen.findByText("Unable to load this document");
    expect(screen.getByText("req-77")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Level 2 Framing Plan" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps long titles and summaries readable without breaking the header", async () => {
    const long = "Existing conditions survey ".repeat(12).trim();
    installWorkspaceFetch({
      record: recordWorkspace({
        record: workspaceRecord({ title: long }),
        revisions: [
          revision({ changeSummary: long, files: [file()], fileCount: 1 }),
        ],
      }),
    });
    render();
    await waitForWorkspace();
    expect(screen.getByRole("heading", { name: long })).toBeInTheDocument();
  });
});
