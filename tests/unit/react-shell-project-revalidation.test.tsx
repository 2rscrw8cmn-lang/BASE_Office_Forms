// @vitest-environment happy-dom
/*
 * Project-context authorization is never trusted indefinitely. These tests
 * prove: a meaningful navigation between routes in the same project
 * re-confirms project access with the server; a query-only navigation on the
 * same route does not (avoiding unnecessary repeated requests from ordinary
 * controller rerenders); a project that has since become inaccessible (403)
 * is shown as the generic not-found state and mounts no feature, even though
 * it was previously cached as ready; a retry after a failed revalidation
 * recovers; and no feature's own data request begins before the revalidated
 * project is confirmed ready.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";
import {
  el,
  installFetch,
  jsonResponse,
  READY_SESSION,
  requestUrl,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";

function makeRuntime() {
  const factoryCalls: FeatureKind[] = [];
  const apiClient: LegacyApiClient = {
    request: () =>
      Promise.resolve({ data: undefined, requestId: "", status: 200 }),
  };
  const runtime: ShellRuntime = {
    getApiClient: () => Promise.resolve(apiClient),
    loadFeatureFactory: (kind) => {
      factoryCalls.push(kind);
      return Promise.resolve((deps: FeatureControllerDeps) => ({
        mount(container: HTMLElement) {
          container.innerHTML = `<h1 id="page-title" tabindex="-1">FEATURE:${kind}</h1>`;
        },
        reload() {
          deps.requestRender();
          return Promise.resolve();
        },
        destroy() {
          /* no-op */
        },
      }));
    },
  };
  return { runtime, factoryCalls };
}

const READY_PROJECT = (id: string) =>
  jsonResponse({
    data: {
      id,
      name: "Riverside Tower",
      projectNumber: "24-001",
      status: "active",
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Project-context authorization caching and revalidation", () => {
  it("revalidates project context when navigating between routes in the same project", async () => {
    let projectCallCount = 0;
    installFetch({
      session: () => READY_SESSION(),
      project: (id) => {
        projectCallCount += 1;
        return READY_PROJECT(id);
      },
    });
    const { runtime } = makeRuntime();
    const shell = renderShellWithNavigation("/projects/p1/overview", runtime);

    await screen.findByText("FEATURE:overview");
    expect(projectCallCount).toBe(1);

    shell.goTo("/projects/p1/records/r1");
    await screen.findByText("FEATURE:record-detail");
    expect(projectCallCount).toBe(2);
  });

  it("does not re-request the project for a query-only navigation on the same route", async () => {
    let projectCallCount = 0;
    installFetch({
      session: () => READY_SESSION(),
      project: (id) => {
        projectCallCount += 1;
        return READY_PROJECT(id);
      },
    });
    const { runtime } = makeRuntime();
    const shell = renderShellWithNavigation(
      "/projects/p1/records/r1?status=open",
      runtime,
    );
    await screen.findByText("FEATURE:record-detail");
    expect(projectCallCount).toBe(1);

    shell.goTo("/projects/p1/records/r1?status=closed");
    await waitFor(() => {
      expect(el(".feature-view")).toBeInTheDocument();
    });
    expect(projectCallCount).toBe(1);
  });

  it("shows generic not-found and mounts no feature when a previously-ready project has since become 403", async () => {
    let projectCallCount = 0;
    installFetch({
      session: () => READY_SESSION(),
      project: (id) => {
        projectCallCount += 1;
        return projectCallCount === 1
          ? READY_PROJECT(id)
          : jsonResponse({}, { status: 403 });
      },
    });
    const { runtime, factoryCalls } = makeRuntime();
    const shell = renderShellWithNavigation("/projects/p1/overview", runtime);

    await screen.findByText("FEATURE:overview");
    expect(factoryCalls).toEqual(["overview"]);

    shell.goTo("/dashboard");
    await screen.findByText("FEATURE:dashboard");

    shell.goTo("/projects/p1/overview");
    await screen.findByRole("heading", { name: "Project not found" });

    expect(projectCallCount).toBe(2);
    // No second "overview" feature mount for the now-inaccessible project.
    expect(factoryCalls.filter((kind) => kind === "overview")).toEqual([
      "overview",
    ]);
  });

  it("recovers via retry after a failed revalidation", async () => {
    let projectCallCount = 0;
    installFetch({
      session: () => READY_SESSION(),
      project: (id) => {
        projectCallCount += 1;
        if (projectCallCount === 2) {
          return jsonResponse({}, { status: 500, requestId: "req-99" });
        }
        return READY_PROJECT(id);
      },
    });
    const { runtime } = makeRuntime();
    const shell = renderShellWithNavigation("/projects/p1/overview", runtime);
    await screen.findByText("FEATURE:overview");

    shell.goTo("/projects/p1/records/r1");
    await screen.findByRole("heading", { name: "Project context unavailable" });
    expect(screen.getByText("req-99")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("FEATURE:record-detail");
  });

  it("does not begin the destination feature's request before the revalidated project is ready", async () => {
    installFetch({ session: () => READY_SESSION() });
    const pendingProjectResolve: {
      current: ((response: Response) => void) | null;
    } = { current: null };
    const { runtime, factoryCalls } = makeRuntime();

    const baseFetch = globalThis.fetch;
    let projectCallCount = 0;
    globalThis.fetch = (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (/\/api\/v2\/projects\/[^/?]+$/.test(url)) {
        projectCallCount += 1;
        if (projectCallCount === 1) {
          return Promise.resolve(READY_PROJECT("p1"));
        }
        return new Promise<Response>((resolve) => {
          pendingProjectResolve.current = resolve;
        });
      }
      return baseFetch(input);
    };

    const shell = renderShellWithNavigation("/projects/p1/overview", runtime);
    await screen.findByText("FEATURE:overview");
    expect(factoryCalls).toEqual(["overview"]);

    shell.goTo("/projects/p1/records/r1");
    await waitFor(() => {
      expect(document.querySelector(".route-loading")).toBeInTheDocument();
    });
    // The project revalidation is still pending: no "record-detail" feature request
    // has begun.
    expect(factoryCalls).toEqual(["overview"]);

    pendingProjectResolve.current?.(READY_PROJECT("p1"));
    await screen.findByText("FEATURE:record-detail");
    expect(factoryCalls).toEqual(["overview", "record-detail"]);
  });
});
