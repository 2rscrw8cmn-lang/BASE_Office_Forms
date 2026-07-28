// @vitest-environment happy-dom
/*
 * The evidence an issued RFI leaves behind, and where the register picks it up.
 *
 * The immutable `officialIssue` projection is presented as evidence and never as
 * authority: current status and current actions keep coming from top-level
 * `rfi.status` and `capabilities`, even when the two disagree. The official PDF
 * is reached through the authenticated attachment route, never a storage key.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RfiWorkspaceFeature } from "../../src/ui/features/rfi-workspace/RfiWorkspaceFeature";
import { RfiRegisterFeature } from "../../src/ui/features/rfis/RfiRegisterFeature";
import { isPlainLeftClick } from "../../src/ui/components/util/isPlainLeftClick";
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
  type RfiWorkspaceOverrides,
} from "../helpers/workspace-harness";

const originalFetch = globalThis.fetch;
const PATH = `/projects/${PROJECT_ID}/rfis/${RFI_ID}`;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.pushState({}, "", "/");
});

function issued(overrides: RfiWorkspaceOverrides = {}) {
  return rfiWorkspace({
    officialIssue: officialIssueSummary(),
    ...overrides,
    rfi: {
      status: "open",
      rfiNumber: "RFI-014",
      issuedAt: "2026-07-25T09:00:00Z",
      ...overrides.rfi,
    },
    currentVersion: {
      id: "rfi-draft-1",
      label: "Original Issue",
      status: "published",
    },
    capabilities: {
      updateDraft: false,
      uploadAttachment: false,
      markReady: false,
      returnToDraft: false,
      issue: false,
      recordResponse: true,
      ...overrides.capabilities,
    },
  });
}

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

function evidence(): HTMLElement {
  const node = root().querySelector(".rfi-workspace-original-issue");
  if (node === null) throw new Error("Expected the original issue section.");
  return node as HTMLElement;
}

describe("Issued RFI — original issue evidence", () => {
  it("presents the official PDF as the clearest action, through the authenticated route", async () => {
    installWorkspaceFetch({ rfi: issued() });
    render();
    await waitForWorkspace();

    const link = within(evidence()).getByRole("link", {
      name: "Download the official PDF RFI-014.pdf",
    });
    expect(link.getAttribute("href")).toBe(
      `/api/v2/projects/${PROJECT_ID}/rfis/${RFI_ID}/attachments/official-rfi-pdf/content`,
    );
    // Never an R2 key or a permanent public URL.
    expect(evidence().innerHTML).not.toContain("organizations/");
    expect(evidence().innerHTML).not.toContain("r2.");
    expect(evidence().textContent).not.toContain("a".repeat(64));
  });

  it("shows the issued version, issuance, dates, and routing snapshots", async () => {
    installWorkspaceFetch({
      rfi: issued({
        officialIssue: officialIssueSummary({
          recipients: {
            to: [
              {
                projectContactId: "contact-1",
                contactName: "Alex Architect",
                companyName: "Meridian",
                email: "alex@example.com",
              },
            ],
            cc: [
              {
                projectContactId: "contact-2",
                contactName: "Sam Engineer",
                companyName: null,
                email: null,
              },
            ],
          },
        }),
      }),
    });
    render();
    await waitForWorkspace();

    expect(evidence().textContent).toContain("Original Issue");
    expect(evidence().textContent).toContain("ISS-014");
    expect(evidence().textContent).toContain("July 25, 2026");
    expect(evidence().textContent).toContain("2026-08-05");
    expect(evidence().querySelector("[data-issued-to]")?.textContent).toBe(
      "Alex Architect — Meridian",
    );
    expect(evidence().querySelector("[data-issued-cc]")?.textContent).toBe(
      "Sam Engineer",
    );
  });

  it("labels included files by role and separates them from the generated artifact", async () => {
    installWorkspaceFetch({
      rfi: issued({
        officialIssue: officialIssueSummary({
          includedFiles: [
            {
              fileId: "attachment-1",
              role: "supporting_attachment",
              originalFilename: "ceiling-sketch.pdf",
              mediaType: "application/pdf",
              byteSize: 812_000,
              sha256: "b".repeat(64),
            },
            {
              fileId: "attachment-2",
              role: "reference_drawing",
              originalFilename: "A2-11.pdf",
              mediaType: "application/pdf",
              byteSize: 1_450_000,
              sha256: "c".repeat(64),
            },
          ],
        }),
      }),
    });
    render();
    await waitForWorkspace();

    const included = evidence().querySelector("[data-issued-files]");
    expect(included?.textContent).toContain(
      "Files included with the original issue",
    );
    expect(included?.textContent).toContain("ceiling-sketch.pdf");
    expect(included?.textContent).toContain("Supporting attachment · 793.0 KB");
    expect(included?.textContent).toContain("Reference drawing · 1.4 MB");
    // The generated artifact keeps its own block, above the included list.
    const artifact = evidence().querySelector("[data-official-artifact]");
    expect(artifact?.textContent).toContain(
      "Official RFI PDF generated at issue",
    );
    expect(artifact?.textContent).toContain("RFI-014.pdf");
    expect(included?.textContent).not.toContain("RFI-014.pdf");
  });

  it("says plainly when no files were included", async () => {
    installWorkspaceFetch({
      rfi: issued({
        officialIssue: officialIssueSummary({ includedFiles: [] }),
      }),
    });
    render();
    await waitForWorkspace();
    expect(evidence().textContent).toContain(
      "No files were included with the original issue.",
    );
  });

  it("survives a reload of the workspace route", async () => {
    installWorkspaceFetch({ rfi: issued() });
    const first = render();
    await waitForWorkspace();
    expect(evidence()).toBeTruthy();

    first.unmount();
    cleanup();
    render();
    await waitForWorkspace();
    expect(evidence().textContent).toContain("ISS-014");
    expect(
      within(evidence()).getByRole("link", {
        name: "Download the official PDF RFI-014.pdf",
      }),
    ).toBeInTheDocument();
  });
});

describe("Issued RFI — evidence is never current authority", () => {
  it("reads status and the metadata rail from the top-level RFI, not the snapshot", async () => {
    installWorkspaceFetch({
      rfi: issued({
        rfi: { status: "closed", closedAt: "2026-08-10T09:00:00Z" },
        capabilities: { recordResponse: false, reopen: true },
      }),
    });
    render();
    await waitForWorkspace();

    // Number and current status live once, in the identity header.
    const identity = root().querySelector(".base-workspace__identity");
    expect(identity?.textContent).toContain("RFI-014");
    expect(identity?.textContent).toContain("Closed");

    // The rail carries the remaining current facts, each exactly once.
    const rail = root().querySelector(".base-workspace__metadata");
    expect(rail?.textContent).toContain("Alex Architect");
    expect(rail?.textContent).toContain("Original Issue");
    expect(rail?.textContent).toContain("July 25, 2026");
    expect(rail?.textContent).toContain("Response due");
    expect(rail?.textContent).toContain("Updated");
    expect(rail?.textContent).not.toContain("RFI-014");

    // …and the immutable snapshot stays in its own section.
    expect(evidence().textContent).toContain("ISS-014");
  });

  it("offers only the actions the server currently authorizes", async () => {
    installWorkspaceFetch({
      rfi: issued({
        rfi: { status: "closed" },
        capabilities: { recordResponse: false, reopen: true, void: false },
      }),
    });
    render();
    await waitForWorkspace();

    // The presence of officialIssue never re-enables issue or return-to-draft.
    expect(root().querySelector("[data-issue-rfi]")).toBeNull();
    expect(root().querySelector("[data-mark-ready]")).toBeNull();
    expect(
      root().querySelector('[data-transition="return-to-draft"]'),
    ).toBeNull();
    expect(root().querySelector("[data-primary-action]")?.textContent).toBe(
      "Reopen RFI",
    );
  });

  it("keeps heading hierarchy correct with the evidence section present", async () => {
    installWorkspaceFetch({ rfi: issued() });
    render();
    await waitForWorkspace();

    expect(
      within(root()).getByRole("heading", { level: 3, name: "Original issue" }),
    ).toBeInTheDocument();
    expect(root().querySelectorAll("h1")).toHaveLength(0);
    const levels = [...root().querySelectorAll("h2, h3, h4")].map((node) =>
      Number(node.tagName.slice(1)),
    );
    expect(levels[0]).toBe(2);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("leaves modifier-clicks on the official PDF to the browser", async () => {
    installWorkspaceFetch({ rfi: issued() });
    render();
    await waitForWorkspace();

    const link = within(evidence()).getByRole("link", {
      name: "Download the official PDF RFI-014.pdf",
    });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    // A real anchor, so the shared plain-left-click rule still classifies a
    // ctrl/meta/middle click as the browser's to handle.
    const click = (overrides: Record<string, unknown>) =>
      isPlainLeftClick({
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...overrides,
      } as Parameters<typeof isPlainLeftClick>[0]);
    expect(click({ metaKey: true })).toBe(false);
    expect(click({ button: 1 })).toBe(false);
    expect(click({})).toBe(true);
  });

  it("wraps long filenames, companies, and subjects without breaking the rail", async () => {
    const longName = `${"coordination-".repeat(12)}sketch.pdf`;
    installWorkspaceFetch({
      rfi: issued({
        rfi: {
          subject: `Resolve ${"conflicting ceiling height and duct clearance ".repeat(6)}requirements`,
        },
        attachments: {
          supporting_attachment: [
            attachment({
              originalFilename: longName,
              revisionId: "rfi-draft-1",
            }),
          ],
          reference_drawing: [],
        },
        officialIssue: officialIssueSummary({
          includedFiles: [
            {
              fileId: "attachment-1",
              role: "supporting_attachment",
              originalFilename: longName,
              mediaType: "application/pdf",
              byteSize: 4096,
              sha256: "b".repeat(64),
            },
          ],
          recipients: {
            to: [
              {
                projectContactId: "contact-1",
                contactName: "Alexandra Montgomery-Whitfield",
                companyName:
                  "Meridian Design Group and Associated Consulting Engineers LLP",
                email: null,
              },
            ],
            cc: [],
          },
        }),
      }),
    });
    render();
    await waitForWorkspace();

    expect(evidence().textContent).toContain(longName);
    expect(evidence().querySelector("[data-issued-to]")?.textContent).toContain(
      "Associated Consulting Engineers LLP",
    );
    // Long values live in wrapping containers, not fixed-width ones.
    expect(
      evidence().querySelector(".rfi-workspace-included__name"),
    ).not.toBeNull();
  });
});

/* ------------------------------------------------------- register integration */

function registerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RFI_ID,
    rfiNumber: null,
    legacyReference: null,
    status: "ready_to_issue",
    subject: "Relocate ceiling diffuser above conference room",
    question: "Coordinate the revised diffuser location with S-201.",
    contractorSuggestion: null,
    drawingReferences: "A2.11",
    specificationReferences: null,
    responsiblePartyId: "contact-1",
    responsibleParty: "Alex Architect",
    responsiblePartyLegacyText: null,
    submittedBy: null,
    requestedResponseDate: "2026-08-05",
    issuedAt: null,
    responseReceivedAt: null,
    latestResponse: null,
    attachmentCount: 1,
    isOverdue: false,
    dueSoon: false,
    lockVersion: 1,
    draftRevisionId: "rfi-draft-1",
    issuanceReconciliationState: "not_issued",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-20T09:00:00Z",
    capabilities: { updateDraft: false },
    ...overrides,
  };
}

describe("Issued RFI — register integration", () => {
  it("shows the server-assigned number and Open status without a manual refresh", async () => {
    const readyModel = rfiWorkspace({
      rfi: { status: "ready_to_issue" },
      capabilities: { updateDraft: false, issue: true, returnToDraft: true },
    });
    let issueCommitted = false;

    globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (/\/rfis\/[^/?]+\/issue$/.test(url) && method === "POST") {
        issueCommitted = true;
        return Promise.resolve(jsonResponse({ data: officialIssueResult() }));
      }
      if (/\/rfis\/[^/?]+\/workspace$/.test(url)) {
        return Promise.resolve(
          jsonResponse({ data: issueCommitted ? issued() : readyModel }),
        );
      }
      if (/\/rfis(\?|$)/.test(url) && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: {
              project: {
                id: PROJECT_ID,
                projectNumber: "24-001",
                name: "Riverside Tower",
                status: "active",
              },
              responsibleContacts: [
                {
                  id: "contact-1",
                  name: "Alex Architect",
                  companyName: "Meridian",
                },
              ],
              rfis: [
                issueCommitted
                  ? registerRow({
                      rfiNumber: "RFI-014",
                      status: "open",
                      issuedAt: "2026-07-25T09:00:00Z",
                      updatedAt: "2026-07-25T09:00:00Z",
                    })
                  : registerRow(),
              ],
              capabilities: { createRfi: true },
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };

    const view = renderWorkspace(
      <>
        <RfiWorkspaceFeature projectId={PROJECT_ID} rfiId={RFI_ID} />
        <RfiRegisterFeature projectId={PROJECT_ID} />
      </>,
      `/projects/${PROJECT_ID}/rfis?q=diffuser&sort=due&direction=desc`,
    );

    await waitForWorkspace();
    const register = document.querySelector(".rfi-register-page");
    await waitFor(() => {
      expect(register?.textContent).toContain("Draft");
    });

    await userEvent.click(screen.getByRole("button", { name: "Issue RFI" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Continue to review",
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Issue official RFI",
      }),
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain("RFI-014");
    });
    // The register re-read the server on its own.
    await waitFor(() => {
      expect(register?.textContent).toContain("RFI-014");
    });
    expect(register?.textContent).toContain("Open");
    expect(register?.textContent).toContain("Alex Architect");
    expect(view.announcements).toContain(
      "This RFI was officially issued as RFI-014.",
    );
    // The workflow never navigated away, so search/filter/sort URL state stands.
    expect(view.navigations).toHaveLength(0);
    expect(window.location.search).toBe("?q=diffuser&sort=due&direction=desc");
  });
});
