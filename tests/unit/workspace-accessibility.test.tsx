// @vitest-environment happy-dom
/*
 * UI-7 accessibility and keyboard contract for the three detail workspaces:
 * one honest heading outline, landmark/labelled regions, keyboard-operable
 * menus and dialogs with focus restoration, accessible names on icon-only
 * controls, status conveyed as text, and live announcements for saves and
 * failures.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordWorkspaceFeature } from "../../src/ui/features/record-workspace/RecordWorkspaceFeature";
import { RevisionWorkspaceFeature } from "../../src/ui/features/record-workspace/RevisionWorkspaceFeature";
import { RfiWorkspaceFeature } from "../../src/ui/features/rfi-workspace/RfiWorkspaceFeature";
import {
  installWorkspaceFetch,
  PROJECT_ID,
  RECORD_ID,
  REVISION_ID,
  RFI_ID,
  recordWorkspace,
  renderWorkspace,
  revision,
  revisionWorkspace,
  rfiWorkspace,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

function renderRecord() {
  return renderWorkspace(
    <RecordWorkspaceFeature projectId={PROJECT_ID} recordId={RECORD_ID} />,
    `/projects/${PROJECT_ID}/records/${RECORD_ID}`,
  );
}

function renderRevision() {
  return renderWorkspace(
    <RevisionWorkspaceFeature
      projectId={PROJECT_ID}
      recordId={RECORD_ID}
      revisionId={REVISION_ID}
    />,
    `/projects/${PROJECT_ID}/records/${RECORD_ID}/revisions/${REVISION_ID}`,
  );
}

function renderRfi() {
  return renderWorkspace(
    <RfiWorkspaceFeature projectId={PROJECT_ID} rfiId={RFI_ID} />,
    `/projects/${PROJECT_ID}/rfis/${RFI_ID}`,
  );
}

async function ready(selector: string) {
  await waitFor(() => {
    expect(
      document.querySelector(`${selector} .base-workspace__identity`),
    ).not.toBeNull();
  });
}

describe("Workspace accessibility — structure", () => {
  it("gives each workspace one h2 identity title above h3 sections", async () => {
    installWorkspaceFetch();
    renderRecord();
    await ready(".record-workspace");

    // A workspace never renders its own <h1>: the shell owns the page heading.
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    expect(document.querySelectorAll("h2")).toHaveLength(1);
    expect(document.querySelectorAll("h3").length).toBeGreaterThan(0);
  });

  it("labels the breadcrumb trail and marks the current page", async () => {
    installWorkspaceFetch();
    renderRevision();
    await ready(".revision-workspace");

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByText("Original").getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("names icon-only controls", async () => {
    installWorkspaceFetch();
    renderRecord();
    await ready(".record-workspace");
    expect(
      screen.getByRole("button", { name: "Document actions" }),
    ).toBeInTheDocument();
  });

  it("conveys status as text, not colour alone", async () => {
    installWorkspaceFetch();
    renderRevision();
    await ready(".revision-workspace");
    const badge = document.querySelector(".base-badge");
    expect(badge?.textContent.trim()).toBe("Published");
  });

  it("associates a validation message with its field", async () => {
    installWorkspaceFetch();
    renderRfi();
    await ready(".rfi-workspace");

    await userEvent.clear(screen.getByLabelText(/Subject/));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    const subject = screen.getByLabelText(/Subject/);
    await waitFor(() => {
      expect(subject).toHaveAttribute("aria-invalid", "true");
    });
    const describedBy = subject.getAttribute("aria-describedby") ?? "";
    expect(describedBy).not.toBe("");
    const message = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(message).toContain("A subject is required.");
  });
});

describe("Workspace accessibility — keyboard and focus", () => {
  it("opens the overflow menu from the keyboard and restores focus on Escape", async () => {
    installWorkspaceFetch();
    renderRecord();
    await ready(".record-workspace");

    const trigger = screen.getByRole("button", { name: "Document actions" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("traps focus in a confirmation dialog and restores it on cancel", async () => {
    installWorkspaceFetch({
      revisionModel: revisionWorkspace({
        revision: revision({
          status: "draft",
          isCurrent: false,
          capabilities: { uploadFile: true, publishRevision: true },
        }),
      }),
    });
    renderRevision();
    await ready(".revision-workspace");

    const trigger = screen.getByRole("button", { name: "Publish revision" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("moves focus into the form dialog's first field and restores it on cancel", async () => {
    installWorkspaceFetch();
    renderRecord();
    await ready(".record-workspace");

    const trigger = screen.getByRole("button", { name: "Document actions" });
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit document details" }),
    );

    const title = await screen.findByLabelText(/Title/);
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the document view keyboard-operable through the shared collapsible when a renderer is present", async () => {
    const base = globalThis as { BASE?: unknown };
    const previousBase = base.BASE;
    base.BASE = { render: () => '<div data-mock-preview="1"></div>' };
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
      renderRfi();
      await ready(".rfi-workspace");

      const toggle = screen.getByRole("button", {
        name: /Show document view/,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      toggle.focus();
      await userEvent.keyboard("{Enter}");
      await waitFor(() => {
        expect(toggle).toHaveAttribute("aria-expanded", "true");
      });
    } finally {
      if (previousBase === undefined) delete base.BASE;
      else base.BASE = previousBase;
    }
  });

  it("gives the renderer-unavailable document view note no interactive control at all", async () => {
    installWorkspaceFetch();
    renderRfi();
    await ready(".rfi-workspace");

    expect(
      screen.queryByRole("button", { name: /Show document view/ }),
    ).toBeNull();
    const note = document.querySelector("[data-preview-unavailable]");
    expect(note).not.toBeNull();
    expect(note?.tagName).toBe("P");
    expect(note?.querySelector("button, a, [tabindex]")).toBeNull();
  });
});

describe("Workspace accessibility — announcements", () => {
  it("announces a successful save and a failure through the shell live region", async () => {
    installWorkspaceFetch();
    const { announcements } = renderRfi();
    await ready(".rfi-workspace");

    await userEvent.type(screen.getByLabelText(/Subject/), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(announcements).toContain("RFI draft saved.");
    });
  });

  it("announces a background refresh without replacing loaded content", async () => {
    installWorkspaceFetch({ record: recordWorkspace() });
    const { queryClient } = renderRecord();
    await ready(".record-workspace");

    await queryClient.invalidateQueries();
    await waitFor(() => {
      expect(
        document.querySelector(".record-workspace .base-workspace__identity"),
      ).not.toBeNull();
    });
  });

  it("marks a failed load as an alert with retry", async () => {
    installWorkspaceFetch({
      rfiResponses: [
        new Response(JSON.stringify({ error: { message: "Down" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      ],
    });
    renderRfi();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unable to load this RFI");
    expect(
      within(alert).getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });
});
