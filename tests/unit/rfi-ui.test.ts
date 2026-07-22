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

    const subject = element(
      harness.root,
      '[data-id="rfi-1"][data-field="subject"]',
    );
    fire(subject, "click");
    key(
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "Enter",
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

    key(element(harness.root, '[data-id="rfi-1"][data-field="question"]'), "x");
    const question = element(
      harness.root,
      '[data-field="question"] [data-cell-editor]',
    ) as HTMLTextAreaElement;
    expect(question.value).toBe("x");
    key(question, "Escape");
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(1);

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "Enter",
    );
    const tabbed = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    tabbed.value = "Tabbed clearance";
    key(tabbed, "Tab");
    await settle();
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(2);
    expect(
      element(
        harness.root,
        '[data-id="rfi-1"][data-field="responsiblePartyId"]',
      ).classList.contains("is-selected"),
    ).toBe(true);

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "Enter",
    );
    const empty = element(
      harness.root,
      '[data-field="subject"] [data-cell-editor]',
    ) as HTMLInputElement;
    empty.value = "";
    key(empty, "Tab");
    expect(harness.api.updateRfi).toHaveBeenCalledTimes(2);
    expect(
      element(harness.root, '[data-field="subject"] [role="alert"]')
        .textContent,
    ).toContain("required");

    const locked = element(
      harness.root,
      '[data-id="rfi-locked"][data-field="subject"]',
    );
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

    key(
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "Enter",
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
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "click",
    );
    expect(harness.navigate).not.toHaveBeenCalled();
    fire(element(harness.root, '[data-rfi-row="rfi-1"] .open-link'), "click");
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
    key(
      element(harness.root, '[data-id="rfi-1"][data-field="subject"]'),
      "Enter",
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
      root.querySelector(".document-header-actions > [data-action='void']"),
    ).toBeNull();
    expect(root.textContent).toContain("Supporting attachment");
    expect(root.textContent).toContain("Draft 1");
    expect(root.querySelector(".rfi-response-panel")?.textContent).toContain(
      "Maintain 36 inches",
    );
    expect(render).toHaveBeenCalledTimes(1);
    const previewInput = element(
      root,
      ".rfi-render-preview input",
    ) as HTMLInputElement;
    expect(previewInput.disabled).toBe(true);
    expect(previewInput.value).toBe("Door clearance");
  });
});
