/*
 * Shared harness for the native Document Register (UI-6B) suites. Mirrors the
 * UI-6A Projects harness: a fetch stub over the real `/api/v2` Records
 * contract, a `ShellBridge` whose navigate/announce are observable, and a
 * BrowserRouter so URL state, history push/replace, and Back/Forward behave as
 * they do in a browser.
 *
 * Not a test file itself (no `.test.` in the name), so Vitest does not collect
 * it; each consuming file carries its own `// @vitest-environment happy-dom`.
 */

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  BrowserRouter,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { RecordsRegisterFeature } from "../../src/ui/features/records/RecordsRegisterFeature";
import { ShellProvider, type ShellBridge } from "../../src/ui/app/ShellContext";
import type {
  RecordCurrentRevision,
  RecordListItem,
} from "../../src/ui/features/records/types";

export const PROJECT_ID = "project-1";

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

export function revision(
  overrides: Partial<RecordCurrentRevision> = {},
): RecordCurrentRevision {
  return {
    id: "revision-1",
    revisionNumber: 1,
    revisionLabel: null,
    status: "published",
    title: "Level 2 Framing Plan",
    ...overrides,
  };
}

export function record(
  overrides: Partial<RecordListItem> = {},
): RecordListItem {
  return {
    id: "record-1",
    projectId: PROJECT_ID,
    recordNumber: "A-101",
    title: "Level 2 Framing Plan",
    recordType: "drawing",
    discipline: "structural",
    status: "active",
    currentRevision: revision(),
    hasDraftRevision: false,
    draftRevisionId: null,
    fileCount: 3,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-20T09:00:00Z",
    capabilities: { update: true, archive: true },
    ...overrides,
  };
}

export interface RecordsFetchConfig {
  rows?: RecordListItem[];
  capability?: boolean;
  /** Per-call overrides for the list GET, consumed in order. */
  listResponses?: (Response | Promise<Response>)[];
  onCreateRecord?: (body: Record<string, unknown>) => Response;
  onCreateRevision?: (body: Record<string, unknown>) => Response;
  onUploadFile?: () => Response;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export interface RecordedCall {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  fileName?: string;
}

export function installRecordsFetch(config: RecordsFetchConfig = {}) {
  const calls: RecordedCall[] = [];
  let listIndex = 0;
  const rows = config.rows ?? [record()];

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedCall = { method, url };
    if (init?.body && typeof init.body === "string") {
      call.body = JSON.parse(init.body) as Record<string, unknown>;
    }
    if (init?.body instanceof FormData) {
      const file = init.body.get("file");
      call.fileName = file instanceof File ? file.name : "";
    }
    calls.push(call);

    const listMatch = /\/api\/v2\/projects\/([^/?]+)\/records(?:\?|$)/.exec(
      url,
    );
    const revisionsMatch =
      /\/api\/v2\/projects\/[^/?]+\/records\/([^/?]+)\/revisions$/.exec(url);
    const filesMatch =
      /\/api\/v2\/projects\/[^/?]+\/records\/[^/?]+\/revisions\/([^/?]+)\/files$/.exec(
        url,
      );

    if (filesMatch && method === "POST") {
      return Promise.resolve(
        config.onUploadFile?.() ??
          jsonResponse({ data: { id: "file-1" } }, { status: 201 }),
      );
    }
    if (revisionsMatch && method === "POST") {
      return Promise.resolve(
        config.onCreateRevision?.(call.body ?? {}) ??
          jsonResponse(
            {
              data: {
                id: "revision-new",
                revisionNumber: 1,
                revisionLabel: null,
              },
            },
            { status: 201 },
          ),
      );
    }
    if (listMatch && method === "POST") {
      return Promise.resolve(
        config.onCreateRecord?.(call.body ?? {}) ??
          jsonResponse(
            {
              data: {
                id: "record-new",
                recordNumber: "A-900",
                title:
                  typeof call.body?.title === "string" ? call.body.title : "",
              },
            },
            { status: 201 },
          ),
      );
    }
    if (listMatch && method === "GET") {
      const configured = config.listResponses?.[listIndex];
      listIndex += 1;
      if (configured) return Promise.resolve(configured);
      return Promise.resolve(
        jsonResponse(
          {
            data: {
              // Scoped by the project id in the URL, so a route change to a
              // different project can never be served another project's rows.
              records: listMatch[1] === PROJECT_ID ? rows : [],
              capabilities: { createRecord: config.capability ?? true },
            },
          },
          { requestId: "req-records" },
        ),
      );
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };

  return { calls };
}

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

export function renderRecordsRegister(
  initialPath = `/projects/${PROJECT_ID}/records`,
  options: {
    announce?: (message: string) => void;
    navigate?: (href: string) => void;
    projectId?: string;
  } = {},
) {
  window.history.pushState({}, "", initialPath);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const navigations: string[] = [];
  let navigateFunction: NavigateFunction | null = null;
  const bridge: ShellBridge = {
    runtime: {
      getApiClient: () => Promise.reject(new Error("not used")),
      loadFeatureFactory: () => Promise.reject(new Error("not used")),
    },
    navigate: (href, navigateOptions) => {
      navigations.push(href);
      if (options.navigate) {
        options.navigate(href);
        return;
      }
      if (!navigateFunction) throw new Error("Navigation is not ready.");
      void navigateFunction(href, { replace: navigateOptions?.replace });
    },
    announce: options.announce ?? (() => undefined),
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
        <ShellProvider value={bridge}>
          <RecordsRegisterFeature projectId={options.projectId ?? PROJECT_ID} />
        </ShellProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );

  return { ...result, queryClient, navigations };
}
