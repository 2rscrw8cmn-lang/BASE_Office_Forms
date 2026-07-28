// @vitest-environment happy-dom
/*
 * The official issue workflow end to end in the browser: routing selection,
 * the review stage, the canonical payload, and — the merge-critical part —
 * what happens when the request fails, times out, or leaves the outcome
 * unknown. A duplicate official RFI is the failure mode these tests exist to
 * make impossible.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RfiWorkspaceFeature } from "../../src/ui/features/rfi-workspace/RfiWorkspaceFeature";
import {
  dashboardQueryKey,
  projectOverviewQueryKey,
} from "../../src/ui/app/queryKeys";
import { projectRfisQueryKey } from "../../src/ui/features/rfis/useProjectRfis";
import {
  attachment,
  installWorkspaceFetch,
  jsonResponse,
  officialIssueResult,
  officialIssueSummary,
  PROJECT_ID,
  renderWorkspace,
  RFI_ID,
  rfiWorkspace,
  type RecordedCall,
  type RfiWorkspaceOverrides,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;
const PATH = `/projects/${PROJECT_ID}/rfis/${RFI_ID}`;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

const SUPPORTING = attachment({
  id: "attachment-1",
  role: "supporting_attachment",
  originalFilename: "ceiling-sketch.pdf",
  byteSize: 812_000,
});
const DRAWING = attachment({
  id: "attachment-2",
  role: "reference_drawing",
  originalFilename: "A2-11-reflected-ceiling.pdf",
  byteSize: 1_450_000,
});

function ready(overrides: RfiWorkspaceOverrides = {}) {
  return rfiWorkspace({
    attachments: {
      supporting_attachment: [SUPPORTING],
      reference_drawing: [DRAWING],
    },
    ...overrides,
    rfi: { status: "ready_to_issue", ...overrides.rfi },
    capabilities: {
      updateDraft: false,
      markReady: false,
      returnToDraft: true,
      issue: true,
      ...overrides.capabilities,
    },
  });
}

/** A promise a test can hold open, so an in-flight request stays in flight. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** What the server holds once the official issue has actually committed. */
function issued() {
  return rfiWorkspace({
    rfi: {
      status: "open",
      rfiNumber: "RFI-014",
      issuedAt: "2026-07-25T09:00:00Z",
    },
    currentVersion: {
      id: "rfi-draft-1",
      label: "Original Issue",
      status: "published",
    },
    officialIssue: officialIssueSummary(),
    capabilities: {
      updateDraft: false,
      uploadAttachment: false,
      markReady: false,
      returnToDraft: false,
      issue: false,
      recordResponse: true,
    },
  });
}

function render() {
  return renderWorkspace(
    <RfiWorkspaceFeature projectId={PROJECT_ID} rfiId={RFI_ID} />,
    PATH,
  );
}

async function openIssueDialog() {
  await waitFor(() => {
    expect(
      document.querySelector(".rfi-workspace .base-workspace__identity"),
    ).not.toBeNull();
  });
  await userEvent.click(screen.getByRole("button", { name: "Issue RFI" }));
  return screen.findByRole("dialog");
}

function dialog(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[role="dialog"]');
  if (node === null) throw new Error("Expected the issue dialog.");
  return node;
}

async function continueToReview() {
  await userEvent.click(
    within(dialog()).getByRole("button", { name: "Continue to review" }),
  );
  await screen.findByText("Before you issue");
}

function issueCalls(calls: RecordedCall[]) {
  return calls.filter((call) => call.url.endsWith("/issue"));
}

async function submitIssue(label = "Issue official RFI") {
  await userEvent.click(within(dialog()).getByRole("button", { name: label }));
}

