import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createRfiWorkspaceView } from "../../public/rfi-workspace-view.js";
import { createRfisView } from "../../public/rfis-view.js";

const views: Array<{ destroy(): void }> = [];

afterEach(() => {
  views.splice(0).forEach((view) => {
    view.destroy();
  });
  Reflect.deleteProperty(globalThis, "BASE");
  Reflect.deleteProperty(globalThis, "document");
});

const contact = {
  id: "contact-1",
  name: "Alex Architect",
  companyName: "Design Co",
};

function rfi(overrides: Record<string, unknown> = {}) {
  return {
    id: "rfi-1",
    projectId: "project-1",
    rfiNumber: null,
    status: "draft",
    subject: "Door clearance",
    question: "Confirm the clear opening.",
    contractorSuggestion: "Use the alternate frame.",
    drawingReferences: "A-501",
    specificationReferences: "08 11 13",
    responsiblePartyId: contact.id,
    responsibleParty: contact.name,
    responsiblePartyLegacyText: null,
    requestedResponseDate: "2026-07-30",
    issuedAt: null,
    updatedAt: "2026-07-22T12:00:00Z",
    createdAt: "2026-07-20T12:00:00Z",
    lockVersion: 1,
    latestResponse: null,
    attachmentCount: 0,
    isOverdue: false,
    dueSoon: true,
    issuanceReconciliationState: "not_issued",
    capabilities: { updateDraft: true },
    ...overrides,
  };
}

function fire(target: unknown, type: string) {
  const element = target as {
    ownerDocument: { defaultView: unknown };
    dispatchEvent(event: Event): boolean;
  };
  const view = element.ownerDocument.defaultView as { Event: typeof Event };
  const event = new view.Event(type, { bubbles: true, cancelable: true });
  if (type === "click") Object.defineProperty(event, "button", { value: 0 });
  element.dispatchEvent(event);
}

