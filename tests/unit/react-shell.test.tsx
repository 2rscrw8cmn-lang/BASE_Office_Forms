// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation, MemoryRouter } from "react-router";
import {
  AppProviders,
  ShellRoutes,
  createQueryClient,
} from "../../src/ui/app/App";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";

interface FakeResponseInit {
  status?: number;
  requestId?: string;
}

function jsonResponse(body: unknown, init: FakeResponseInit = {}): Response {
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

/** Throwing DOM lookup so tests never rely on non-null assertions. */
function el(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`Expected to find ${selector}.`);
  return found;
}

interface FetchConfig {
  session: () => Response;
  projects?: () => Response;
  project?: (id: string) => Response;
}

function installFetch(config: FetchConfig) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes("/api/v2/session"))
      return Promise.resolve(config.session());
    if (/\/api\/v2\/projects(?:\?|$)/.test(url) && config.projects) {
      return Promise.resolve(config.projects());
    }
    const match = /\/api\/v2\/projects\/([^/?]+)$/.exec(url);
    if (match && config.project) {
      return Promise.resolve(config.project(decodeURIComponent(match[1])));
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  });
  globalThis.fetch = fetchMock;
  return { calls, fetchMock };
}

interface MountRecord {
  kind: FeatureKind;
  deps: FeatureControllerDeps;
}

