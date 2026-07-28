// @vitest-environment happy-dom
/*
 * Native React Revision workspace (UI-7): exact revision context, immutability
 * presented rather than merely enforced, capability-gated upload and publish,
 * the staged upload-failure reconciliation, and every required async state.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RevisionWorkspaceFeature } from "../../src/ui/features/record-workspace/RevisionWorkspaceFeature";
import {
  installWorkspaceFetch,
  jsonResponse,
  PROJECT_ID,
  RECORD_ID,
  REVISION_ID,
  renderWorkspace,
  revision,
  revisionWorkspace,
  workspaceRecord,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;
const PATH = `/projects/${PROJECT_ID}/records/${RECORD_ID}/revisions/${REVISION_ID}`;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

function render() {
  return renderWorkspace(
    <RevisionWorkspaceFeature
      projectId={PROJECT_ID}
      recordId={RECORD_ID}
      revisionId={REVISION_ID}
    />,
    PATH,
  );
}

async function waitForWorkspace() {
  await waitFor(() => {
    expect(
      document.querySelector(".revision-workspace .base-workspace__identity"),
    ).not.toBeNull();
  });
}

function root(): HTMLElement {
  const node = document.querySelector(".revision-workspace");
  if (node === null) throw new Error("Expected the revision workspace.");
  return node as HTMLElement;
}

const draftRevision = () =>
  revision({
    status: "draft",
    isCurrent: false,
    revisionNumber: 2,
    changeSummary: "Coordination updates",
    capabilities: { uploadFile: true, publishRevision: true },
  });

describe("Revision workspace — exact revision context", () => {
  it("names this version, its document, and the trail back to both", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    expect(
      within(root()).getByRole("heading", { name: "Original" }),
    ).toBeInTheDocument();
    expect(root().textContent).toContain("A-101 · Drawing");
    expect(root().textContent).toContain("Level 2 Framing Plan");

    const crumbs = root().querySelector(".base-breadcrumbs");
    expect(
      within(crumbs as HTMLElement).getByRole("link", { name: "Documents" }),
    ).toBeInTheDocument();
    const documentCrumb = within(crumbs as HTMLElement).getByRole("link", {
      name: "Level 2 Framing Plan",
    });
    expect(documentCrumb.getAttribute("href")).toBe(
      `/projects/${PROJECT_ID}/records/${RECORD_ID}`,
    );
  });

  it("says when this revision is the document's current version", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    expect(root().textContent).toContain("Current version");
  });

  it("does not claim current-version status for a draft", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
    });
    render();
    await waitForWorkspace();
    const identity = root().querySelector(".base-workspace__identity");
    expect(identity?.textContent).not.toContain("Current version");
    expect(identity?.textContent).toContain("Draft");
  });

  it("keeps revision facts on the revision, separate from record facts", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    const metadata = root().querySelector(".base-workspace__metadata");
    expect(metadata?.textContent).toContain("Created");
    expect(metadata?.textContent).toContain("Files");
    expect(metadata?.textContent).toContain("Issuance");
    expect(metadata?.textContent).toContain("Not issued");
    // Record-level metadata belongs to the Record workspace.
    expect(metadata?.textContent).not.toContain("Discipline");
  });

  it("shows the change summary as its own section", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    expect(
      within(root()).getByRole("heading", { name: "Change summary" }),
    ).toBeInTheDocument();
    expect(root().textContent).toContain("Initial document");
  });
});

describe("Revision workspace — immutability", () => {
  it("states that a published version is immutable and offers no upload", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const notice = root().querySelector(".base-workspace-notice");
    expect(notice?.textContent).toContain("Published version");
    expect(notice?.textContent).toContain("immutable");
    expect(document.querySelector("[data-upload-form]")).toBeNull();
    expect(document.querySelector("[data-primary-action]")).toBeNull();
  });

  it("states that a superseded version is immutable", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({
        revision: revision({ status: "superseded", isCurrent: false }),
      }),
    });
    render();
    await waitForWorkspace();
    expect(
      root().querySelector(".base-workspace-notice")?.textContent,
    ).toContain("Superseded version");
  });

  it("lets an archived document take precedence over the revision status", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({
        record: workspaceRecord({
          status: "archived",
          archivedAt: "2026-07-15T09:00:00Z",
        }),
        revision: draftRevision(),
      }),
    });
    render();
    await waitForWorkspace();
    const notices = root().querySelectorAll(".base-workspace-notice");
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain("Archived document");
    expect(notices[0].textContent).toContain("Jul 15, 2026");
  });
});

describe("Revision workspace — upload", () => {
  it("uploads to this exact revision and announces only after the server confirms", async () => {
    const { calls } = installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
    });
    const { announcements } = render();
    await waitForWorkspace();

    const input = document.querySelector<HTMLInputElement>(
      "[data-revision-file]",
    );
    expect(input).not.toBeNull();
    await userEvent.upload(
      input as HTMLInputElement,
      new File(["x"], "framing-rev-1.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/files"))).toBe(true);
    });
    const upload = calls.find((call) => call.url.endsWith("/files"));
    expect(upload?.method).toBe("POST");
    expect(upload?.url).toContain(`/revisions/${REVISION_ID}/files`);
    expect(upload?.fileName).toBe("framing-rev-1.pdf");
    await waitFor(() => {
      expect(announcements).toContain(
        "framing-rev-1.pdf uploaded to this revision.",
      );
    });
  });

  it("validates a missing file without sending a request", async () => {
    const { calls } = installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
    });
    render();
    await waitForWorkspace();
    // The submit stays disabled until a file is chosen, so no request is
    // possible; the control still carries its own validation copy.
    expect(screen.getByRole("button", { name: "Upload file" })).toBeDisabled();
    expect(calls.some((call) => call.url.endsWith("/files"))).toBe(false);
  });

  it("reconciles with the server before offering a retry after a failed upload", async () => {
    const { calls } = installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
      onUploadFile: () =>
        jsonResponse(
          {
            error: {
              code: "FILE_UNAVAILABLE",
              message: "The file could not be stored.",
              requestId: "req-upload",
            },
          },
          { status: 503 },
        ),
    });
    render();
    await waitForWorkspace();

    const before = calls.filter((call) =>
      call.url.endsWith("/workspace"),
    ).length;
    await userEvent.upload(
      document.querySelector("[data-revision-file]") as HTMLInputElement,
      new File(["x"], "framing.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The file could not be stored.");
    expect(alert.textContent).toContain("was not attached");
    expect(alert.textContent).toContain("refreshed from the server");
    expect(alert.textContent).toContain("req-upload");
    // The workspace was refetched, so the file list on screen is server truth
    // before any retry is attempted.
    await waitFor(() => {
      expect(
        calls.filter((call) => call.url.endsWith("/workspace")).length,
      ).toBeGreaterThan(before);
    });
    // The selected filename survives so the retry is one click.
    expect(
      screen.getByRole("button", { name: "Retry upload" }),
    ).toBeInTheDocument();
  });
});

describe("Revision workspace — publish", () => {
  it("offers publish as the primary action only for a publishable draft with a file", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
    });
    render();
    await waitForWorkspace();
    expect(
      screen.getByRole("button", { name: "Publish revision" }),
    ).toBeInTheDocument();
  });

  it("explains, rather than offers, publication for a draft with no file", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({
        revision: revision({
          ...draftRevision(),
          files: [],
          fileCount: 0,
        }),
      }),
    });
    render();
    await waitForWorkspace();
    expect(document.querySelector("[data-primary-action]")).toBeNull();
    expect(root().textContent).toContain(
      "needs at least one file before it can be published",
    );
  });

  it("requires explicit confirmation before publishing", async () => {
    const { calls } = installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
    });
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Publish revision" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Publish Rev 1?");
    expect(calls.some((call) => call.url.endsWith("/publish"))).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Publish revision" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/publish"))).toBe(true);
    });
  });

  it("reports a publish conflict and reloads the authoritative state", async () => {
    const { calls } = installWorkspaceFetch({
      revisionModel: revisionWorkspace({ revision: draftRevision() }),
      onPublishRevision: () =>
        jsonResponse(
          { error: { code: "REVISION_VERSION_CONFLICT" } },
          { status: 409 },
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
      expect(dialog.textContent).toContain("changed elsewhere");
    });
    expect(calls.filter((call) => call.url.endsWith("/publish"))).toHaveLength(
      1,
    );
  });
});

describe("Revision workspace — async states", () => {
  it("uses the generic not-found surface for 403 and 404 alike", async () => {
    for (const status of [403, 404]) {
      installWorkspaceFetch({
        revisionResponses: [jsonResponse({ error: {} }, { status })],
      });
      render();
      await waitFor(() => {
        expect(
          document.querySelector(".base-state--permission")?.textContent,
        ).toContain("Revision not found");
      });
      cleanup();
    }
  });

  it("offers a retry with the request id when the load fails", async () => {
    installWorkspaceFetch({
      revisionResponses: [
        jsonResponse(
          { error: { message: "Unavailable", requestId: "req-88" } },
          { status: 503 },
        ),
        jsonResponse({ data: revisionWorkspace() }),
      ],
    });
    render();

    await screen.findByText("Unable to load this revision");
    expect(screen.getByText("req-88")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitForWorkspace();
  });
});