describe("Issue dialog — stage 1 details", () => {
  it("prefills the responsible contact as the only recipient", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const to = dialog().querySelector<HTMLElement>("[data-issue-recipients]");
    const boxes = within(to as HTMLElement).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute("aria-checked")).toBe("true");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
    expect(to?.textContent).toContain("Alex Architect — Meridian");
  });

  it("requires at least one recipient before the review stage", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const to = dialog().querySelector<HTMLElement>("[data-issue-recipients]");
    await userEvent.click(
      within(to as HTMLElement).getAllByRole("checkbox")[0],
    );
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Continue to review" }),
    );

    expect(
      await within(dialog()).findByText("Select at least one recipient."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Before you issue")).toBeNull();
  });

  it("keeps CC optional and prevents it overlapping To", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const cc = dialog().querySelector<HTMLElement>("[data-issue-cc]");
    const ccBoxes = within(cc as HTMLElement).getAllByRole("checkbox");
    // contact-1 is already the recipient, so it cannot also be copied.
    expect(ccBoxes[0]).toBeDisabled();
    expect(cc?.textContent).toContain("Already a recipient");
    expect(ccBoxes[1]).not.toBeDisabled();

    await continueToReview();
    expect(within(dialog()).getByText("None")).toBeInTheDocument();
  });

  it("moves a contact out of CC when it is promoted to To", async () => {
    installWorkspaceFetch({ rfi: ready() });
    const { calls } = installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const cc = dialog().querySelector<HTMLElement>("[data-issue-cc]");
    await userEvent.click(
      within(cc as HTMLElement).getAllByRole("checkbox")[1],
    );
    const to = dialog().querySelector<HTMLElement>("[data-issue-recipients]");
    await userEvent.click(
      within(to as HTMLElement).getAllByRole("checkbox")[1],
    );

    await continueToReview();
    await submitIssue();
    await waitFor(() => {
      expect(issueCalls(calls)).toHaveLength(1);
    });
    const body = issueCalls(calls)[0].body;
    expect(body?.recipientProjectContactIds).toEqual([
      "contact-1",
      "contact-2",
    ]);
    expect(body?.ccProjectContactIds).toEqual([]);
  });

  it("requires a real calendar response due date", async () => {
    installWorkspaceFetch({
      rfi: ready({ rfi: { requestedResponseDate: null } }),
    });
    render();
    await openIssueDialog();

    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Continue to review" }),
    );
    expect(
      await within(dialog()).findByText(
        "Enter a response due date as YYYY-MM-DD.",
      ),
    ).toBeInTheDocument();
  });

  it("prefills the response due date from the RFI", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const due = dialog().querySelector<HTMLInputElement>("[data-issue-due]");
    expect(due?.value).toBe("2026-08-05");
  });

  it("lists eligible attachments by role and selects them by default", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const files = dialog().querySelector<HTMLElement>("[data-issue-files]");
    expect(files?.textContent).toContain("Supporting attachments");
    expect(files?.textContent).toContain("Reference drawings");
    expect(files?.textContent).toContain("ceiling-sketch.pdf");
    expect(files?.textContent).toContain("793.0 KB");
    expect(files?.textContent).toContain("Current Draft");
    const boxes = within(files as HTMLElement).getAllByRole("checkbox");
    for (const box of boxes) {
      expect(box.getAttribute("aria-checked")).toBe("true");
    }
    // Exactly the two attachments -- the generated official PDF is created by
    // the server and is never one of these checkboxes.
    expect(boxes.map((box) => box.getAttribute("value"))).toEqual([
      "attachment-1",
      "attachment-2",
    ]);
    expect(files?.textContent).toContain(
      "The official RFI PDF is generated by the server and is not one of these files.",
    );
  });

  it("omits an attachment that belongs to a different revision", async () => {
    installWorkspaceFetch({
      rfi: ready({
        attachments: {
          supporting_attachment: [
            SUPPORTING,
            attachment({
              id: "attachment-old",
              revisionId: "rfi-draft-0",
              originalFilename: "superseded.pdf",
            }),
          ],
          reference_drawing: [],
        },
      }),
    });
    render();
    await openIssueDialog();

    const files = dialog().querySelector<HTMLElement>("[data-issue-files]");
    expect(files?.textContent).toContain("ceiling-sketch.pdf");
    expect(files?.textContent).not.toContain("superseded.pdf");
  });

  it("sends exactly the deselected file set", async () => {
    const { calls } = installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const files = dialog().querySelector<HTMLElement>("[data-issue-files]");
    await userEvent.click(
      within(files as HTMLElement).getAllByRole("checkbox")[0],
    );
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(issueCalls(calls)).toHaveLength(1);
    });
    expect(issueCalls(calls)[0].body?.includedFileIds).toEqual([
      "attachment-2",
    ]);
  });

  it("states record-only delivery and offers no unsupported delivery control", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    const delivery = dialog().querySelector<HTMLElement>(
      "[data-issue-delivery]",
    );
    expect(delivery?.textContent).toContain("Record only");
    expect(delivery?.textContent).toContain(
      "It does not send an email or external notification.",
    );
    // Delivery is a fixed summary: no control at all, so no disabled email or
    // portal option can imply a feature that does not exist.
    expect(
      delivery?.querySelectorAll("input, select, button, [role='checkbox']"),
    ).toHaveLength(0);
    expect(within(dialog()).queryAllByRole("radio")).toHaveLength(0);
    expect(within(dialog()).queryAllByRole("combobox")).toHaveLength(0);
  });
});

