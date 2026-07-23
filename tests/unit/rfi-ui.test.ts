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

describe("RFI register editing", () => {
  it("clicks a draft's subject to open one inline editor with every field", async () => {
    const harness = mountRegister();
    await harness.view.reload();

    // Subject is a button for editable rows, not a link.
    const trigger = element(
      harness.root,
      '[data-subject-edit][data-id="rfi-1"]',
    );
    expect(
      harness.root.querySelector('[data-rfi-row="rfi-1"] .rfi-subject-link'),
    ).toBeNull();
    expect(
      element(harness.root, '[data-editor-row="rfi-1"]').hasAttribute("hidden"),
    ).toBe(true);

    fire(trigger, "click");
    expect(
      element(harness.root, '[data-editor-row="rfi-1"]').hasAttribute("hidden"),
    ).toBe(false);
    for (const field of [
      "subject",
      "responsiblePartyId",
      "requestedResponseDate",
      "question",
      "contractorSuggestion",
      "drawingReferences",
      "specificationReferences",
    ]) {
      expect(
        harness.root.querySelector(
          `[data-field-input][data-id="rfi-1"][data-field="${field}"]`,
        ),
      ).not.toBeNull();
    }
    expect(
      element(
        harness.root,
        '[data-subject-edit][data-id="rfi-1"]',
      ).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("saves the subject on change and reflects it in the row summary", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    ) as HTMLInputElement;
    input.value = "Updated clearance";
    fire(input, "change");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledWith("project-1", "rfi-1", {
      subject: "Updated clearance",
      lockVersion: 1,
    });
    expect(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]').textContent,
    ).toContain("Updated clearance");
    expect(harness.root.textContent).toContain("Saved");
  });

  it("saves the party (select) and response due (date) fields from the panel", async () => {
    const update = vi.fn(
      (_p: string, id: string, values: Record<string, unknown>) =>
        Promise.resolve({
          data: { ...rfi({ id }), ...values, lockVersion: 2 },
        }),
    );
    const harness = mountRegister({ update });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );

    const select = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="responsiblePartyId"]',
    ) as unknown as HTMLSelectElement;
    select.value = "";
    fire(select, "change");
    await settle();
    expect(update).toHaveBeenCalledWith("project-1", "rfi-1", {
      responsiblePartyId: null,
      lockVersion: 1,
    });

    const date = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="requestedResponseDate"]',
    ) as HTMLInputElement;
    date.value = "2026-08-15";
    fire(date, "change");
    await settle();
    expect(update).toHaveBeenCalledWith("project-1", "rfi-1", {
      requestedResponseDate: "2026-08-15",
      lockVersion: 2,
    });
  });

  it("saves a long-form field (question) from the panel textarea", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const question = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="question"]',
    ) as HTMLTextAreaElement;
    question.value = "Revised question text";
    fire(question, "change");
    expect(harness.root.textContent).toContain("Saving…");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledWith("project-1", "rfi-1", {
      question: "Revised question text",
      lockVersion: 1,
    });
    expect(harness.root.textContent).toContain("Saved");
  });

  it("blocks an empty required field with a field-level message and no save", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    ) as HTMLInputElement;
    input.value = "";
    fire(input, "change");
    await settle();
    expect(harness.api.updateRfi).not.toHaveBeenCalled();
    expect(
      element(harness.root, '[data-field-state="rfi-1:subject"] [role="alert"]')
        .textContent,
    ).toContain("required");
  });

  it("reloads a conflicted field and shows the latest value with a retry message", async () => {
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
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    ) as HTMLInputElement;
    input.value = "My stale change";
    fire(input, "change");
    await settle();
    expect(harness.api.getProjectRfis).toHaveBeenCalledTimes(2);
    expect(harness.root.textContent).toContain("Changed by another editor");
    expect(harness.root.textContent).toContain("Latest values loaded");
  });

  it("reports permission loss at the affected field", async () => {
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    const update = vi.fn().mockRejectedValueOnce(denied);
    const harness = mountRegister({ update });
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="drawingReferences"]',
    ) as HTMLInputElement;
    input.value = "A-701";
    fire(input, "change");
    await settle();
    expect(harness.root.textContent).toContain("permission to edit this draft");
  });

  it("keeps only one editor open at a time", async () => {
    const harness = mountRegister({
      rows: [rfi({ id: "rfi-1" }), rfi({ id: "rfi-2" })],
    });
    await harness.view.reload();
    const hidden = (id: string) =>
      element(harness.root, `[data-editor-row="${id}"]`).hasAttribute("hidden");

    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    expect(hidden("rfi-1")).toBe(false);
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-2"]'),
      "click",
    );
    expect(hidden("rfi-1")).toBe(true);
    expect(hidden("rfi-2")).toBe(false);
  });

  it("closes the editor on Escape and returns focus to the subject button", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    expect(
      element(harness.root, '[data-editor-row="rfi-1"]').hasAttribute("hidden"),
    ).toBe(false);
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    );
    key(input, "Escape");
    expect(
      element(harness.root, '[data-editor-row="rfi-1"]').hasAttribute("hidden"),
    ).toBe(true);
    expect(harness.document.activeElement).toBe(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
    );
  });

  it("closes the editor from the Done button", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    fire(element(harness.root, '[data-editor-done][data-id="rfi-1"]'), "click");
    expect(
      element(harness.root, '[data-editor-row="rfi-1"]').hasAttribute("hidden"),
    ).toBe(true);
  });

  it("adds a new RFI and opens its editor focused on the subject", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    fire(element(harness.root, ".rfi-heading [data-create-rfi]"), "click");
    await settle();
    expect(harness.api.createRfi).toHaveBeenCalledTimes(1);
    expect(
      element(harness.root, '[data-editor-row="rfi-new"]').hasAttribute(
        "hidden",
      ),
    ).toBe(false);
    expect(harness.document.activeElement).toBe(
      element(
        harness.root,
        '[data-field-input][data-id="rfi-new"][data-field="subject"]',
      ),
    );
  });
});