function key(target: unknown, value: string, shiftKey = false) {
  const element = target as {
    ownerDocument: { defaultView: unknown };
    dispatchEvent(event: KeyboardEvent): boolean;
  };
  const view = element.ownerDocument.defaultView as {
    KeyboardEvent: typeof KeyboardEvent;
  };
  element.dispatchEvent(
    new view.KeyboardEvent("keydown", {
      key: value,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function settle(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function element(
  root: { querySelector(selector: string): unknown },
  selector: string,
): HTMLElement {
  const found = root.querySelector(selector) as HTMLElement | null;
  if (!found) throw new Error(`Expected ${selector}`);
  return found;
}

function mountRegister(
  options: {
    rows?: ReturnType<typeof rfi>[];
    update?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    reloadRows?: ReturnType<typeof rfi>[];
  } = {},
) {
  const window = new Window({
    url: "https://base.test/projects/project-1/rfis",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<main id="root"></main>';
  const root = element(document, "#root");
  const rows = options.rows ?? [
    rfi(),
    rfi({
      id: "rfi-locked",
      status: "open",
      rfiNumber: "RFI-004",
      capabilities: { updateDraft: false },
    }),
  ];
  let reads = 0;
  const api = {
    getProjectRfis: vi.fn(() =>
      Promise.resolve({
        data: {
          project: { id: "project-1", name: "Library", projectNumber: "P-001" },
          rfis: reads++ > 0 && options.reloadRows ? options.reloadRows : rows,
          responsibleContacts: [contact],
          capabilities: { createRfi: true },
        },
      }),
    ),
    updateRfi:
      options.update ??
      vi.fn((_projectId: string, id: string, values: Record<string, unknown>) =>
        Promise.resolve({
          data: {
            ...rows.find((item) => item.id === id),
            ...values,
            lockVersion: 2,
          },
        }),
      ),
    createRfi:
      options.create ??
      vi.fn(() =>
        Promise.resolve({
          data: rfi({ id: "rfi-new", subject: "Untitled RFI" }),
        }),
      ),
  };
  const navigate = vi.fn();
  const announce = vi.fn();
  const holder: { current?: ReturnType<typeof createRfisView> } = {};
  const render = () => {
    holder.current?.mount(root);
  };
  const view = createRfisView({
    api,
    navigate,
    announce,
    requestRender: render,
    projectId: "project-1",
  });
  holder.current = view;
  views.push(view);
  return { window, document, root, api, navigate, announce, view };
}

describe("RFI spreadsheet register", () => {
  it("edits draft cells with keyboard commits, cancellation, validation, and locked rows", async () => {
    const harness = mountRegister();
    await harness.view.reload();

    // Subject: the explicit "Edit subject" trigger begins editing (it is a
    // link by default, not a click-to-select cell); Enter commits.
    fire(
      element(harness.root, '[data-edit-subject][data-id="rfi-1"]'),
      "click",
    );
    const editor = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    editor.value = "Updated clearance";
    key(editor, "Enter");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledWith("project-1", "rfi-1", {
      subject: "Updated clearance",
      lockVersion: 1,
    });
    expect(harness.root.textContent).toContain("Updated clearance");

    // Secondary field (question): Escape cancels an in-progress edit.
    fire(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-1"]'),
      "click",
    );
    key(element(harness.root, '[data-id="rfi-1"][data-field="question"]'), "x");
    const question = element(
      harness.root,
      '[data-field="question"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    expect(question.value).toBe("x");
    key(question, "Escape");
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(1);

    // Responsible -> Due: Tab commits and moves selection to the next
    // direct-editable grid cell.
    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="responsiblePartyId"]',
      ),
      "Enter",
    );
    const respEditor = element(
      harness.root,
      '[data-field="responsiblePartyId"] [data-cell-editor]',
    ) as unknown as HTMLSelectElement;
    respEditor.value = "";
    key(respEditor, "Tab");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(2);
    expect(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="requestedResponseDate"]',
      ).classList.contains("is-selected"),
    ).toBe(true);

    // Subject validation: required field blocks an empty commit.
    fire(
      element(harness.root, '[data-edit-subject][data-id="rfi-1"]'),
      "click",
    );
    const empty = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    empty.value = "";
    key(empty, "Enter");
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(2);
    expect(
      element(harness.root, '[data-field="subject"] [role="alert"]')
        .textContent,
    ).toContain("required");
    key(empty, "Escape");

    const lockedRow = element(harness.root, '[data-rfi-row="rfi-locked"]');
    expect(lockedRow.querySelector("[data-edit-subject]")).toBeNull();
    const locked = element(lockedRow, '[data-field="responsiblePartyId"]');
    expect(locked.getAttribute("tabindex")).toBe("-1");
    key(locked, "Enter");
    expect(locked.querySelector("[data-cell-editor]")).toBeNull();
  });

  it("preserves filter URL state, keeps cell clicks inert, and opens only explicit links", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const status = element(
      harness.root,
      "#rfi-status",
    ) as unknown as HTMLSelectElement;
    status.value = "draft";
    fire(status, "change");
    expect(harness.window.location.search).toContain("status=draft");

    fire(
      element(harness.root, '[data-edit-subject][data-id="rfi-1"]'),
      "click",
    );
    const editor = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    editor.value = "Filtered edit";
    key(editor, "Enter");
    await settle();
    expect(harness.window.location.search).toContain("status=draft");

    fire(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="responsiblePartyId"]',
      ),
      "click",
    );
    expect(harness.navigate).not.toHaveBeenCalled();
    fire(
      element(harness.root, '[data-rfi-row="rfi-1"] .rfi-subject-link'),
      "click",
    );
    expect(harness.navigate).toHaveBeenCalledWith(
      "/projects/project-1/rfis/rfi-1",
    );

    fire(element(harness.root, ".rfi-heading [data-create-rfi]"), "click");
    await settle();
    expect(harness.api.createRfi).toHaveBeenCalledTimes(1);
    expect(
      element(
        harness.root,
        '[data-id="rfi-new"][data-field="subject"] [data-cell-editor]',
      ),
    ).toBeTruthy();
  });

  it("refreshes a conflicted row and leaves a visible retry state", async () => {
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    const update = vi.fn(async () => Promise.reject(conflict));
    const harness = mountRegister({
      update,
      reloadRows: [
        rfi({ subject: "Changed by another editor", lockVersion: 3 }),
      ],
    });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-edit-subject][data-id="rfi-1"]'),
      "click",
    );
    const editor = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    editor.value = "My stale change";
    key(editor, "Enter");
    await settle();
    expect(harness.api.getProjectRfis).toHaveBeenCalledTimes(2);
    expect(harness.root.textContent).toContain("Changed by another editor");
    expect(harness.root.textContent).toContain("Latest value loaded");
  });

  it("saves changed blur only and reports permission loss at the affected cell", async () => {
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        data: rfi({ question: "Changed on blur", lockVersion: 2 }),
      })
      .mockRejectedValueOnce(denied);
    const harness = mountRegister({ update });
    await harness.view.reload();

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="question"]'),
      "Enter",
    );
    let editor = element(
      harness.root,
      '[data-field="question"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    fire(editor, "blur");
    await settle();
    expect(update).not.toHaveBeenCalled();

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="question"]'),
      "Enter",
    );
    editor = element(
      harness.root,
      '[data-field="question"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    editor.value = "Changed on blur";
    fire(editor, "blur");
    await settle();
    expect(update).toHaveBeenCalledTimes(1);

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="question"]'),
      "Enter",
    );
    editor = element(
      harness.root,
      '[data-field="question"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    editor.value = "Denied change";
    key(editor, "Enter");
    await settle();
    expect(harness.root.textContent).toContain("permission to edit this draft");
  });
});

