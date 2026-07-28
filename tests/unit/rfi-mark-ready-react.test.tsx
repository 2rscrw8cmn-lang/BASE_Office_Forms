// @vitest-environment happy-dom
/*
 * Slice 2B mark-ready: the capability gate, the two lifecycle labels a draft
 * can carry, the save-before-ready sequence, and every way that sequence can
 * stop safely. Nothing here infers eligibility from a role string or a local
 * status guess -- the server's top-level status and capabilities decide.
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
import { rfiWorkspaceQueryKey } from "../../src/ui/features/rfi-workspace/useRfiWorkspace";
import {
  installWorkspaceFetch,
  jsonResponse,
  PROJECT_ID,
  renderWorkspace,
  RFI_ID,
  rfiWorkspace,
  type RfiWorkspaceOverrides,
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

function draft(overrides: RfiWorkspaceOverrides = {}) {
  return rfiWorkspace({
    ...overrides,
    rfi: { status: "draft", ...overrides.rfi },
    capabilities: {
      updateDraft: true,
      markReady: true,
      ...overrides.capabilities,
    },
  });
}

function ready(overrides: RfiWorkspaceOverrides = {}) {
  return rfiWorkspace({
    ...overrides,
    rfi: { status: "ready_to_issue", ...overrides.rfi },
    currentVersion: {
      id: "rfi-draft-1",
      label: "Current Draft",
      status: "draft",
    },
    capabilities: {
      updateDraft: false,
      uploadAttachment: true,
      markReady: false,
      returnToDraft: true,
      issue: true,
      ...overrides.capabilities,
    },
  });
}

function primaryAction(): HTMLElement {
  const node = root().querySelector("[data-primary-action]");
  if (node === null) throw new Error("Expected a primary action.");
  return node as HTMLElement;
}

async function type(field: string, value: string) {
  const input = root().querySelector<HTMLInputElement>(
    `[data-rfi-field="${field}"]`,
  );
  if (!input) throw new Error(`Expected the ${field} field.`);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

describe("RFI workspace — mark ready capability gate", () => {
  it("offers Mark ready only when the server says so", async () => {
    installWorkspaceFetch({
      rfi: draft({ capabilities: { markReady: false } }),
    });
    render();
    await waitForWorkspace();
    expect(root().querySelector("[data-mark-ready]")).toBeNull();
  });

  it("shows Mark ready for a clean draft", async () => {
    installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    const action = primaryAction();
    expect(action.getAttribute("data-mark-ready")).not.toBeNull();
    expect(action.textContent).toBe("Mark ready");
  });

  it("switches to Save and mark ready as soon as the draft is dirty", async () => {
    installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await type("subject", "Revised ceiling coordination question");
    await waitFor(() => {
      expect(primaryAction().textContent).toBe("Save and mark ready");
    });
  });

  it("shows no lifecycle actions at all to a user without capabilities", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: { status: "draft" },
        capabilities: {
          updateDraft: false,
          uploadAttachment: false,
          markReady: false,
          returnToDraft: false,
          issue: false,
          void: false,
        },
      }),
    });
    render();
    await waitForWorkspace();

    expect(root().querySelector("[data-primary-action]")).toBeNull();
    expect(root().querySelector("[data-rfi-actions]")).toBeNull();
  });
});

describe("RFI workspace — mark ready confirmation", () => {
  it("explains the lock, the absent number, and the separate issue action", async () => {
    installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await userEvent.click(primaryAction());
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Mark this RFI ready to issue?"),
    ).toBeInTheDocument();
    expect(dialog.textContent).toContain("read-only");
    expect(dialog.textContent).toContain("No official number is assigned yet");
    expect(dialog.textContent).toContain("return it to draft");
    expect(dialog.textContent).toContain("separate, final action");
    expect(
      within(dialog).getByRole("button", { name: "Mark ready" }),
    ).toBeInTheDocument();
  });

  it("confirms with Save and mark ready when the draft has unsaved edits", async () => {
    installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await type("subject", "Changed subject");
    await userEvent.click(primaryAction());
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("button", { name: "Save and mark ready" }),
    ).toBeInTheDocument();
  });
});

describe("RFI workspace — save-and-ready sequence", () => {
  it("marks a clean draft ready without a save, and invalidates every affected read model", async () => {
    const { calls } = installWorkspaceFetch({ rfi: draft() });
    const view = render();
    await waitForWorkspace();

    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Mark ready",
      }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(true);
    });
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);

    await waitFor(() => {
      expect(view.wasInvalidated(projectOverviewQueryKey(PROJECT_ID))).toBe(
        true,
      );
    });
    expect(view.wasInvalidated(rfiWorkspaceQueryKey(PROJECT_ID, RFI_ID))).toBe(
      true,
    );
    expect(view.wasInvalidated(projectRfisQueryKey(PROJECT_ID))).toBe(true);
    expect(view.wasInvalidated(dashboardQueryKey())).toBe(true);
    expect(view.announcements).toContain("This RFI is ready to issue.");
  });

  it("saves the dirty draft with its lockVersion before calling ready", async () => {
    const { calls } = installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await type("subject", "Coordinate the revised soffit elevation");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(true);
    });
    const patch = calls.find((call) => call.method === "PATCH");
    const readyIndex = calls.findIndex((call) => call.url.endsWith("/ready"));
    const patchIndex = calls.findIndex((call) => call.method === "PATCH");
    expect(patch?.body?.subject).toBe(
      "Coordinate the revised soffit elevation",
    );
    expect(patch?.body?.lockVersion).toBe(1);
    expect(patchIndex).toBeLessThan(readyIndex);
  });

  it("re-reads the authoritative workspace between the save and the ready call", async () => {
    const { calls } = installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await type("subject", "Revised");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(true);
    });
    const patchIndex = calls.findIndex((call) => call.method === "PATCH");
    const readyIndex = calls.findIndex((call) => call.url.endsWith("/ready"));
    const reload = calls.findIndex(
      (call, index) =>
        index > patchIndex &&
        index < readyIndex &&
        call.method === "GET" &&
        call.url.endsWith("/workspace"),
    );
    expect(reload).toBeGreaterThan(patchIndex);
  });

  it("does not call ready when the save fails, and says the draft was not saved", async () => {
    const { calls } = installWorkspaceFetch({
      rfi: draft(),
      onPatchRfi: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_UNAVAILABLE",
              message: "The draft could not be saved.",
              requestId: "req-save",
            },
          },
          { status: 503 },
        ),
    });
    render();
    await waitForWorkspace();

    await type("subject", "Changed");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    await waitFor(() => {
      expect(
        within(root())
          .getAllByRole("alert")
          .some((node) =>
            node.textContent.includes("was not saved and was not marked ready"),
          ),
      ).toBe(true);
    });
    expect(
      within(root())
        .getAllByRole("alert")
        .some((node) => node.textContent.includes("req-save")),
    ).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(false);
    // The draft stays editable.
    expect(root().querySelector("[data-rfi-content-form]")).not.toBeNull();
  });

  it("stops before ready on a 409 save conflict and reloads the server values", async () => {
    const { calls } = installWorkspaceFetch({
      rfi: draft(),
      onPatchRfi: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_VERSION_CONFLICT",
              message: "This RFI was changed by someone else.",
              requestId: "req-conflict",
            },
          },
          { status: 409 },
        ),
    });
    const view = render();
    await waitForWorkspace();

    await type("subject", "Changed");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    await waitFor(() => {
      expect(
        within(root())
          .getAllByRole("alert")
          .some((node) => node.textContent.includes("changed elsewhere")),
      ).toBe(true);
    });
    expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(false);
    expect(view.announcements).toContain("This RFI changed elsewhere.");
    // The reload happened, so what is on screen is the server's state.
    expect(
      calls.filter(
        (call) => call.method === "GET" && call.url.endsWith("/workspace"),
      ).length,
    ).toBeGreaterThan(1);
  });

  it("keeps an incomplete draft editable when the server refuses ready", async () => {
    installWorkspaceFetch({
      rfi: draft(),
      onMarkReady: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_READY_VALIDATION_FAILED",
              message:
                "A responsible project contact is required before issue.",
              requestId: "req-ready",
            },
          },
          { status: 422 },
        ),
    });
    render();
    await waitForWorkspace();

    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Mark ready",
      }),
    );

    const alert = await within(root()).findByRole("alert");
    expect(alert.textContent).toContain(
      "A responsible project contact is required before issue.",
    );
    expect(alert.textContent).toContain("req-ready");
    expect(alert.textContent).toContain("still editable as a draft");
    expect(root().querySelector("[data-rfi-content-form]")).not.toBeNull();
  });

  it("says the draft was saved when only the ready call failed", async () => {
    installWorkspaceFetch({
      rfi: draft(),
      onMarkReady: () =>
        jsonResponse(
          {
            error: {
              code: "RFI_READY_VALIDATION_FAILED",
              message: "The bound template version is not published.",
              requestId: "req-ready",
            },
          },
          { status: 422 },
        ),
    });
    render();
    await waitForWorkspace();

    await type("subject", "Saved but not ready");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    const alert = await within(root()).findByRole("alert");
    expect(alert.textContent).toContain("Your changes were saved");
    expect(alert.textContent).toContain("was not marked ready");
  });

  it("stops on client-side validation without touching the server", async () => {
    const { calls } = installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await type("subject", "");
    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save and mark ready",
      }),
    );

    await waitFor(() => {
      expect(
        within(root())
          .getAllByRole("alert")
          .some((node) => node.textContent.includes("Complete the required")),
      ).toBe(true);
    });
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/ready"))).toBe(false);
  });

  it("never invents a local RFI number while marking ready", async () => {
    installWorkspaceFetch({ rfi: draft() });
    render();
    await waitForWorkspace();

    await userEvent.click(primaryAction());
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Mark ready",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(root().textContent).toContain("Unnumbered Draft");
    expect(root().textContent).not.toMatch(/RFI-\d/);
  });
});

describe("RFI workspace — ready to issue state", () => {
  it("makes Issue RFI the primary action and locks the content", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await waitForWorkspace();

    const action = primaryAction();
    expect(action.textContent).toBe("Issue RFI");
    expect(root().querySelector("[data-rfi-content-form]")).toBeNull();
    expect(root().textContent).toContain(
      "This RFI is ready to issue. Its content and routing are locked.",
    );
  });

  it("demotes Return to draft to the overflow menu", async () => {
    installWorkspaceFetch({ rfi: ready() });
    render();
    await waitForWorkspace();

    expect(primaryAction().textContent).not.toBe("Return to draft");
    await userEvent.click(screen.getByRole("button", { name: "RFI actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Return to draft" }),
    ).toBeInTheDocument();
  });

  it("returns to draft from the overflow and refreshes the register", async () => {
    const { calls } = installWorkspaceFetch({ rfi: ready() });
    const view = render();
    await waitForWorkspace();

    await userEvent.click(screen.getByRole("button", { name: "RFI actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Return to draft" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "does not undo or recover an official issue",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Return to draft" }),
    );

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith("/return-to-draft"))).toBe(
        true,
      );
    });
    expect(view.wasInvalidated(projectRfisQueryKey(PROJECT_ID))).toBe(true);
  });

  it("still promotes Return to draft when the server does not authorize issue", async () => {
    installWorkspaceFetch({
      rfi: ready({ capabilities: { issue: false } }),
    });
    render();
    await waitForWorkspace();

    expect(primaryAction().textContent).toBe("Return to draft");
    // …and never twice: it is not also in the overflow menu.
    await userEvent.click(screen.getByRole("button", { name: "RFI actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Return to draft" }),
    ).toBeNull();
  });

  it("offers no Return to draft once the RFI is numbered and issued", async () => {
    installWorkspaceFetch({
      rfi: rfiWorkspace({
        rfi: {
          status: "open",
          rfiNumber: "RFI-014",
          issuedAt: "2026-07-25T09:00:00Z",
        },
        capabilities: {
          updateDraft: false,
          markReady: false,
          returnToDraft: false,
          issue: false,
          recordResponse: true,
        },
      }),
    });
    render();
    await waitForWorkspace();

    expect(
      root().querySelector('[data-transition="return-to-draft"]'),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "RFI actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Return to draft" }),
    ).toBeNull();
  });
});