describe("RFI register layout", () => {
  it("renders the five-column desktop hierarchy — RFI, Subject, Party, Due, Updated — with no Action column", async () => {
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
          requestedResponseDate: "2099-01-01",
          capabilities: { updateDraft: false },
        }),
      ],
    });
    await harness.view.reload();

    const headers = [
      ...harness.root.querySelectorAll(".rfi-table thead th"),
    ].map((th) => th.textContent.trim());
    expect(headers).toEqual(["RFI ↑", "Subject", "Party", "Due", "Updated"]);
    expect(harness.root.querySelector(".rfi-cell-action")).toBeNull();

    const row = element(harness.root, '[data-rfi-row="rfi-1"]');
    expect(row.querySelector(".rfi-id-number")?.textContent).toBe("RFI-014");
    expect(row.querySelector(".rfi-id-status")?.textContent).toBe("Open");
    expect(row.querySelector(".rfi-subject-link")?.textContent).toBe(
      "Relocate existing VAV above conference room",
    );
    expect(row.querySelector(".rfi-subject-secondary")?.textContent).toBe(
      "Coordinate revised ceiling elevation with MEP layout",
    );
    expect(row.querySelector(".rfi-subject-meta")?.textContent).toBe(
      "A2.11 · M3.02",
    );
    expect(element(row, ".rfi-cell-responsible").textContent).toContain(
      "Alex Architect",
    );
    expect(row.querySelector(".rfi-updated-text")).not.toBeNull();
  });

  it("shows Unnumbered with a Draft status line for unissued rows", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    const row = element(harness.root, '[data-rfi-row="rfi-1"]');
    expect(row.querySelector(".rfi-id-number")?.textContent).toBe("Unnumbered");
    expect(row.querySelector(".rfi-id-number")?.classList).toContain(
      "rfi-id-number-draft",
    );
    expect(row.querySelector(".rfi-id-status")?.textContent).toBe("Draft");
  });

  it("shows the party's company as secondary text and Unassigned when none is set", async () => {
    const harness = mountRegister({
      rows: [
        rfi({ responsibleParty: "Alex Architect" }),
        rfi({ id: "rfi-2", responsiblePartyId: null, responsibleParty: null }),
      ],
    });
    await harness.view.reload();
    const withCompany = element(
      harness.root,
      '[data-rfi-row="rfi-1"] .rfi-cell-responsible',
    );
    expect(withCompany.textContent).toContain("Alex Architect");
    expect(withCompany.textContent).toContain("Design Co");
    expect(
      element(harness.root, '[data-rfi-row="rfi-2"] .rfi-cell-responsible')
        .textContent,
    ).toContain("Unassigned");
  });

  it("shows server-flag-driven due urgency text", async () => {
    const harness = mountRegister({
      rows: [
        rfi({
          id: "rfi-overdue",
          requestedResponseDate: "2020-01-01",
          isOverdue: true,
          dueSoon: false,
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
    const overdue = element(
      harness.root,
      '[data-rfi-row="rfi-overdue"] .rfi-due-urgency',
    );
    expect(overdue.textContent).toMatch(/^Overdue by \d+ days?$/);
    expect(overdue.classList).toContain("is-overdue");
    expect(
      element(harness.root, '[data-rfi-row="rfi-none"] .rfi-cell-due')
        .textContent,
    ).toContain("No due date");
  });

  it("makes the RFI identity and locked subject real workspace links; data cells never navigate", async () => {
    const harness = mountRegister();
    await harness.view.reload();

    const idLink = element(
      harness.root,
      '[data-rfi-row="rfi-1"] .rfi-id-link',
    ) as HTMLAnchorElement;
    expect(idLink.getAttribute("href")).toBe("/projects/project-1/rfis/rfi-1");
    expect(idLink.getAttribute("aria-label")).toContain("Open RFI");
    fire(idLink, "click");
    expect(harness.navigate).toHaveBeenCalledWith(
      "/projects/project-1/rfis/rfi-1",
    );

    // A locked row's subject is a link (no inline editor).
    const lockedRow = element(harness.root, '[data-rfi-row="rfi-locked"]');
    expect(lockedRow.classList).toContain("is-locked");
    expect(lockedRow.querySelector("[data-subject-edit]")).toBeNull();
    expect(lockedRow.querySelector("[data-editor-row]")).toBeNull();
    fire(element(lockedRow, ".rfi-subject-link"), "click");
    expect(harness.navigate).toHaveBeenCalledWith(
      "/projects/project-1/rfis/rfi-locked",
    );

    // Clicking an ordinary read-only cell does not navigate.
    harness.navigate.mockClear();
    fire(
      element(harness.root, '[data-rfi-row="rfi-1"] .rfi-cell-responsible'),
      "click",
    );
    expect(harness.navigate).not.toHaveBeenCalled();
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

    fire(element(harness.root, '[data-sort-header="subject"]'), "click");
    expect(harness.window.location.search).toContain("sort=subject");
    expect(
      element(harness.root, '[data-sort-header="subject"]')
        .closest("th")
        ?.getAttribute("aria-sort"),
    ).toBe("ascending");
    expect(
      [...harness.root.querySelectorAll("[data-rfi-row]")].map((row) =>
        row.getAttribute("data-rfi-row"),
      ),
    ).toEqual(["rfi-2", "rfi-1"]);

    fire(element(harness.root, '[data-sort-header="subject"]'), "click");
    expect(harness.window.location.search).toContain("direction=desc");
    expect(
      element(harness.root, '[data-sort-header="subject"]')
        .closest("th")
        ?.getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("keeps Search, Status, Party, and Due as the only filter controls and preserves URL state across an edit", async () => {
    const harness = mountRegister();
    await harness.view.reload();
    expect(harness.root.querySelector("#rfi-search")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-status")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-responsible")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-due")).not.toBeNull();
    expect(harness.root.querySelector("#rfi-sort")).toBeNull();

    const status = element(
      harness.root,
      "#rfi-status",
    ) as unknown as HTMLSelectElement;
    status.value = "draft";
    fire(status, "change");
    expect(harness.window.location.search).toContain("status=draft");

    fire(
      element(harness.root, '[data-subject-edit][data-id="rfi-1"]'),
      "click",
    );
    const input = element(
      harness.root,
      '[data-field-input][data-id="rfi-1"][data-field="subject"]',
    ) as HTMLInputElement;
    input.value = "Filtered edit";
    fire(input, "change");
    await settle();
    expect(harness.window.location.search).toContain("status=draft");
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

  it("keeps mobile cards unchanged alongside the desktop table", async () => {
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
});

function mountWorkspace(
  options: {
    data?: Record<string, unknown>;
    updateRfi?: ReturnType<typeof vi.fn>;
    recordRfiResponse?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const window = new Window({
    url: "https://base.test/projects/project-1/rfis/rfi-1",
  });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<main id="root"></main>';
  Object.assign(globalThis, { document });
  const render = vi.fn(() => '<label>Subject<input name="subject"></label>');
  Object.assign(globalThis, {
    BASE: { clone: (v: unknown) => structuredClone(v), render },
  });
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
      recordResponse: false,
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
    recordRfiResponse:
      options.recordRfiResponse ?? vi.fn(() => Promise.resolve({ data: {} })),
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
        recordResponse: false,
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
    const harness = mountWorkspace({ data });
    const { root, render } = harness;
    await harness.view.reload();

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

    // Preview is not rendered by default — Details is the default main mode.
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

  it("renders a main content column and a metadata rail labelled Party, references side by side", async () => {
    const harness = mountWorkspace();
    await harness.view.reload();

    expect(harness.root.querySelector(".rfi-workspace-grid")).not.toBeNull();
    expect(harness.root.querySelector(".rfi-workspace-main")).not.toBeNull();
    const rail = element(harness.root, ".rfi-workspace-aside");
    expect(rail.textContent).toContain("Status");
    expect(rail.textContent).toContain("Party");
    expect(rail.textContent).not.toContain("Responsible party");
    expect(rail.textContent).toContain("Response due");
    expect(rail.textContent).toContain("Attachments");
  });

  it("shows draft fields directly editable with no enter-edit-mode button", async () => {
    const harness = mountWorkspace();
    await harness.view.reload();
    // No "Edit draft" affordance — the form is present immediately.
    expect(harness.root.querySelector("[data-edit-info]")).toBeNull();
    expect(harness.root.querySelector("[data-info-form]")).not.toBeNull();
    expect(
      harness.root.querySelector(
        '[data-info-form] label[for="rfi-f-responsiblePartyId"]',
      )?.textContent,
    ).toBe("Party");
  });

  it("saves the draft form with lockVersion, and reports conflict and permission-loss", async () => {
    const updateRfi = vi
      .fn()
      .mockResolvedValueOnce({ data: { subject: "Updated subject" } });
    const harness = mountWorkspace({ updateRfi });
    await harness.view.reload();
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

    const conflictError = Object.assign(new Error("Conflict"), { status: 409 });
    const conflictUpdate = vi.fn().mockRejectedValueOnce(conflictError);
    const conflictHarness = mountWorkspace({ updateRfi: conflictUpdate });
    await conflictHarness.view.reload();
    fire(element(conflictHarness.root, "[data-info-form]"), "submit");
    await settle();
    expect(conflictHarness.announce).toHaveBeenCalledWith(
      expect.stringContaining("changed elsewhere"),
    );
    expect(conflictHarness.api.getRfiWorkspace).toHaveBeenCalledTimes(2);

    const deniedError = Object.assign(new Error("Forbidden"), { status: 403 });
    const deniedUpdate = vi.fn().mockRejectedValueOnce(deniedError);
    const deniedHarness = mountWorkspace({ updateRfi: deniedUpdate });
    await deniedHarness.view.reload();
    fire(element(deniedHarness.root, "[data-info-form]"), "submit");
    await settle();
    expect(
      element(deniedHarness.root, "[data-info-form] .app-dialog-error")
        .textContent,
    ).toContain("Forbidden");
  });

  it("offers a response editor only when the server allows it, and records the response", async () => {
    const recordRfiResponse = vi.fn(() => Promise.resolve({ data: {} }));
    const data = {
      project: { id: "project-1", name: "Library", projectNumber: "P-001" },
      rfi: rfi({
        status: "open",
        rfiNumber: "RFI-004",
        capabilities: undefined,
      }),
      currentVersion: { id: "rev-1", label: "Draft 1" },
      responsibleContacts: [contact],
      capabilities: {
        updateDraft: false,
        uploadAttachment: false,
        close: false,
        reopen: false,
        void: false,
        issue: false,
        recordResponse: true,
      },
      attachments: { supporting_attachment: [], reference_drawing: [] },
      responses: [],
      activity: [],
      template: { name: "RFI", versionNumber: 3, definition: { title: "RFI" } },
    };
    const harness = mountWorkspace({ data, recordRfiResponse });
    await harness.view.reload();

    // Content is read-only; the response form is the editable surface.
    expect(harness.root.querySelector("[data-info-form]")).toBeNull();
    const form = element(
      harness.root,
      "[data-response-form]",
    ) as HTMLFormElement;
    (element(form, "#rfi-response-text") as HTMLTextAreaElement).value =
      "Maintain 36 inches clear.";
    (element(form, "#rfi-response-by") as HTMLInputElement).value = "Architect";
    fire(form, "submit");
    await settle();
    expect(recordRfiResponse).toHaveBeenCalledWith("project-1", "rfi-1", {
      response: "Maintain 36 inches clear.",
      respondedBy: "Architect",
    });
  });

  it("does not show a response editor when recordResponse is not granted", async () => {
    const harness = mountWorkspace();
    await harness.view.reload();
    expect(harness.root.querySelector("[data-response-form]")).toBeNull();
  });
});
