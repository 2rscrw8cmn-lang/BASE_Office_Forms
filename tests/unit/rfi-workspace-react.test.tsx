// @vitest-environment happy-dom
/*
 * Native React RFI workspace (UI-7): the shared workspace hierarchy applied to
 * a structured record, response separated from the question, explicit file
 * roles, optimistic-concurrency conflict recovery, capability-gated lifecycle
 * transitions, immutable original-issue evidence, and every required async
 * state.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RfiWorkspaceFeature } from "../../src/ui/features/rfi-workspace/RfiWorkspaceFeature";
import {
  attachment,
  installWorkspaceFetch,
  jsonResponse,
  PROJECT_ID,
  RFI_ID,
  renderWorkspace,
  rfiWorkspace,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;
const PATH = `/projects/${PROJECT_ID}/rfis/${RFI_ID}`;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

function render() {
  return renderWorkspace(
    <RfiWorkspaceFeature projectId={PROJECT_ID} rfiId={RFI_ID} />,
    PATH,
  );
}

async function waitForWorkspace() {
  await waitFor(() => {
    expect(
      document.querySelector(".rfi-workspace .base-workspace__identity"),
    ).not.toBeNull();
  });
}

function root(): HTMLElement {
  const node = document.querySelector(".rfi-workspace");
  if (node === null) throw new Error("Expected the RFI workspace.");
  return node as HTMLElement;
}

describe("RFI workspace — hierarchy and identity", () => {
  it("renders the shared workspace hierarchy with the RFI's own content", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    expect(root().querySelector(".base-breadcrumbs")).not.toBeNull();
    expect(root().querySelector(".base-workspace__metadata")).not.toBeNull();
    expect(
      within(root()).getByRole("heading", { name: "RFI content" }),
    ).toBeInTheDocument();
    expect(
      within(root()).getByRole("heading", { name: "Files" }),
    ).toBeInTheDocument();
    expect(
      within(root()).getByRole("heading", { name: "Activity" }),
    ).toBeInTheDocument();

    const crumb = within(root()).getByRole("link", { name: "RFIs" });
    expect(crumb.getAttribute("href")).toBe(`/projects/${PROJECT_ID}/rfis`);
  });

  it("shows no official number before issue and never a database id", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    expect(root().textContent).toContain("Unnumbered Draft");
    expect(root().textContent).not.toContain(RFI_ID);
  });

  it("shows the official number once it exists", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "open" },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();
    expect(root().textContent).toContain("RFI-014");
  });

  it("labels a legacy incomplete issuance instead of implying it was issued", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: {
          rfiNumber: "RFI-003",
          status: "open",
          issuedAt: "2026-05-01T09:00:00Z",
          issuanceReconciliationState: "legacy_incomplete",
        },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();

    expect(root().textContent).toContain("Needs issue repair");
    expect(root().textContent).toContain("Reserved RFI-003");
    const notice = root().querySelector(".base-workspace-notice");
    expect(notice?.textContent).toContain(
      "Legacy issue requires reconciliation",
    );
    // An incomplete legacy issuance never presents an Issued date as fact.
    expect(
      root().querySelector(".base-workspace__metadata")?.textContent,
    ).not.toContain("Issued");
  });
});

describe("RFI workspace — content and concurrency", () => {
  it("edits the draft through one form and sends the server's lockVersion", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const subject = screen.getByLabelText(/Subject/);
    await userEvent.clear(subject);
    await userEvent.type(
      subject,
      "Relocate diffuser above the conference room",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === "PATCH")).toBe(true);
    });
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body?.subject).toBe(
      "Relocate diffuser above the conference room",
    );
    expect(patch?.body?.lockVersion).toBe(1);
    // Status is never an editable field here.
    expect(patch?.body).not.toHaveProperty("status");
    expect(patch?.body).not.toHaveProperty("rfiNumber");
  });

  it("blocks an empty subject or question client-side without a request", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.clear(screen.getByLabelText(/Subject/));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("A subject is required."),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("reloads the authoritative values and asks for a retry on a 409 conflict", async () => {
    const conflicted = rfiWorkspace({
      rfi: { subject: "Changed by another reviewer", lockVersion: 3 },
    });
    const { calls } = installWorkspaceFetch({
      rfiResponses: [
        jsonResponse({ data: rfiWorkspace() }),
        jsonResponse({ data: conflicted }),
      ],
      onPatchRfi: () =>
        jsonResponse(
          { error: { code: "RFI_VERSION_CONFLICT", message: "Changed." } },
          { status: 409 },
        ),
    });
    render();
    await waitForWorkspace();

    await userEvent.type(screen.getByLabelText(/Subject/), " updated");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
    });
    // The latest server values replaced the stale ones in the editor.
    await waitFor(() => {
      expect(screen.getByLabelText(/Subject/)).toHaveValue(
        "Changed by another reviewer",
      );
    });
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  });

  it("says permission was lost rather than retrying a denied save", async () => {
    const { calls } = installWorkspaceFetch({
      onPatchRfi: () => jsonResponse({ error: {} }, { status: 403 }),
    });
    render();
    await waitForWorkspace();

    await userEvent.type(screen.getByLabelText(/Subject/), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText(
        "You no longer have permission to edit this draft.",
      ),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  });

  it("renders content read-only when the server does not grant updateDraft", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "open" },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();

    expect(document.querySelector("[data-rfi-content-form]")).toBeNull();
    expect(root().textContent).toContain("Question");
    // Assigned to / Response due move into the metadata strip when read-only,
    // so each fact keeps exactly one authoritative location.
    expect(
      root().querySelector(".base-workspace__metadata")?.textContent,
    ).toContain("Assigned to");
  });

  it("keeps Assigned to and Response due out of the strip while they are editable", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    const metadata = root().querySelector(".base-workspace__metadata");
    expect(metadata?.textContent).not.toContain("Assigned to");
    expect(metadata?.textContent).not.toContain("Response due");
    expect(screen.getByLabelText(/Assigned to/)).toBeInTheDocument();
  });
});

describe("RFI workspace — rail layout", () => {
  it("renders the shared workspace in the rail layout, beside a constrained main column", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    expect(root()).toHaveClass("base-workspace--rail");
    const grid = root().querySelector(".base-workspace__grid");
    expect(grid).not.toBeNull();
    // Rail-top (facts + any lifecycle notice), main body, and secondary
    // (activity) are three siblings inside the same grid -- not a full-width
    // strip above a full-width column, the pattern this correction replaces.
    expect(
      grid?.querySelector(":scope > .base-workspace__rail-top"),
    ).not.toBeNull();
    expect(
      grid?.querySelector(":scope > .base-workspace__body"),
    ).not.toBeNull();
    expect(
      grid?.querySelector(":scope > .base-workspace__secondary"),
    ).not.toBeNull();
  });

  it("keeps editable-draft facts only in the editor, never duplicated into the context rail", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    const railTop = root().querySelector(".base-workspace__rail-top");
    expect(railTop?.textContent).not.toContain("Assigned to");
    expect(railTop?.textContent).not.toContain("Response due");
    expect(screen.getByLabelText(/Assigned to/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Response due/)).toBeInTheDocument();
  });

  it("shows routing facts in the context rail once the RFI is read-only", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "open" },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();

    // The editor is gone, so Assigned to / Response due move into the rail --
    // their only remaining authoritative location.
    expect(screen.queryByLabelText(/Assigned to/)).toBeNull();
    const railTop = root().querySelector(".base-workspace__rail-top");
    expect(railTop?.textContent).toContain("Assigned to");
    expect(railTop?.textContent).toContain("Response due");
  });

  it("keeps activity in the secondary rail context, never mixed into the main work column", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        activity: [
          {
            action: "rfi.created",
            actorType: "user",
            actorDisplayName: "Dana PM",
            createdAt: "2026-07-01T09:00:00Z",
            changedFields: [],
            role: null,
          },
        ],
      }),
    });
    render();
    await waitForWorkspace();

    const body = root().querySelector(".base-workspace__body");
    const secondary = root().querySelector(".base-workspace__secondary");
    expect(body?.querySelector(".base-activity")).toBeNull();
    expect(secondary?.querySelector(".base-activity")).not.toBeNull();
    expect(secondary?.textContent).toContain("RFI drafted");
  });
});

describe("RFI workspace — files", () => {
  it("shows each file's explicit role and exact draft revision", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        attachments: {
          supporting_attachment: [attachment()],
          reference_drawing: [
            attachment({
              id: "attachment-2",
              role: "reference_drawing",
              originalFilename: "a2-11.pdf",
            }),
          ],
        },
      }),
    });
    render();
    await waitForWorkspace();

    const rows = root().querySelectorAll(".base-file-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Supporting attachment");
    expect(rows[0].textContent).toContain("Current Draft");
    expect(rows[1].textContent).toContain("Reference drawing");

    const download = screen.getByRole("link", { name: "Download sketch.pdf" });
    expect(download.getAttribute("href")).toBe(
      `/api/v2/projects/${PROJECT_ID}/rfis/${RFI_ID}/attachments/attachment-1/content`,
    );
  });

  it("uploads with the chosen role and refreshes from confirmed server data", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.selectOptions(
      screen.getByLabelText("File role"),
      "reference_drawing",
    );
    await userEvent.upload(
      document.querySelector("[data-attachment-file]") as HTMLInputElement,
      new File(["x"], "a2-11.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add file" }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/attachments"))).toBe(
        true,
      );
    });
    const upload = calls.find((call) => call.url.endsWith("/attachments"));
    expect(upload?.role).toBe("reference_drawing");
    expect(upload?.fileName).toBe("a2-11.pdf");
  });

  it("reconciles with the server before offering an attachment retry", async () => {
    installWorkspaceFetch({
      onUploadAttachment: () =>
        jsonResponse(
          { error: { message: "Storage unavailable.", requestId: "req-att" } },
          { status: 503 },
        ),
    });
    render();
    await waitForWorkspace();

    await userEvent.upload(
      document.querySelector("[data-attachment-file]") as HTMLInputElement,
      new File(["x"], "sketch.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add file" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Storage unavailable.");
    expect(alert.textContent).toContain("refreshed from the server");
    expect(alert.textContent).toContain("req-att");
    expect(
      screen.getByRole("button", { name: "Retry upload" }),
    ).toBeInTheDocument();
  });
});

describe("RFI workspace — response", () => {
  it("keeps the response in its own section, separate from the question", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: {
          rfiNumber: "RFI-014",
          status: "response_received",
          costImpact: "None",
          scheduleImpact: "None",
        },
        capabilities: { updateDraft: false },
        responses: [
          {
            id: "response-1",
            response: "Use the 9'-0\" hard lid; the soffit is revised.",
            respondedBy: "Alex Architect",
            createdAt: "2026-07-18T09:00:00Z",
          },
        ],
      }),
    });
    render();
    await waitForWorkspace();

    const heading = within(root()).getByRole("heading", { name: "Response" });
    expect(heading).toBeInTheDocument();
    const recorded = root().querySelector("[data-recorded-response]");
    expect(recorded?.textContent).toContain("Use the 9'-0\" hard lid");
    expect(recorded?.textContent).toContain("Alex Architect");
    expect(recorded?.textContent).toContain("Cost impact");
    // The question is untouched by the response.
    expect(root().textContent).toContain(
      "Coordinate the revised diffuser location with S-201.",
    );
  });

  it("offers no response section for a draft that cannot receive one", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();
    expect(
      within(root()).queryByRole("heading", { name: "Response" }),
    ).toBeNull();
  });

  it("records a response only when the server grants the capability", async () => {
    const { calls } = installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "open" },
        capabilities: { updateDraft: false, recordResponse: true },
      }),
    });
    render();
    await waitForWorkspace();

    await userEvent.type(
      screen.getByLabelText(/Response/),
      "Proceed as drawn.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Submit response" }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/respond"))).toBe(true);
    });
    expect(
      calls.find((call) => call.url.endsWith("/respond"))?.body?.response,
    ).toBe("Proceed as drawn.");
  });

  it("shows an awaiting-response state for an issued RFI with no response", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "open" },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();
    expect(root().querySelector("[data-no-response]")?.textContent).toContain(
      "No response has been recorded.",
    );
  });
});

describe("RFI workspace — lifecycle and issuance", () => {
  it("does not introduce the separate full issuance dialog", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { status: "ready_to_issue" },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();

    expect(document.body.textContent).not.toContain("Issue RFI");
    expect(document.body.textContent).not.toContain("Mark ready");
    expect(document.querySelector('[data-transition="issue"]')).toBeNull();
  });

  it("offers Return to draft only from the authoritative capability and confirms it", async () => {
    const { calls } = installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { status: "ready_to_issue" },
        capabilities: { updateDraft: false, returnToDraft: true, void: false },
      }),
    });
    render();
    await waitForWorkspace();

    await userEvent.click(
      screen.getByRole("button", { name: "Return to draft" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.url.endsWith("/return-to-draft"))).toBe(
      false,
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Return to draft" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/return-to-draft"))).toBe(
        true,
      );
    });
  });

  it("confirms a close transition before sending it", async () => {
    const { calls } = installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-014", status: "response_received" },
        capabilities: { updateDraft: false, close: true },
      }),
    });
    render();
    await waitForWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "Close RFI" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.url.endsWith("/close"))).toBe(false);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close RFI" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/close"))).toBe(true);
    });
  });

  it("keeps Void behind the overflow menu as a destructive action", async () => {
    const { calls } = installWorkspaceFetch();
    render();
    await waitForWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "RFI actions" }));
    const item = await screen.findByRole("menuitem", { name: "Void RFI" });
    await userEvent.click(item);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("cannot be undone");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Void RFI" }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/void"))).toBe(true);
    });
  });

  it("offers no actions at all when the server grants none", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-009", status: "closed" },
        capabilities: {
          updateDraft: false,
          uploadAttachment: false,
          void: false,
        },
      }),
    });
    render();
    await waitForWorkspace();
    expect(document.querySelector("[data-primary-action]")).toBeNull();
    expect(document.querySelector("[data-rfi-actions]")).toBeNull();
    expect(document.querySelector("[data-attachment-form]")).toBeNull();
  });
});

describe("RFI workspace — immutable original issue evidence", () => {
  it("persists official evidence and PDF download after reload without using it as current authority", async () => {
    const issued = rfiWorkspace({
      rfi: { rfiNumber: "RFI-014", status: "closed" },
      currentVersion: {
        id: "rfi-draft-1",
        label: "Original Issue",
        status: "published",
      },
      officialIssue: {
        officialDisplayNumber: "RFI-014",
        issuedRevision: {
          id: "rfi-draft-1",
          internalRevisionNumber: 1,
          userFacingVersion: "Original Issue",
        },
        issuance: { id: "issuance-1", issueNumber: "ISS-014" },
        issuedAt: "2026-07-10T09:00:00Z",
        responseDueDate: "2026-08-05",
        officialArtifact: {
          fileId: "official-rfi-pdf",
          role: "generated_artifact",
          originalFilename: "RFI-014.pdf",
          mediaType: "application/pdf",
          byteSize: 42000,
          sha256: "a".repeat(64),
        },
        includedFiles: [],
        recipients: { to: [], cc: [] },
        originalIssueRequestId: "req-original-issue",
      },
      capabilities: { updateDraft: false, void: false },
    });
    installWorkspaceFetch({ rfi: issued });
    render();
    await waitForWorkspace();

    const evidence = root().querySelector(".rfi-workspace-original-issue");
    expect(evidence?.textContent).toContain("Original issue");
    expect(evidence?.textContent).toContain("ISS-014");
    expect(evidence?.textContent).toContain("Original Issue");
    const pdf = screen.getByRole("link", { name: "Download RFI-014.pdf" });
    expect(pdf.getAttribute("href")).toBe(
      `/api/v2/projects/${PROJECT_ID}/rfis/${RFI_ID}/attachments/official-rfi-pdf/content`,
    );
    // Current lifecycle state comes from top-level rfi.status, not the immutable
    // evidence object (which has no status or capabilities).
    expect(root().textContent).toContain("Closed");
  });
});

describe("RFI workspace — document view and activity", () => {
  it("never offers a document view control that can only report itself unavailable", async () => {
    installWorkspaceFetch();
    render();
    await waitForWorkspace();

    // No renderer runtime is loaded in this test environment, so the note is
    // shown directly -- not behind a "Show document view" toggle that would
    // only ever open onto the same sentence.
    expect(
      screen.queryByRole("button", { name: /Show document view/ }),
    ).toBeNull();
    expect(
      await screen.findByText(/controlled renderer is not loaded/),
    ).toBeInTheDocument();
  });

  it("offers the real, keyboard-operable document view once a renderer runtime is present", async () => {
    const base = globalThis as { BASE?: unknown };
    const previousBase = base.BASE;
    base.BASE = {
      render: () => '<div data-mock-preview="1">Bound document</div>',
    };
    try {
      installWorkspaceFetch({
        rfi: rfiWorkspace({
          template: {
            templateVersionId: "tv-1",
            key: "rfi",
            name: "RFI Template",
            versionNumber: 1,
            definition: {},
          },
        }),
      });
      render();
      await waitForWorkspace();

      const toggle = screen.getByRole("button", {
        name: /Show document view/,
      });
      expect(
        screen.queryByText(/controlled renderer is not loaded/),
      ).toBeNull();
      await userEvent.click(toggle);
      await waitFor(() => {
        expect(root().querySelector("[data-mock-preview]")).not.toBeNull();
      });
    } finally {
      if (previousBase === undefined) delete base.BASE;
      else base.BASE = previousBase;
    }
  });

  it("renders only mapped activity labels and structured details", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        activity: [
          {
            action: "rfi.created",
            actorType: "user",
            actorDisplayName: "Dana PM",
            createdAt: "2026-07-01T09:00:00Z",
            changedFields: [],
            role: null,
          },
          {
            action: "rfi.updated",
            actorType: "user",
            actorDisplayName: null,
            createdAt: "2026-07-02T09:00:00Z",
            changedFields: ["subject", "requestedResponseDate"],
            role: null,
          },
          {
            action: "rfi.attachment_added",
            actorType: "system",
            actorDisplayName: null,
            createdAt: "2026-07-03T09:00:00Z",
            changedFields: [],
            role: "reference_drawing",
          },
        ],
      }),
    });
    render();
    await waitForWorkspace();

    const feed = root().querySelector(".base-activity");
    expect(feed?.textContent).toContain("RFI drafted");
    expect(feed?.textContent).toContain("Dana PM");
    expect(feed?.textContent).toContain("Subject, Requested response date");
    expect(feed?.textContent).toContain("Reference drawing");
    expect(feed?.textContent).toContain("System");
    // Never raw activity JSON.
    expect(feed?.textContent).not.toContain("{");
    expect(feed?.textContent).not.toContain("changedFields");
  });
});

describe("RFI workspace — async states", () => {
  it("uses the generic not-found surface for 403 and 404 alike", async () => {
    for (const status of [403, 404]) {
      installWorkspaceFetch({
        rfiResponses: [jsonResponse({ error: {} }, { status })],
      });
      render();
      await waitFor(() => {
        expect(
          document.querySelector(".base-state--permission")?.textContent,
        ).toContain("RFI not found");
      });
      cleanup();
    }
  });

  it("offers a retry with the request id when the load fails", async () => {
    installWorkspaceFetch({
      rfiResponses: [
        jsonResponse(
          { error: { message: "Unavailable", requestId: "req-99" } },
          { status: 503 },
        ),
        jsonResponse({ data: rfiWorkspace() }),
      ],
    });
    render();

    await screen.findByText("Unable to load this RFI");
    expect(screen.getByText("req-99")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitForWorkspace();
  });

  it("keeps long content readable", async () => {
    const long =
      "The mechanical drawings show a hard lid at 9'-0\" AFF. ".repeat(20);
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { rfiNumber: "RFI-020", status: "open", question: long },
        capabilities: { updateDraft: false },
      }),
    });
    render();
    await waitForWorkspace();
    expect(root().textContent).toContain(long.trim());
  });
});