describe("Issue dialog — stage 2 review", () => {
  it("shows the canonical payload and the server's authority over the number", async () => {
    installWorkspaceFetch({
      rfi: ready({
        template: {
          templateVersionId: "tv-1",
          key: "base-rfi",
          name: "BASE RFI",
          versionNumber: 3,
          definition: {},
        },
      }),
    });
    render();
    await openIssueDialog();
    await continueToReview();

    const review = dialog().querySelector<HTMLElement>("[data-issue-review]");
    expect(review?.textContent).toContain(
      "Relocate ceiling diffuser above conference room",
    );
    expect(review?.textContent).toContain("BASE RFI (version 3)");
    expect(review?.textContent).toContain("Alex Architect");
    expect(review?.textContent).toContain("2026-08-05");
    expect(review?.textContent).toContain("ceiling-sketch.pdf");
    expect(review?.textContent).toContain("Record only");
    expect(review?.textContent).toContain(
      "The server assigns the official RFI number.",
    );
    expect(review?.textContent).toContain("immutable");
    // No predicted number anywhere in the workflow.
    expect(dialog().textContent).not.toMatch(/RFI-\d/);
  });

  it("labels the final action Issue official RFI, not Save/Submit/Send", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();
    await continueToReview();

    expect(
      within(dialog()).getByRole("button", { name: "Issue official RFI" }),
    ).toBeInTheDocument();
    for (const label of ["Save", "Submit", "Publish", "Send"]) {
      expect(
        within(dialog()).queryByRole("button", { name: label }),
      ).toBeNull();
    }
  });

  it("goes back to the details stage without issuing", async () => {
    const { calls } = installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();
    await continueToReview();

    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Back" }),
    );
    expect(
      await within(dialog()).findByText(
        "At least one project contact. The responsible contact is selected by default.",
      ),
    ).toBeInTheDocument();
    expect(issueCalls(calls)).toHaveLength(0);
  });
});

