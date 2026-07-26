/*
 * Shared harness for the UI-7 detail-workspace suites (Record, Revision, RFI).
 * Mirrors the UI-6A/UI-6B register harnesses: a fetch stub over the real
 * `/api/v2` workspace contracts, a `ShellBridge` whose navigate/announce are
 * observable, and a BrowserRouter so URL state and history behave as they do in
 * a browser.
 *
 * Not a test file itself (no `.test.` in the name), so Vitest does not collect
 * it; each consuming file carries its own `// @vitest-environment happy-dom`.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  BrowserRouter,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { ShellProvider, type ShellBridge } from "../../src/ui/app/ShellContext";
import type {
  RecordWorkspaceModel,
  RevisionWorkspaceModel,
  WorkspaceFile,
  WorkspaceRecord,
  WorkspaceRevision,
} from "../../src/ui/features/record-workspace/types";
import type {
  RfiWorkspaceAttachment,
  RfiWorkspaceModel,
} from "../../src/ui/features/rfi-workspace/types";

export const PROJECT_ID = "project-1";
export const RECORD_ID = "record-1";
export const REVISION_ID = "revision-1";
export const RFI_ID = "rfi-1";

export function jsonResponse(
  body: unknown,
  init: { status?: number; requestId?: string } = {},
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.requestId) headers.set("x-request-id", init.requestId);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

/* ---------------------------------------------------------------- fixtures */