describe("RFI register visual refinement", () => {
  it("renders the five-column desktop hierarchy with identity, subject, responsible, due, and updated — no Action column", async () => {
    const harness = mountRegister({
      rows: [
        rfi({
          rfiNumber: "RFI-014",
          status: "open",
          subject: "Relocate existing VAV above conference room",
          question: "Coordinate revised ceiling elevation with MEP layout",
          drawingReferences: "A2.11",
          specificationReferences: "M3.02",
          responsibleParty: "Alex Architect",
          isOverdue: false,
          dueSoon: false,
          requestedResponseDate: "2099-01-01",
          capabilities: { updateDraft: false },
        }),
      ],
    });
    await harness.view.reload();

    const headers = [
      ...harness.root.querySelectorAll(".rfi-table thead th"),
    ].map((th) => th.textContent.trim());
    expect(headers).toEqual([
      "RFI ↑",
      "Subject",
      "Responsible",
      "Due",
      "Updated",
    ]);
    expect(harness.root.querySelector(".rfi-cell-action")).toBeNull();
    expect(harness.root.textContent).not.toContain("Open →");

    const row = element(harness.root, '[data-rfi-row="rfi-1"]');
    expect(row.querySelector(".rfi-id-number")?.textContent).toBe("RFI-014");
    expect(row.querySelector(".rfi-id-status")?.textContent).toBe("Open");
    const subjectCell = element(row, "[data-subject-cell]");
    expect(subjectCell.querySelector(".rfi-subject-link")?.textContent).toBe(
      "Relocate existing VAV above conference room",
    );
    expect(
      subjectCell.querySelector(".rfi-subject-secondary")?.textContent,
    ).toBe("Coordinate revised ceiling elevation with MEP layout");
    expect(subjectCell.querySelector(".rfi-subject-meta")?.textContent).toBe(
      "A2.11 · M3.02",
    );
    expect(
      element(row, '[data-field="responsiblePartyId"]').textContent,
    ).toContain("Alex Architect");
    expect(row.querySelector(".rfi-updated-text")).not.toBeNull();
  });

  it("shows Unnumbered Draft with a Draft status line for unissued rows", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const row = element(harness.root, '[data-rfi-row="rfi-1"]');
    expect(row.querySelector(".rfi-id-number")?.textContent).toBe("Unnumbered");
    expect(row.querySelector(".rfi-id-number")?.classList).toContain(
      "rfi-id-number-draft",
    );
    expect(row.querySelector(".rfi-id-status")?.textContent).toBe("Draft");
  });

  it("shows the responsible party's company as secondary text and Unassigned when none is set", async () => {
    const harness = mountRegister({
      rows: [
        rfi({ responsibleParty: "Alex Architect" }),
        rfi({
          id: "rfi-2",
          responsiblePartyId: null,
          responsibleParty: null,
        }),
      ],
    });
    await harness.view.reload();
    const withCompany = element(
      harness.root,
      '[data-id="rfi-1"][data-field="responsiblePartyId"]',
    );
    expect(withCompany.textContent).toContain("Alex Architect");
    expect(withCompany.textContent).toContain("Design Co");
    const unassigned = element(
      harness.root,
      '[data-id="rfi-2"][data-field="responsiblePartyId"]',
    );
    expect(unassigned.textContent).toContain("Unassigned");
  });

  it("shows server-flag-driven due urgency text without inventing its own overdue state", async () => {
    const harness = mountRegister({
      rows: [
        rfi({
          id: "rfi-overdue",
          requestedResponseDate: "2020-01-01",
          isOverdue: true,
          dueSoon: false,
        }),
        rfi({
          id: "rfi-soon",
          requestedResponseDate: "2099-01-05",
          isOverdue: false,
          dueSoon: true,
        }),
        rfi({
          id: "rfi-none",
          requestedResponseDate: null,
          isOverdue: false,
          dueSoon: false,
        }),
      ],
    });
    await harness.view.reload();
    const overdueText = element(
      harness.root,
      '[data-id="rfi-overdue"][data-field="requestedResponseDate"] .rfi-due-urgency',
    );
    expect(overdueText.textContent).toMatch(/^Overdue by \d+ days?$/);
    expect(overdueText.classList).toContain("is-overdue");
    const soonText = element(
      harness.root,
      '[data-id="rfi-soon"][data-field="requestedResponseDate"] .rfi-due-urgency',
    );
    expect(soonText.textContent).toMatch(/^Due (today|in \d+ days?)$/);
    expect(soonText.classList).toContain("is-due-soon");
    const noDate = element(
      harness.root,
      '[data-id="rfi-none"][data-field="requestedResponseDate"]',
    );
    expect(noDate.textContent).toContain("No due date");
  });

  it("keeps locked rows readable with no edit affordances, and only explicit links navigate", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const lockedRow = element(harness.root, '[data-rfi-row="rfi-locked"]');
    expect(lockedRow.classList).toContain("is-locked");
    expect(lockedRow.querySelector("[data-secondary-toggle]")).toBeNull();
    expect(lockedRow.querySelector("[data-edit-subject]")).toBeNull();
    expect(
      element(lockedRow, '[data-field="responsiblePartyId"]').getAttribute(
        "aria-readonly",
      ),
    ).toBe("true");

    fire(element(lockedRow, '[data-field="responsiblePartyId"]'), "click");
    expect(harness.navigate).not.toHaveBeenCalled();
    fire(element(lockedRow, ".rfi-subject-link"), "click");
    expect(harness.navigate).toHaveBeenCalledWith(
      "/projects/project-1/rfis/rfi-locked",
    );
  });

  it("directly edits Responsible party and Response due date from the register", async () => {
    const update = vi.fn(
      (_p: string, id: string, values: Record<string, unknown>) =>
        Promise.resolve({
          data: { ...rfi({ id }), ...values, lockVersion: 2 },
        }),
    );
    const harness = mountRegister({ update });
    await harness.view.reload();

    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="responsiblePartyId"]',
      ),
      "Enter",
    );
    const select = element(
      harness.root,
      '[data-field="responsiblePartyId"] [data-cell-editor]',
    ) as unknown as HTMLSelectElement;
    select.value = "";
    key(select, "Enter");
    await settle();
    expect(update).toHaveBeenCalledWith("project-1", "rfi-1", {
      responsiblePartyId: null,
      lockVersion: 1,
    });

    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="requestedResponseDate"]',
      ),
      "Enter",
    );
    const dateInput = element(
      harness.root,
      '[data-field="requestedResponseDate"] [data-cell-editor]',
    ) as HTMLInputElement;
    dateInput.value = "2026-08-15";
    key(dateInput, "Enter");
    await settle();
    expect(update).toHaveBeenCalledWith("project-1", "rfi-1", {
      requestedResponseDate: "2026-08-15",
      lockVersion: 2,
    });
  });

  it("opens only one row's secondary editor at a time, announces it, and returns focus to the trigger on close", async () => {
    const harness = mountRegister({
      rows: [rfi({ id: "rfi-1" }), rfi({ id: "rfi-2" })],
    });
    await harness.view.reload();

    const secondaryRowHidden = (id: string) =>
      element(harness.root, `[data-secondary-row="${id}"]`).hasAttribute(
        "hidden",
      );
    expect(secondaryRowHidden("rfi-1")).toBe(true);
    expect(secondaryRowHidden("rfi-2")).toBe(true);

    const triggerOne = element(
      harness.root,
      '[data-secondary-toggle][data-id="rfi-1"]',
    );
    fire(triggerOne, "click");
    expect(secondaryRowHidden("rfi-1")).toBe(false);
    expect(
      element(
        harness.root,
        '[data-secondary-toggle][data-id="rfi-1"]',
      ).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(harness.announce).toHaveBeenCalledWith(
      expect.stringContaining("Details editor opened"),
    );

    const triggerTwo = element(
      harness.root,
      '[data-secondary-toggle][data-id="rfi-2"]',
    );
    fire(triggerTwo, "click");
    expect(secondaryRowHidden("rfi-1")).toBe(true);
    expect(secondaryRowHidden("rfi-2")).toBe(false);

    fire(triggerTwo, "click");
    expect(secondaryRowHidden("rfi-2")).toBe(true);
    expect(harness.announce).toHaveBeenCalledWith("Details editor closed.");
    expect(harness.document.activeElement).toBe(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-2"]'),
    );
  });

  it("closes the secondary editor on Escape once no field is actively editing", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const trigger = element(
      harness.root,
      '[data-secondary-toggle][data-id="rfi-1"]',
    );
    fire(trigger, "click");
    expect(
      element(harness.root, '[data-secondary-row="rfi-1"]').hasAttribute(
        "hidden",
      ),
    ).toBe(false);

    const questionCell = element(
      harness.root,
      '[data-id="rfi-1"][data-field="question"]',
    );
    key(questionCell, "Escape");
    expect(
      element(harness.root, '[data-secondary-row="rfi-1"]').hasAttribute(
        "hidden",
      ),
    ).toBe(true);
    expect(harness.document.activeElement).toBe(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-1"]'),
    );
  });

  it("saves a secondary field with Saving/Saved feedback and preserves lockVersion", async () => {
    const update = vi.fn(() =>
      Promise.resolve({
        data: { drawingReferences: "A-701", lockVersion: 2 },
      }),
    );
    const harness = mountRegister({ update });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-1"]'),
      "click",
    );
    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="drawingReferences"]',
      ),
      "Enter",
    );
    const editor = element(
      harness.root,
      '[data-field="drawingReferences"] [data-cell-editor]',
    ) as HTMLInputElement;
    editor.value = "A-701";
    key(editor, "Enter");
    expect(harness.root.textContent).toContain("Saving…");
    await settle();
    expect(update).toHaveBeenCalledWith("project-1", "rfi-1", {
      drawingReferences: "A-701",
      lockVersion: 1,
    });
    expect(harness.root.textContent).toContain("Saved");
  });

  it("refreshes a conflicted secondary field from the register and reports the failure inline", async () => {
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    const update = vi.fn(async () => Promise.reject(conflict));
    const harness = mountRegister({
      update,
      reloadRows: [
        rfi({
          contractorSuggestion: "Changed by another editor",
          lockVersion: 3,
        }),
      ],
    });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-1"]'),
      "click",
    );
    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="contractorSuggestion"]',
      ),
      "Enter",
    );
    const editor = element(
      harness.root,
      '[data-field="contractorSuggestion"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    editor.value = "My stale suggestion";
    key(editor, "Enter");
    await settle();
    expect(harness.root.textContent).toContain("Changed by another editor");
    expect(harness.root.textContent).toContain("Latest value loaded");
  });

  it("reports permission loss at the secondary field that was denied", async () => {
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    const update = vi.fn().mockRejectedValueOnce(denied);
    const harness = mountRegister({ update });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-secondary-toggle][data-id="rfi-1"]'),
      "click",
    );
    key(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="specificationReferences"]',
      ),
      "Enter",
    );
    const editor = element(
      harness.root,
      '[data-field="specificationReferences"] [data-cell-editor]',
    ) as HTMLInputElement;
    editor.value = "09 91 00";
    key(editor, "Enter");
    await settle();
    expect(harness.root.textContent).toContain("permission to edit this draft");
  });

  it("shows a filtered-empty explanation with a clear-filters action instead of an empty table shell", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const status = element(
      harness.root,
      "#rfi-status",
    ) as unknown as HTMLSelectElement;
    status.value = "closed";
    fire(status, "change");
    expect(harness.root.querySelector(".rfi-table")).toBeNull();
    expect(harness.root.textContent).toContain("No RFIs match these filters.");
    fire(element(harness.root, "[data-results] [data-clear-filters]"), "click");
    expect(harness.root.querySelector(".rfi-table")).not.toBeNull();
  });

  it("keeps mobile cards unchanged alongside the redesigned desktop table", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const card = element(harness.root, ".rfi-card");
    expect(card.querySelector(".rfi-card-main")).not.toBeNull();
    expect(card.querySelector(".rfi-card-top")).not.toBeNull();
    expect(card.querySelector(".rfi-card-subject")?.textContent).toBe(
      "Door clearance",
    );
    expect(card.querySelector(".rfi-card-question")).not.toBeNull();
    expect(card.querySelector(".rfi-card-facts")).not.toBeNull();
  });

  it("both the RFI identity and the Subject title link to the workspace with clear accessible names", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const idLink = element(
      harness.root,
      '[data-rfi-row="rfi-1"] .rfi-id-link',
    ) as HTMLAnchorElement;
    expect(idLink.getAttribute("href")).toBe("/projects/project-1/rfis/rfi-1");
    expect(idLink.getAttribute("aria-label")).toContain("Open RFI");
    const subjectLink = element(
      harness.root,
      '[data-rfi-row="rfi-1"] .rfi-subject-link',
    ) as HTMLAnchorElement;
    expect(subjectLink.getAttribute("href")).toBe(
      "/projects/project-1/rfis/rfi-1",
    );
    expect(subjectLink.textContent).toBe("Door clearance");

    fire(idLink, "click");
    expect(harness.navigate).toHaveBeenCalledWith(
      "/projects/project-1/rfis/rfi-1",
    );
  });

  it("begins the existing Subject edit mode from its explicit edit affordance only", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    expect(
      harness.root.querySelector('[data-id="rfi-1"][data-field="subject"]'),
    ).toBeNull();
    const trigger = element(
      harness.root,
      '[data-edit-subject][data-id="rfi-1"]',
    );
    expect(trigger.getAttribute("aria-label")).toBe("Edit subject");

    fire(
      element(harness.root, '[data-rfi-row="rfi-1"] .rfi-subject-link'),
      "click",
    );
    expect(
      harness.root.querySelector(
        '[data-id="rfi-1"][data-field="subject"] [data-cell-editor]',
      ),
    ).toBeNull();

    fire(trigger, "click");
    expect(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="subject"] [data-cell-editor]',
      ),
    ).toBeTruthy();
  });

  it("sorts by clicking a column header, updates the URL, toggles direction, and marks aria-sort", async () => {
    const harness = mountRegister({
      rows: [
        rfi({ id: "rfi-1", subject: "Bravo item" }),
        rfi({ id: "rfi-2", subject: "Alpha item" }),
      ],
    });
    await harness.view.reload();
    expect(harness.root.querySelector("#rfi-sort")).toBeNull();

    const subjectHeader = element(harness.root, '[data-sort-header="subject"]');
    expect(subjectHeader.closest("th")?.getAttribute("aria-sort")).toBe("none");
    fire(subjectHeader, "click");
    expect(harness.window.location.search).toContain("sort=subject");
    expect(
      element(harness.root, '[data-sort-header="subject"]')
        .closest("th")
        ?.getAttribute("aria-sort"),
    ).toBe("ascending");
    const orderAsc = [...harness.root.querySelectorAll("[data-rfi-row]")].map(
      (row) => row.getAttribute("data-rfi-row"),
    );
    expect(orderAsc).toEqual(["rfi-2", "rfi-1"]);

    fire(element(harness.root, '[data-sort-header="subject"]'), "click");
    expect(harness.window.location.search).toContain("direction=desc");
    expect(
      element(harness.root, '[data-sort-header="subject"]')
        .closest("th")
        ?.getAttribute("aria-sort"),
    ).toBe("descending");
    const orderDesc = [...harness.root.querySelectorAll("[data-rfi-row]")].map(
      (row) => row.getAttribute("data-rfi-row"),
    );
    expect(orderDesc).toEqual(["rfi-1", "rfi-2"]);
  });

  it("keeps Search, Status, Responsible, and Due as the only visible filter controls", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    expect(harness.root.querySelector("#rfi-search")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-status")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-responsible")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-due")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-sort")).toBeNull();
  });
});