describe("Issue dialog — idempotency", () => {
  it("sends one request with one key for a double click", async () => {
    const gate = deferred();
    const { calls } = installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        gate.promise.then(() => jsonResponse({ data: officialIssueResult() })),
    });
    render();
    await openIssueDialog();
    await continueToReview();

    const button = within(dialog()).getByRole("button", {
      name: "Issue official RFI",
    });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(issueCalls(calls)).toHaveLength(1);
    expect(dialog().querySelector("[data-issue-pending]")?.textContent).toBe(
      "Issuing RFI…",
    );
    gate.resolve();
  });

  it("retries a transient failure with the same key and the same payload", async () => {
    let attempt = 0;
    const { calls } = installWorkspaceFetch({
      rfi: ready(),
      onIssue: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse(
              {
                error: {
                  code: "RFI_ARTIFACT_RENDER_FAILED",
                  message: "The official RFI artifact could not be generated.",
                  requestId: "req-render",
                },
              },
              { status: 503 },
            )
          : jsonResponse({ data: officialIssueResult() });
      },
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    const retry = await within(dialog()).findByRole("button", {
      name: "Retry issue",
    });
    expect(dialog().textContent).toContain("req-render");
    expect(dialog().textContent).toContain("Nothing was issued.");
    await userEvent.click(retry);

    await waitFor(() => {
      expect(issueCalls(calls)).toHaveLength(2);
    });
    const [first, second] = issueCalls(calls);
    expect(second.headers?.["idempotency-key"]).toBe(
      first.headers?.["idempotency-key"],
    );
    expect(second.body).toEqual(first.body);
  });

  it("does not mint a second key after a network failure", async () => {
    let attempt = 0;
    const { calls } = installWorkspaceFetch({
      rfi: ready(),
      onIssue: () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error("network down"));
        return jsonResponse({ data: officialIssueResult() });
      },
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    // The outcome is unknown, so the offer is a status check, not a blind retry.
    const check = await within(dialog()).findByRole("button", {
      name: "Check issue status",
    });
    expect(dialog().textContent).toContain(
      "The result of this issue attempt is unknown.",
    );
    expect(issueCalls(calls)).toHaveLength(1);

    await userEvent.click(check);
    await waitFor(() => {
      expect(
        calls.filter(
          (call) => call.method === "GET" && call.url.endsWith("/workspace"),
        ).length,
      ).toBeGreaterThan(2);
    });
    // Checking never POSTs again and never creates a second key.
    expect(issueCalls(calls)).toHaveLength(1);
  });

  it("locks the submitted payload until the outcome is reconciled", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () => Promise.reject(new Error("network down")),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await within(dialog()).findByRole("button", { name: "Check issue status" });
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Back" }),
    );
    // Back is disabled while the outcome is unknown, so the details are
    // unreachable and cannot be edited into a different payload.
    expect(within(dialog()).queryByText("Before you issue")).not.toBeNull();
    expect(
      within(dialog()).getByRole("button", { name: "Back" }),
    ).toBeDisabled();
  });

  it("mints a new key when the payload changes before a definitive submission", async () => {
    let attempt = 0;
    const { calls } = installWorkspaceFetch({
      rfi: ready(),
      onIssue: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse(
              {
                error: {
                  code: "RFI_STORAGE_UNAVAILABLE",
                  message: "Private storage is unavailable.",
                  requestId: "req-storage",
                },
              },
              { status: 503 },
            )
          : jsonResponse({ data: officialIssueResult() });
      },
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await within(dialog()).findByRole("button", { name: "Retry issue" });
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Back" }),
    );
    const cc = dialog().querySelector<HTMLElement>("[data-issue-cc]");
    await userEvent.click(
      within(cc as HTMLElement).getAllByRole("checkbox")[1],
    );
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(issueCalls(calls)).toHaveLength(2);
    });
    const [first, second] = issueCalls(calls);
    expect(second.headers?.["idempotency-key"]).not.toBe(
      first.headers?.["idempotency-key"],
    );
    expect(second.body?.ccProjectContactIds).toEqual(["contact-2"]);
  });

  it("never discloses another resource on an idempotency conflict", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        jsonResponse(
          {
            error: {
              code: "IDEMPOTENCY_KEY_REUSED",
              message:
                "This Idempotency-Key was already used with a different request.",
              requestId: "req-reuse",
            },
          },
          { status: 409 },
        ),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(dialog().textContent).toContain(
        "This Idempotency-Key was already used with a different request.",
      );
    });
    expect(dialog().textContent).toContain("req-reuse");
    // No other RFI, project, or key is named.
    expect(dialog().textContent).not.toMatch(/RFI-\d/);
    expect(
      within(dialog()).queryByRole("button", { name: "Retry issue" }),
    ).toBeNull();
  });
});

