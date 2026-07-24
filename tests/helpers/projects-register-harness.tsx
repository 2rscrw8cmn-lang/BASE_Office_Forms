import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  BrowserRouter,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { ProjectsRegisterFeature } from "../../src/ui/features/projects/ProjectsRegisterFeature";
import { ShellProvider, type ShellBridge } from "../../src/ui/app/ShellContext";
import type { ProjectListItem } from "../../src/ui/features/projects/types";

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

export function project(
  overrides: Partial<ProjectListItem> = {},
): ProjectListItem {
  return {
    id: "project-1",
    projectNumber: "P-001",
    name: "Riverside Tower",
    status: "active",
    description: "Renovation",
    address: { city: "Orlando", region: "FL" },
    updatedAt: "2026-07-24T12:00:00Z",
    ...overrides,
  };
}

export interface ProjectsFetchConfig {
  rows?: ProjectListItem[];
  capability?: boolean;
  listResponses?: Array<Response | Promise<Response>>;
  onCreate?: (body: Record<string, unknown>) => Response | Promise<Response>;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installProjectsFetch(config: ProjectsFetchConfig = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let listIndex = 0;
  const rows = config.rows ?? [project()];

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body =
      init?.body && typeof init.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, body });

    if (!url.endsWith("/api/v2/projects")) {
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    }
    if (method === "GET") {
      const configured = config.listResponses?.[listIndex];
      listIndex += 1;
      if (configured) return Promise.resolve(configured);
      return Promise.resolve(
        jsonResponse({
          data: rows,
          meta: {
            requestId: "req-projects",
            capabilities: {
              createProject: config.capability ?? true,
            },
          },
        }),
      );
    }
    if (method === "POST") {
      if (config.onCreate) {
        return Promise.resolve(config.onCreate(body ?? {}));
      }
      return Promise.resolve(
        jsonResponse(
          {
            data: project({
              id: "project-new",
              projectNumber:
                typeof body?.projectNumber === "string"
                  ? body.projectNumber
                  : "",
              name: typeof body?.name === "string" ? body.name : "",
              status:
                typeof body?.status === "string"
                  ? (body.status as ProjectListItem["status"])
                  : "planning",
              description:
                typeof body?.description === "string" ? body.description : null,
              address:
                typeof body?.address === "object" && body.address !== null
                  ? (body.address as ProjectListItem["address"])
                  : { city: null, region: null },
            }),
          },
          { status: 201 },
        ),
      );
    }
    return Promise.resolve(jsonResponse({}, { status: 405 }));
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

export function renderProjectsRegister(
  initialPath = "/projects",
  options: { announce?: (message: string) => void } = {},
) {
  window.history.pushState({}, "", initialPath);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  let navigateFunction: NavigateFunction | null = null;
  const bridge: ShellBridge = {
    runtime: {
      getApiClient: () => Promise.reject(new Error("not used")),
      loadFeatureFactory: () => Promise.reject(new Error("not used")),
    },
    navigate: (href, navigateOptions) => {
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
          <ProjectsRegisterFeature />
        </ShellProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}