function mountWorkspace(
  options: {
    data?: Record<string, unknown>;
    updateRfi?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const window = new Window({
    url: "https://base.test/projects/project-1/rfis/rfi-1",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<main id="root"></main>';
  Object.assign(globalThis, { document });
  const render = vi.fn(() => '<label>Subject<input name="subject"></label>');
  Object.assign(globalThis, { BASE: { clone: structuredClone, render } });
  const data = options.data ?? {
    project: { id: "project-1", name: "Library", projectNumber: "P-001" },
    rfi: rfi({ capabilities: undefined }),
    currentVersion: { id: "rev-1", label: "Draft 1" },
    responsibleContacts: [contact],
    capabilities: {
      updateDraft: true,
      uploadAttachment: true,
      close: false,
      reopen: false,
      void: false,
      issue: false,
    },
    attachments: { supporting_attachment: [], reference_drawing: [] },
    responses: [],
    activity: [],
    template: { name: "RFI", versionNumber: 3, definition: { title: "RFI" } },
  };
  const root = element(document, "#root");
  const api = {
    getRfiWorkspace: vi.fn(() => Promise.resolve({ data })),
    updateRfi: options.updateRfi ?? vi.fn(() => Promise.resolve({ data: {} })),
  };
  const navigate = vi.fn();
  const announce = vi.fn();
  const holder: { current?: ReturnType<typeof createRfiWorkspaceView> } = {};
  const requestRender = () => {
    holder.current?.mount(root);
  };
  const view = createRfiWorkspaceView({
    api,
    projectId: "project-1",
    rfiId: "rfi-1",
    navigate,
    announce,
    requestRender,
  });
  holder.current = view;
  views.push(view);
  return { window, document, root, api, navigate, announce, view, render };
}

describe("RFI document workspace", () => {
  it("uses the shared document hierarchy, revision-aware files, renderer, and separate response", async () => {
    const window = new Window({
      url: "https://base.test/projects/project-1/rfis/rfi-1",
    });
    const document = window.document as unknown as Document;
    document.body.innerHTML = '<main id="root"></main>';
    Object.assign(globalThis, { document });
    const render = vi.fn(() => '<label>Subject<input name="subject"></label>');
    Object.assign(globalThis, { BASE: { clone: structuredClone, render } });
    const data = {
      project: { id: "project-1", name: "Library", projectNumber: "P-001" },
      rfi: rfi({
        status: "response_received",
        rfiNumber: "RFI-004",
        issuedAt: "2026-07-21T12:00:00Z",
        capabilities: undefined,
      }),
      currentVersion: { id: "rev-1", label: "Draft 1" },
      responsibleContacts: [contact],
      capabilities: {
        updateDraft: false,
        uploadAttachment: false,
        close: true,
        reopen: false,
        void: true,
        issue: false,
      },
      attachments: {
        supporting_attachment: [
          {
            id: "file-1",
            role: "supporting_attachment",
            originalFilename: "detail.pdf",
            revisionLabel: "Draft 1",
            byteSize: 2048,
            uploadedAt: "2026-07-21T12:00:00Z",
          },
        ],
        reference_drawing: [],
      },
      responses: [
        {
          id: "response-1",
          response: "Maintain 36 inches.",
          respondedBy: "Architect",
          createdAt: "2026-07-22T12:00:00Z",
        },
      ],
      activity: [],
      template: { name: "RFI", versionNumber: 3, definition: { title: "RFI" } },
    };
    const api = { getRfiWorkspace: vi.fn(() => Promise.resolve({ data })) };
    const root = element(document, "#root");
    const holder: { current?: ReturnType<typeof createRfiWorkspaceView> } = {};
    const requestRender = () => {
      holder.current?.mount(root);
    };
    const view = createRfiWorkspaceView({
      api,
      projectId: "project-1",
      rfiId: "rfi-1",
      navigate: vi.fn(),
      announce: vi.fn(),
      requestRender,
    });
    holder.current = view;
    views.push(view);
    await view.reload();

    expect(root.querySelector(".document-breadcrumbs")).not.toBeNull();
    expect(root.querySelectorAll(".document-work-panel")).toHaveLength(1);
    expect(root.querySelectorAll(".rfi-authoritative-content")).toHaveLength(1);
    expect(
      root.querySelector(".document-options [data-action='void']"),
    ).not.toBeNull();
    expect(
      root.querySelector(".rfi-rail-actions > [data-action='void']"),
    ).toBeNull();
    expect(root.textContent).toContain("Supporting attachment");
    expect(root.textContent).toContain("Draft 1");
    expect(root.querySelector(".rfi-response-panel")?.textContent).toContain(
      "Maintain 36 inches",
    );

    // Preview is not rendered by default — Details is the default main mode,
    // and the renderer never runs until Preview is explicitly selected.
    expect(render).not.toHaveBeenCalled();
    expect(root.querySelector(".rfi-render-panel")).toBeNull();
    expect(
      element(root, '[data-mode-button="details"]').getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    fire(element(root, '[data-mode-button="preview"]'), "click");
    expect(render).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".document-work-panel")).toBeNull();
    const previewInput = element(
      root,
      ".rfi-render-preview input",
    ) as HTMLInputElement;
    expect(previewInput.disabled).toBe(true);
    expect(previewInput.value).toBe("Door clearance");
  });

  it("renders a main content column and a metadata rail, with references shown side by side", async () => {
    const harness = mountWorkspace();
    await harness.view.reload();

    expect(harness.root.querySelector(".rfi-workspace-grid")).not.toBeNull();
    expect(harness.root.querySelector(".rfi-workspace-main")).not.toBeNull();
    const rail = element(harness.root, ".rfi-workspace-aside");
    expect(rail.textContent).toContain("Status");
    expect(rail.textContent).toContain("Responsible party");
    expect(rail.textContent).toContain("Response due");
    expect(rail.textContent).toContain("Attachments");

    const fields = [
      ...harness.root.querySelectorAll(".rfi-content-field"),
    ] as HTMLElement[];
    const drawing = fields.find((f) =>
      f.textContent.includes("Drawing references"),
    );
    const spec = fields.find((f) =>
      f.textContent.includes("Specification references"),
    );
    const question = fields.find((f) => f.textContent.includes("Question"));
    expect(drawing?.classList.contains("is-wide")).toBe(false);
    expect(spec?.classList.contains("is-wide")).toBe(false);
    expect(question?.classList.contains("is-wide")).toBe(true);
  });

  it("saves the draft form with lockVersion, and reports conflict and permission-loss", async () => {
    const updateRfi = vi
      .fn()
      .mockResolvedValueOnce({ data: { subject: "Updated subject" } });
    const harness = mountWorkspace({ updateRfi });
    await harness.view.reload();
    fire(element(harness.root, "[data-edit-info]"), "click");
    const form = element(harness.root, "[data-info-form]") as HTMLFormElement;
    (element(form, "#rfi-f-subject") as HTMLInputElement).value =
      "Updated subject";
    fire(form, "submit");
    await settle();
    expect(updateRfi).toHaveBeenCalledWith(
      "project-1",
      "rfi-1",
      expect.objectContaining({ lockVersion: 1 }),
    );
    expect(harness.root.querySelector("[data-info-form]")).toBeNull();

    const conflictError = Object.assign(new Error("Conflict"), {
      status: 409,
    });
    const conflictUpdate = vi.fn().mockRejectedValueOnce(conflictError);
    const conflictHarness = mountWorkspace({ updateRfi: conflictUpdate });
    await conflictHarness.view.reload();
    fire(element(conflictHarness.root, "[data-edit-info]"), "click");
    fire(element(conflictHarness.root, "[data-info-form]"), "submit");
    await settle();
    expect(conflictHarness.announce).toHaveBeenCalledWith(
      expect.stringContaining("changed elsewhere"),
    );
    expect(conflictHarness.api.getRfiWorkspace).toHaveBeenCalledTimes(2);

    const deniedError = Object.assign(new Error("Forbidden"), {
      status: 403,
    });
    const deniedUpdate = vi.fn().mockRejectedValueOnce(deniedError);
    const deniedHarness = mountWorkspace({ updateRfi: deniedUpdate });
    await deniedHarness.view.reload();
    fire(element(deniedHarness.root, "[data-edit-info]"), "click");
    fire(element(deniedHarness.root, "[data-info-form]"), "submit");
    await settle();
    expect(
      element(deniedHarness.root, "[data-info-form] .app-dialog-error")
        .textContent,
    ).toContain("Forbidden");
  });
});