describe("Issue dialog — ambiguous outcomes and reconciliation", () => {
  it("treats a refetch that shows an official issue as success", async () => {
    const { calls } = installWorkspaceFetch({
      // The first read is the ready RFI; every later read is what the server
      // holds after the attempt actually committed.
      rfi: issued(),
      rfiResponses: [jsonResponse({ data: ready() })],
      onIssue: () => Promise.reject(new Error("connection reset")),
    });
    const view = render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(view.announcements).toContain(
      "This RFI was officially issued as RFI-014.",
    );
    // The success came from the server, not from a second POST.
    expect(issueCalls(calls)).toHaveLength(1);
    expect(view.wasInvalidated(projectRfisQueryKey(PROJECT_ID))).toBe(true);
    expect(view.wasInvalidated(dashboardQueryKey())).toBe(true);
    expect(view.wasInvalidated(projectOverviewQueryKey(PROJECT_ID))).toBe(true);
  });

  it("presents the existing evidence rather than asking for a second issue", async () => {
    installWorkspaceFetch({
      rfi: issued(),
      rfiResponses: [jsonResponse({ data: ready() })],
      onIssue: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_ALREADY_ISSUED",
              message: "This RFI already has an official issuance.",
              requestId: "req-already",
            },
          },
          { status: 409 },
        ),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(
      await screen.findByRole("link", {
        name: "Download the official PDF RFI-014.pdf",
      }),
    ).toBeInTheDocument();
  });

  it("offers no blind retry when reconciliation is required", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_ARTIFACT_RECONCILIATION_REQUIRED",
              message:
                "The issuance outcome is uncertain and its artifact requires reconciliation.",
              requestId: "req-reconcile",
            },
          },
          { status: 500 },
        ),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(dialog().textContent).toContain("support reconciliation");
    });
    expect(dialog().textContent).toContain("req-reconcile");
    expect(dialog().textContent).toContain(
      "Do not try to issue this RFI again",
    );
    for (const label of [
      "Issue official RFI",
      "Retry issue",
      "Check issue status",
    ]) {
      expect(
        within(dialog()).queryByRole("button", { name: label }),
      ).toBeNull();
    }
    // The operator can leave and come back.
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("keeps a definitive validation error inside the workflow", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_ISSUE_VALIDATION_FAILED",
              message: "Every routing contact must be active on this project.",
              requestId: "req-validation",
            },
          },
          { status: 422 },
        ),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(dialog().textContent).toContain(
        "Every routing contact must be active on this project.",
      );
    });
    expect(dialog().textContent).toContain("req-validation");
    // Still open, still editable, and the next attempt is a fresh one.
    expect(
      within(dialog()).getByRole("button", { name: "Back" }),
    ).not.toBeDisabled();
  });

  it("removes the action after a permission loss is confirmed by refetch", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      rfiResponses: [
        jsonResponse({ data: ready() }),
        jsonResponse({
          data: ready({ capabilities: { issue: false, returnToDraft: false } }),
        }),
      ],
      onIssue: () =>
        jsonResponse(
          {
            error: {
              code: "AUTHORIZATION_DENIED",
              message: "You are not allowed to access this resource.",
              requestId: "req-denied",
            },
          },
          { status: 403 },
        ),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(dialog().textContent).toContain("req-denied");
    });
    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Issue RFI" })).toBeNull();
    });
  });

  it("never reports success or failure it cannot prove", async () => {
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () => Promise.reject(new Error("timeout")),
    });
    const view = render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await waitFor(() => {
      expect(dialog().textContent).toContain(
        "The result of this issue attempt is unknown.",
      );
    });
    expect(view.announcements).not.toContain(
      "This RFI was officially issued as RFI-014.",
    );
    expect(dialog().textContent).not.toContain("could not be issued");
    expect(document.body.textContent).not.toMatch(/RFI-\d/);
  });
});

describe("Issue dialog — accessibility", () => {
  it("labels the dialog, its fields, and its errors", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    const node = await openIssueDialog();

    expect(node.getAttribute("aria-labelledby")).not.toBeNull();
    expect(node.getAttribute("aria-describedby")).not.toBeNull();
    expect(
      within(node).getByText("Issue this RFI officially"),
    ).toBeInTheDocument();
    expect(within(node).getByLabelText(/Response due/)).toBeInTheDocument();
    const to = node.querySelector("[data-issue-recipients]") as HTMLElement;
    expect(
      within(to).getByRole("checkbox", { name: /Alex Architect — Meridian/ }),
    ).toBeInTheDocument();
    expect(
      within(node).getByRole("checkbox", { name: /ceiling-sketch\.pdf/ }),
    ).toBeInTheDocument();
    // Each group states its own purpose rather than relying on position.
    expect(to.querySelector("legend")?.textContent).toBe("To");
    expect(node.querySelector("[data-issue-cc] legend")?.textContent).toBe(
      "CC (optional)",
    );
  });

  it("places initial focus on the first recipient", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    const node = await openIssueDialog();

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(
          node.querySelector("[data-issue-recipients]") as HTMLElement,
        ).getAllByRole("checkbox")[0],
      );
    });
  });

  it("returns focus to the Issue RFI trigger after ordinary dismissal", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await openIssueDialog();

    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Issue RFI" }),
      );
    });
  });

  it("refuses dismissal while a request is genuinely in flight", async () => {
    const gate = deferred();
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        gate.promise.then(() => jsonResponse({ data: officialIssueResult() })),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeNull();
    expect(
      within(dialog()).getByRole("button", { name: "Close dialog" }),
    ).toBeDisabled();
    gate.resolve();
  });

  it("announces the pending state as text", async () => {
    const gate = deferred();
    installWorkspaceFetch({
      rfi: ready(),
      onIssue: () =>
        gate.promise.then(() => jsonResponse({ data: officialIssueResult() })),
    });
    render();
    await openIssueDialog();
    await continueToReview();
    await submitIssue();

    const pending = dialog().querySelector("[data-issue-pending]");
    expect(pending?.getAttribute("role")).toBe("status");
    expect(pending?.textContent).toBe("Issuing RFI…");
    gate.resolve();
  });
});
