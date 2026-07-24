/*
 * Test harness for the native RFI register feature (UI-5). Renders
 * `RfiRegisterFeature` inside a real `<BrowserRouter>` (so `useSearchParams`
 * reads/writes the real URL, matching how the shell mounts it) with a
 * `ShellProvider` bridge and a `QueryClient`, and installs a fetch mock for
 * the `/api/v2/projects/:id/rfis` read/write endpoints this feature calls.
 *
 * Not a test file itself (no `.test.` in its name), so Vitest does not collect
 * it directly; every consuming test file still needs its own
 * `// @vitest-environment happy-dom` docblock.
 */

import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  BrowserRouter,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { RfiRegisterFeature } from "../../src/ui/features/rfis/RfiRegisterFeature";
import { ShellProvider, type ShellBridge } from "../../src/ui/app/ShellContext";
import type { ProjectRfisReadModel } from "../../src/ui/features/rfis/types";

export interface FakeResponseInit {
  status?: number;
  requestId?: string;
}

export function jsonResponse(
  body: unknown,
  init: FakeResponseInit = {},
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.requestId) headers.set("x-request-id", init.requestId);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export const CONTACT = {
  id: "contact-1",
  name: "Alex Architect",
  companyName: "Design Co",
};

export function rfi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rfi-1",
    rfiNumber: null,
    legacyReference: null,
    status: "draft",
    subject: "Door clearance",
    question: "Confirm the clear opening.",
    contractorSuggestion: "Use the alternate frame.",
    drawingReferences: "A-501",
    specificationReferences: "08 11 13",
    responsiblePartyId: CONTACT.id,
    responsibleParty: CONTACT.name,
    responsiblePartyLegacyText: null,
    submittedBy: null,
    requestedResponseDate: "2026-07-30",
    issuedAt: null,
    responseReceivedAt: null,
    latestResponse: null,
    attachmentCount: 0,
    isOverdue: false,
    dueSoon: true,
    lockVersion: 1,
    draftRevisionId: "rev-1",
    issuanceReconciliationState: "not_issued",
    createdAt: "2026-07-20T12:00:00Z",
    updatedAt: "2026-07-22T12:00:00Z",
    capabilities: { updateDraft: true },
    ...overrides,
  };
}

export interface RfiRegisterFetchConfig {
  projectId?: string;
  rows?: ReturnType<typeof rfi>[];
  responsibleContacts?: (typeof CONTACT)[];
  capabilities?: { createRfi: boolean };
  /** Called for PATCH /rfis/:id -- return a Response. */
  onUpdate?: (
    rfiId: string,
    body: Record<string, unknown>,
  ) => Response | Promise<Response>;
  /** Called for POST /rfis -- return a Response. */
  onCreate?: (body: Record<string, unknown>) => Response;
  /** Rows returned by a *second and later* GET (e.g. after a conflict refetch). */
  reloadRows?: ReturnType<typeof rfi>[];
}

export function installRfiFetch(config: RfiRegisterFetchConfig = {}) {
  const projectId = config.projectId ?? "project-1";
  const rows = config.rows ?? [rfi()];
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let getCount = 0;

  function readModel(): ProjectRfisReadModel {
    const useReload = getCount > 1 && config.reloadRows;
    return {
      project: {
        id: projectId,
        projectNumber: "P-001",
        name: "Library",
        status: "active",
      },
      responsibleContacts: config.responsibleContacts ?? [CONTACT],
      rfis: (useReload
        ? config.reloadRows
        : rows) as ProjectRfisReadModel["rfis"],
      capabilities: config.capabilities ?? { createRfi: true },
    };
  }

  const fetchMock = (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = (init?.method || "GET").toUpperCase();
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, body });

    const listPath = `/api/v2/projects/${projectId}/rfis`;
    if (method === "GET" && url.endsWith(listPath)) {
      getCount += 1;
      return Promise.resolve(jsonResponse({ data: readModel() }));
    }
    if (method === "POST" && url.endsWith(listPath)) {
      if (config.onCreate) return Promise.resolve(config.onCreate(body ?? {}));
      return Promise.resolve(
        jsonResponse({
          data: {
            id: "rfi-new",
            rfiNumber: null,
            legacyReference: null,
            status: "draft",
            subject: "Untitled RFI",
            question: "Describe the question",
            contractorSuggestion: null,
            drawingReferences: null,
            specificationReferences: null,
            responsiblePartyId: null,
            responsibleParty: null,
            responsiblePartyLegacyText: null,
            submittedBy: null,
            requestedResponseDate: null,
            issuedAt: null,
            responseReceivedAt: null,
            lockVersion: 1,
            draftRevisionId: "rev-new",
            issuanceReconciliationState: "not_issued",
            createdAt: "2026-07-24T00:00:00Z",
            updatedAt: "2026-07-24T00:00:00Z",
            ...body,
          },
        }),
      );
    }
    const patchMatch = new RegExp(`${listPath}/([^/]+)$`).exec(url);
    if (method === "PATCH" && patchMatch) {
      const rfiId = patchMatch[1];
      if (config.onUpdate)
        return Promise.resolve(config.onUpdate(rfiId, body ?? {}));
      return Promise.resolve(
        jsonResponse({ data: { ...body, lockVersion: 2 } }),
      );
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };

  globalThis.fetch = fetchMock;
  return { calls };
}

function NavigationCapture({
  onReady,
}: {
  onReady: (navigate: NavigateFunction) => void;
}) {
  const navigate = useNavigate();
  const ref = useRef(onReady);
  ref.current = onReady;
  useEffect(() => {
    ref.current(navigate);
  }, [navigate]);
  return null;
}

export function renderRfiRegister(
  initialPath = "/projects/project-1/rfis",
  options: { projectId?: string; announce?: (message: string) => void } = {},
) {
  window.history.pushState({}, "", initialPath);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const announce = options.announce ?? (() => undefined);
  let navigateFn: NavigateFunction | null = null;

  const bridge: ShellBridge = {
    runtime: {
      getApiClient: () => Promise.reject(new Error("not used")),
      loadFeatureFactory: () => Promise.reject(new Error("not used")),
    },
    navigate: (href) => {
      if (!navigateFn) throw new Error("Navigation is not ready yet.");
      void navigateFn(href);
    },
    announce,
    getSession: () => ({ status: "ready", data: null, error: null }),
    requestHeadingFocus: () => undefined,
  };

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationCapture
          onReady={(navigate) => {
            navigateFn = navigate;
          }}
        />
        <ShellProvider value={bridge}>
          <RfiRegisterFeature projectId={options.projectId ?? "project-1"} />
        </ShellProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );

  return { ...utils, queryClient };
}