function makeRuntime() {
  const mounts: MountRecord[] = [];
  const factoryCalls: FeatureKind[] = [];
  const apiClient: LegacyApiClient = {
    request: () =>
      Promise.resolve({ data: undefined, requestId: "", status: 200 }),
  };
  const runtime: ShellRuntime = {
    getApiClient: () => Promise.resolve(apiClient),
    loadFeatureFactory: (kind) => {
      factoryCalls.push(kind);
      return Promise.resolve((deps: FeatureControllerDeps) => {
        mounts.push({ kind, deps });
        return {
          mount(container: HTMLElement) {
            container.innerHTML = `<h1 id="page-title" tabindex="-1">FEATURE:${kind}</h1>`;
          },
          reload() {
            deps.requestRender();
          },
          destroy() {
            /* no-op */
          },
        };
      });
    },
  };
  return { runtime, mounts, factoryCalls };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function renderShell(path: string, runtime: ShellRuntime) {
  return render(
    <AppProviders queryClient={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ShellRoutes runtime={runtime} />
        <LocationProbe />
      </MemoryRouter>
    </AppProviders>,
  );
}

const READY_SESSION = (role = "project_manager") =>
  jsonResponse({
    data: {
      organization: { name: "BASE Construction" },
      membership: { role },
    },
  });

const READY_PROJECT = (id: string) =>
  jsonResponse({
    data: {
      id,
      name: "Riverside Tower",
      projectNumber: "24-001",
      status: "active",
    },
  });

const READY_PROJECTS = () =>
  jsonResponse({
    data: [],
    meta: {
      requestId: "req-projects",
      capabilities: { createProject: false },
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("React application shell", () => {
  describe("canonical redirects preserve query and hash", () => {
    it("redirects / to /dashboard", async () => {
      const { runtime } = makeRuntime();
      installFetch({ session: () => READY_SESSION() });
      renderShell("/", runtime);
      await screen.findByText("FEATURE:dashboard");
      expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    });

    it("redirects /projects/:id to overview keeping search and hash", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        project: READY_PROJECT,
      });
      renderShell("/projects/p1?focus=1#files", runtime);
      await screen.findByText("FEATURE:overview");
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/projects/p1/overview?focus=1#files",
      );
    });
  });

  describe("global navigation and administration", () => {
    it("marks the active global section and shows Administration for org_admin", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION("org_admin"),
        projects: READY_PROJECTS,
      });
      renderShell("/dashboard", runtime);
      await screen.findByText("FEATURE:dashboard");
      const desktopNav = el(".app-navigation-desktop");
      const dashboardLink = within(desktopNav).getByRole("link", {
        name: "Dashboard",
      });
      expect(dashboardLink).toHaveAttribute("aria-current", "page");
      expect(
        within(desktopNav).getByRole("link", {
          name: "Administration",
        }),
      ).toBeInTheDocument();
    });

    it("hides Administration for non-admin roles", async () => {
      const { runtime } = makeRuntime();
      installFetch({ session: () => READY_SESSION("viewer") });
      renderShell("/dashboard", runtime);
      await screen.findByText("FEATURE:dashboard");
      const desktopNav = el(".app-navigation-desktop");
      expect(
        within(desktopNav).queryByRole("link", {
          name: "Administration",
        }),
      ).not.toBeInTheDocument();
    });

    it("shows a generic not-found for unauthorized /admin", async () => {
      const { runtime, factoryCalls } = makeRuntime();
      installFetch({ session: () => READY_SESSION("viewer") });
      renderShell("/admin", runtime);
      await screen.findByRole("heading", { name: "Page not found" });
      expect(factoryCalls).toHaveLength(0);
    });
  });

  describe("project context and tabs", () => {
    it("renders real project identity and selects the parent tab for descendants", async () => {
      const { runtime, mounts } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        project: READY_PROJECT,
      });
      renderShell("/projects/p1/records/r1", runtime);
      await screen.findByText("FEATURE:record-detail");

      expect(
        screen.getByRole("heading", { name: "Riverside Tower" }),
      ).toBeInTheDocument();
      const tabs = el(".project-tabs");
      const documentsTab = within(tabs).getByRole("link", {
        name: "Documents",
      });
      expect(documentsTab).toHaveAttribute("aria-current", "page");

      const record = mounts.find((m) => m.kind === "record-detail");
      expect(record?.deps.projectId).toBe("p1");
      expect(record?.deps.recordId).toBe("r1");
    });

    it("shows a generic not-found for a 403 project", async () => {
      const { runtime, factoryCalls } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        project: () => jsonResponse({}, { status: 403 }),
      });
      renderShell("/projects/secret/overview", runtime);
      await screen.findByRole("heading", { name: "Project not found" });
      expect(factoryCalls).toHaveLength(0);
    });

    it("shows a generic not-found for a 404 project", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        project: () => jsonResponse({}, { status: 404 }),
      });
      renderShell("/projects/missing/overview", runtime);
      await screen.findByRole("heading", { name: "Project not found" });
    });

    it("shows a retryable error with the request id for a failed project load", async () => {
      const { runtime } = makeRuntime();
      let attempt = 0;
      installFetch({
        session: () => READY_SESSION(),
        project: (id) => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse({}, { status: 500, requestId: "req-42" })
            : READY_PROJECT(id);
        },
      });
      renderShell("/projects/p1/overview", runtime);
      await screen.findByRole("heading", {
        name: "Project context unavailable",
      });
      expect(screen.getByText("req-42")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("FEATURE:overview");
    });
  });

  describe("session-first loading", () => {
    it("shows a loading state and issues no feature or project request until the session resolves", async () => {
      const { runtime, factoryCalls } = makeRuntime();
      const { calls } = installFetch({
        // Session never resolves during the test.
        session: () => jsonResponse({}, { status: 200 }),
      });
      // Override with a pending session.
      globalThis.fetch = vi.fn((input: string | URL | Request) => {
        calls.push(requestUrl(input));
        return new Promise<Response>(() => {
          /* never resolves */
        });
      });

      renderShell("/projects/p1/overview", runtime);

      await waitFor(() => {
        expect(document.querySelector(".route-loading")).toBeInTheDocument();
      });
      expect(factoryCalls).toHaveLength(0);
      expect(calls.some((url) => url.includes("/api/v2/projects/"))).toBe(
        false,
      );
    });

    it("surfaces a session error with code and request id, then recovers on retry", async () => {
      const { runtime } = makeRuntime();
      let attempt = 0;
      globalThis.fetch = vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input);
        if (url.includes("/api/v2/session")) {
          attempt += 1;
          return Promise.resolve(
            attempt === 1
              ? jsonResponse(
                  {
                    error: {
                      code: "AUTHENTICATION_UNAVAILABLE",
                      message: "No session.",
                    },
                  },
                  { status: 503, requestId: "req-7" },
                )
              : READY_SESSION(),
          );
        }
        return Promise.resolve(jsonResponse({}, { status: 404 }));
      });

      renderShell("/dashboard", runtime);
      await screen.findByRole("heading", { name: "Session unavailable" });
      expect(
        screen.getByText("AUTHENTICATION_UNAVAILABLE"),
      ).toBeInTheDocument();
      expect(screen.getByText("req-7")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("FEATURE:dashboard");
    });
  });

  describe("unknown routes", () => {
    it("renders the shared not-found surface", async () => {
      const { runtime } = makeRuntime();
      installFetch({ session: () => READY_SESSION() });
      renderShell("/nope", runtime);
      await screen.findByRole("heading", { name: "Page not found" });
    });
  });

  describe("route focus and announcements", () => {
    it("moves focus to the heading and announces the route after navigation", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION("org_admin"),
        projects: READY_PROJECTS,
      });
      renderShell("/dashboard", runtime);
      await screen.findByText("FEATURE:dashboard");

      const projectsLink = within(el(".app-navigation-desktop")).getByRole(
        "link",
        { name: "Projects" },
      );
      await userEvent.click(projectsLink);

      await screen.findByRole("heading", { name: "Projects" });
      await waitFor(() => {
        expect(document.getElementById("page-title")).toHaveFocus();
      });
      expect(document.getElementById("route-announcer")).toHaveTextContent(
        "Projects loaded",
      );
    });
  });

  describe("mobile navigation drawer", () => {
    it("opens with focus in the drawer, traps and restores focus, and closes on Escape", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        projects: READY_PROJECTS,
      });
      renderShell("/dashboard", runtime);
      await screen.findByText("FEATURE:dashboard");

      const menuButton = screen.getByRole("button", {
        name: "Open navigation",
      });
      const drawer = el("#mobile-navigation");
      expect(drawer).toHaveAttribute("aria-hidden", "true");

      await userEvent.click(menuButton);
      expect(drawer).toHaveAttribute("aria-hidden", "false");
      expect(menuButton).toHaveAttribute("aria-expanded", "true");
      await waitFor(() => {
        expect(document.body.classList.contains("mobile-nav-open")).toBe(true);
      });
      const closeButton = within(drawer).getByRole("button", {
        name: "Close navigation",
      });
      expect(closeButton).toHaveFocus();

      await act(async () => {
        await userEvent.keyboard("{Escape}");
      });
      expect(drawer).toHaveAttribute("aria-hidden", "true");
      expect(menuButton).toHaveAttribute("aria-expanded", "false");
      expect(menuButton).toHaveFocus();
      expect(document.body.classList.contains("mobile-nav-open")).toBe(false);
    });

    it("closes the drawer and navigates when a drawer link is chosen", async () => {
      const { runtime } = makeRuntime();
      installFetch({
        session: () => READY_SESSION(),
        projects: READY_PROJECTS,
      });
      renderShell("/dashboard", runtime);
      await screen.findByText("FEATURE:dashboard");

      await userEvent.click(
        screen.getByRole("button", { name: "Open navigation" }),
      );
      const drawer = el("#mobile-navigation");
      const projectsLink = within(drawer).getByRole("link", {
        name: "Projects",
      });
      await userEvent.click(projectsLink);

      await screen.findByRole("heading", { name: "Projects" });
      expect(drawer).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByTestId("location")).toHaveTextContent("/projects");
    });
  });
});