export function file(overrides: Partial<WorkspaceFile> = {}): WorkspaceFile {
  return {
    id: "file-1",
    originalFilename: "level-2-framing.pdf",
    mediaType: "application/pdf",
    byteSize: 2048,
    uploadedAt: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

export function revision(
  overrides: Partial<WorkspaceRevision> = {},
): WorkspaceRevision {
  return {
    id: REVISION_ID,
    revisionNumber: 1,
    revisionLabel: null,
    title: "Level 2 Framing Plan",
    description: null,
    discipline: "structural",
    source: null,
    changeSummary: "Initial document",
    status: "published",
    createdAt: "2026-07-01T09:00:00Z",
    fileCount: 1,
    files: [file()],
    issuanceCount: 0,
    isCurrent: true,
    capabilities: { uploadFile: false, publishRevision: false },
    ...overrides,
  };
}

export function workspaceRecord(
  overrides: Partial<WorkspaceRecord> = {},
): WorkspaceRecord {
  return {
    id: RECORD_ID,
    projectId: PROJECT_ID,
    recordType: "drawing",
    recordNumber: "A-101",
    title: "Level 2 Framing Plan",
    description: null,
    discipline: "structural",
    source: null,
    status: "active",
    archivedAt: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

export function recordWorkspace(
  overrides: Partial<RecordWorkspaceModel> = {},
): RecordWorkspaceModel {
  const revisions = overrides.revisions ?? [revision()];
  return {
    record: workspaceRecord(),
    revisions,
    totalFileCount: revisions.reduce((sum, item) => sum + item.fileCount, 0),
    currentRevision: revisions.find((item) => item.isCurrent) ?? null,
    capabilities: {
      updateRecord: true,
      archiveRecord: true,
      createRevision: true,
    },
    ...overrides,
  };
}

export function revisionWorkspace(
  overrides: Partial<RevisionWorkspaceModel> = {},
): RevisionWorkspaceModel {
  const item = overrides.revision ?? revision();
  return {
    record: workspaceRecord(),
    revision: item,
    currentRevisionId: item.isCurrent ? item.id : null,
    ...overrides,
  };
}

export function attachment(
  overrides: Partial<RfiWorkspaceAttachment> = {},
): RfiWorkspaceAttachment {
  return {
    id: "attachment-1",
    role: "supporting_attachment",
    revisionId: "rfi-draft-1",
    revisionLabel: "Current Draft",
    originalFilename: "sketch.pdf",
    mediaType: "application/pdf",
    byteSize: 4096,
    uploadedBy: "user-1",
    uploadedAt: "2026-07-19T09:00:00Z",
    ...overrides,
  };
}

/**
 * `rfi` and `capabilities` are merged field-wise, so a test can override one
 * status or one capability without restating the whole object.
 */
export type RfiWorkspaceOverrides = Omit<
  Partial<RfiWorkspaceModel>,
  "rfi" | "capabilities"
> & {
  rfi?: Partial<RfiWorkspaceModel["rfi"]>;
  capabilities?: Partial<RfiWorkspaceModel["capabilities"]>;
};

export function rfiWorkspace(
  overrides: RfiWorkspaceOverrides = {},
): RfiWorkspaceModel {
  const base: RfiWorkspaceModel = {
    rfi: {
      id: RFI_ID,
      rfiNumber: null,
      legacyReference: null,
      status: "draft",
      subject: "Relocate ceiling diffuser above conference room",
      question: "Coordinate the revised diffuser location with S-201.",
      contractorSuggestion: null,
      drawingReferences: "A2.11",
      specificationReferences: null,
      responsibleParty: "Alex Architect",
      responsiblePartyId: "contact-1",
      responsiblePartyLegacyText: null,
      submittedBy: null,
      requestedResponseDate: "2026-08-05",
      costImpact: null,
      scheduleImpact: null,
      issuedAt: null,
      responseReceivedAt: null,
      closedAt: null,
      lockVersion: 1,
      createdAt: "2026-07-01T09:00:00Z",
      updatedAt: "2026-07-20T09:00:00Z",
      isOverdue: false,
      dueSoon: false,
      issuanceReconciliationState: "not_issued",
    },
    currentVersion: {
      id: "rfi-draft-1",
      label: "Current Draft",
      status: "draft",
    },
    responsibleContacts: [
      { id: "contact-1", name: "Alex Architect", companyName: "Meridian" },
      { id: "contact-2", name: "Sam Engineer", companyName: null },
    ],
    project: {
      id: PROJECT_ID,
      projectNumber: "24-001",
      name: "Riverside Tower",
      status: "active",
      timezone: "America/New_York",
      address: {
        line1: null,
        line2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
      },
    },
    organization: { id: "org-1", name: "BASE Construction" },
    template: null,
    attachments: { supporting_attachment: [], reference_drawing: [] },
    responses: [],
    activity: [],
    capabilities: {
      updateDraft: true,
      uploadAttachment: true,
      markReady: false,
      issue: false,
      recordResponse: false,
      returnForClarification: false,
      close: false,
      reopen: false,
      void: true,
    },
  };

  return {
    ...base,
    ...overrides,
    rfi: { ...base.rfi, ...overrides.rfi },
    capabilities: { ...base.capabilities, ...overrides.capabilities },
  };
}

/* ------------------------------------------------------------------- fetch */

export interface RecordedCall {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  fileName?: string;
  role?: string;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export interface WorkspaceFetchConfig {
  /** Successive responses for the record workspace GET, consumed in order. */
  recordResponses?: (Response | Promise<Response>)[];
  record?: RecordWorkspaceModel;
  revisionResponses?: (Response | Promise<Response>)[];
  revisionModel?: RevisionWorkspaceModel;
  rfiResponses?: (Response | Promise<Response>)[];
  rfi?: RfiWorkspaceModel;
  /** Handlers for the mutating endpoints; default to a 200/201 success. */
  onPatchRecord?: (body: Record<string, unknown>) => Response;
  onArchiveRecord?: () => Response;
  onCreateRevision?: (body: Record<string, unknown>) => Response;
  onPublishRevision?: () => Response;
  onUploadFile?: () => Response;
  onPatchRfi?: (body: Record<string, unknown>) => Response;
  onRespond?: (body: Record<string, unknown>) => Response;
  onUploadAttachment?: () => Response;
  onTransition?: (transition: string) => Response;
}

export function installWorkspaceFetch(config: WorkspaceFetchConfig = {}) {
  const calls: RecordedCall[] = [];
  let recordIndex = 0;
  let revisionIndex = 0;
  let rfiIndex = 0;

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedCall = { method, url };
    if (typeof init?.body === "string") {
      call.body = JSON.parse(init.body) as Record<string, unknown>;
    }
    if (init?.body instanceof FormData) {
      const uploaded = init.body.get("file");
      call.fileName = uploaded instanceof File ? uploaded.name : "";
      const uploadedRole = init.body.get("role");
      if (typeof uploadedRole === "string") call.role = uploadedRole;
    }
    calls.push(call);

    const recordWorkspaceUrl =
      /\/api\/v2\/projects\/[^/?]+\/records\/[^/?]+\/workspace$/.test(url);
    const revisionWorkspaceUrl =
      /\/records\/[^/?]+\/revisions\/[^/?]+\/workspace$/.test(url);
    const rfiWorkspaceUrl = /\/rfis\/[^/?]+\/workspace$/.test(url);

    if (revisionWorkspaceUrl && method === "GET") {
      const configured = config.revisionResponses?.[revisionIndex];
      revisionIndex += 1;
      if (configured) return Promise.resolve(configured);
      return Promise.resolve(
        jsonResponse(
          { data: config.revisionModel ?? revisionWorkspace() },
          { requestId: "req-revision" },
        ),
      );
    }
    if (recordWorkspaceUrl && method === "GET") {
      const configured = config.recordResponses?.[recordIndex];
      recordIndex += 1;
      if (configured) return Promise.resolve(configured);
      return Promise.resolve(
        jsonResponse(
          { data: config.record ?? recordWorkspace() },
          { requestId: "req-record" },
        ),
      );
    }
    if (rfiWorkspaceUrl && method === "GET") {
      const configured = config.rfiResponses?.[rfiIndex];
      rfiIndex += 1;
      if (configured) return Promise.resolve(configured);
      return Promise.resolve(
        jsonResponse(
          { data: config.rfi ?? rfiWorkspace() },
          { requestId: "req-rfi" },
        ),
      );
    }

    if (/\/revisions\/[^/?]+\/publish$/.test(url) && method === "POST") {
      return Promise.resolve(config.onPublishRevision?.() ?? jsonResponse({}));
    }
    if (/\/revisions\/[^/?]+\/files$/.test(url) && method === "POST") {
      return Promise.resolve(
        config.onUploadFile?.() ??
          jsonResponse({ data: { id: "file-new" } }, { status: 201 }),
      );
    }
    if (/\/records\/[^/?]+\/revisions$/.test(url) && method === "POST") {
      return Promise.resolve(
        config.onCreateRevision?.(call.body ?? {}) ??
          jsonResponse(
            {
              data: {
                id: "revision-new",
                revisionNumber: 2,
                revisionLabel: null,
              },
            },
            { status: 201 },
          ),
      );
    }
    if (/\/records\/[^/?]+\/archive$/.test(url) && method === "POST") {
      return Promise.resolve(config.onArchiveRecord?.() ?? jsonResponse({}));
    }
    if (/\/records\/[^/?]+$/.test(url) && method === "PATCH") {
      return Promise.resolve(
        config.onPatchRecord?.(call.body ?? {}) ?? jsonResponse({ data: {} }),
      );
    }
    if (/\/rfis\/[^/?]+\/attachments$/.test(url) && method === "POST") {
      return Promise.resolve(
        config.onUploadAttachment?.() ??
          jsonResponse({ data: { id: "attachment-new" } }, { status: 201 }),
      );
    }
    if (/\/rfis\/[^/?]+\/respond$/.test(url) && method === "POST") {
      return Promise.resolve(
        config.onRespond?.(call.body ?? {}) ?? jsonResponse({ data: {} }),
      );
    }
    const transition =
      /\/rfis\/[^/?]+\/(close|reopen|void|issue|ready|return)$/.exec(url);
    if (transition && method === "POST") {
      return Promise.resolve(
        config.onTransition?.(transition[1]) ?? jsonResponse({ data: {} }),
      );
    }
    if (/\/rfis\/[^/?]+$/.test(url) && method === "PATCH") {
      return Promise.resolve(
        config.onPatchRfi?.(call.body ?? {}) ?? jsonResponse({ data: {} }),
      );
    }

    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };

  return { calls };
}

/* ------------------------------------------------------------------ render */

function NavigationCapture({
  onReady,
}: {
  onReady: (navigate: NavigateFunction) => void;
}) {
  const navigate = useNavigate();
  const callback = useRef(onReady);
  callback.current = onReady;
  useEffect(() => {
    callback.current(navigate);
  }, [navigate]);
  return null;
}

export function renderWorkspace(
  ui: ReactNode,
  initialPath: string,
  options: { announce?: (message: string) => void } = {},
) {
  window.history.pushState({}, "", initialPath);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const navigations: string[] = [];
  const announcements: string[] = [];
  let navigateFunction: NavigateFunction | null = null;

  const bridge: ShellBridge = {
    runtime: {
      getApiClient: () => Promise.reject(new Error("not used")),
      loadFeatureFactory: () => Promise.reject(new Error("not used")),
    },
    navigate: (href) => {
      navigations.push(href);
    },
    announce: (message) => {
      announcements.push(message);
      options.announce?.(message);
    },
    getSession: () => ({ status: "ready", data: null, error: null }),
    requestHeadingFocus: () => undefined,
  };

  const result = render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationCapture
          onReady={(navigate) => {
            navigateFunction = navigate;
          }}
        />
        <ShellProvider value={bridge}>{ui}</ShellProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    navigations,
    announcements,
    goTo: (to: string) => {
      if (!navigateFunction) throw new Error("Navigation is not ready.");
      void navigateFunction(to);
    },
  };
}
