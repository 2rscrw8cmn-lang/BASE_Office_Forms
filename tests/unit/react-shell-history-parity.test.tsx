// @vitest-environment happy-dom
/*
 * Same-route URL-history parity for compatibility-mounted legacy feature
 * controllers. Such controllers store view state through
 * window.history.pushState/replaceState issued directly (bypassing the
 * router) and reread that state from window.location.search inside mount().
 * When pathname/search/hash changes through browser Back/Forward or an actual
 * React Router navigation while the feature descriptor stays the same,
 * LegacyFeatureMount must remount the EXISTING controller into the SAME
 * container (so it rereads the URL) without recreating it (no new factory
 * call) or reloading it (no new data fetch).
 *
 * Screens leave this compatibility path one phase at a time: the RFI register
 * (`project-rfis`) in UI-5, `/projects` in UI-6A, the Document Register
 * (`project-records`) in UI-6B, and the Record, Revision, and RFI detail
 * workspaces in UI-7. Each has its own native coverage -- see
 * `tests/unit/records-register-react.test.tsx`,
 * `tests/unit/record-workspace-react.test.tsx`, and
 * `tests/unit/workspace-route-integration.test.tsx`.
 *
 * `project-overview` and `dashboard` are the compatibility-mounted screens that
 * remain, so these suites exercise the shell's remount mechanism through them.
 * The mechanism itself is unchanged and still guards every controller that has
 * not been migrated yet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";
import {
  installFetch,
  READY_SESSION,
  READY_PROJECT,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";

function urlAwareRuntime() {
  const factoryCalls: FeatureKind[] = [];
  let reloadCallCount = 0;
  let mountCallCount = 0;
  let destroyCallCount = 0;
  const mountedParams: string[] = [];

  const apiClient: LegacyApiClient = {
    request: () =>
      Promise.resolve({ data: undefined, requestId: "", status: 200 }),
  };

  const runtime: ShellRuntime = {
    getApiClient: () => Promise.resolve(apiClient),
    loadFeatureFactory: (loadedKind) => {
      factoryCalls.push(loadedKind);
      return Promise.resolve((deps: FeatureControllerDeps) => ({
        mount(container: HTMLElement) {
          mountCallCount += 1;
          const status =
            new URLSearchParams(window.location.search).get("status") ?? "none";
          const hash = window.location.hash || "none";
          mountedParams.push(`status=${status} hash=${hash}`);
          container.innerHTML = `<h1 id="page-title" tabindex="-1">FEATURE:${loadedKind} status=${status} hash=${hash} mount=${String(mountCallCount)}</h1>`;
        },
        reload() {
          reloadCallCount += 1;
          deps.requestRender();
          return Promise.resolve();
        },
        destroy() {
          destroyCallCount += 1;
        },
      }));
    },
  };

  return {
    runtime,
    factoryCalls,
    mountedParams,
    get reloadCallCount() {
      return reloadCallCount;
    },
    get mountCallCount() {
      return mountCallCount;
    },
    get destroyCallCount() {
      return destroyCallCount;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Same-route URL-history parity for compatibility-mounted controllers", () => {
  it("remounts (not recreates) the Record detail controller across status=open -> status=draft -> Back", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const harness = urlAwareRuntime();
    const shell = renderShellWithNavigation(
      "/projects/p1/overview?status=open",
      harness.runtime,
    );

    await screen.findByText(/status=open/);
    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
    expect(harness.mountCallCount).toBe(1);

    shell.goTo("/projects/p1/overview?status=draft");
    await waitFor(() => {
      expect(screen.getByText(/status=draft/)).toBeInTheDocument();
    });
    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
    expect(harness.mountCallCount).toBe(2);
    expect(harness.destroyCallCount).toBe(0);

    shell.back();
    await waitFor(() => {
      expect(screen.getByText(/status=open/)).toBeInTheDocument();
    });
    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
    expect(harness.mountCallCount).toBe(3);
    expect(harness.destroyCallCount).toBe(0);
  });

  it("restores sort/filter query state after Back", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const harness = urlAwareRuntime();
    const shell = renderShellWithNavigation(
      "/projects/p1/overview?status=open&sort=updated",
      harness.runtime,
    );

    await waitFor(() => {
      expect(harness.mountedParams).toContain("status=open hash=none");
    });

    shell.goTo("/projects/p1/overview?status=closed&sort=number");
    await waitFor(() => {
      expect(harness.mountedParams).toContain("status=closed hash=none");
    });

    shell.back();
    await waitFor(() => {
      expect(harness.mountedParams.at(-1)).toBe("status=open hash=none");
    });
    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
  });

  it("remounts on a hash-only navigation", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const harness = urlAwareRuntime();
    const shell = renderShellWithNavigation(
      "/projects/p1/overview#a",
      harness.runtime,
    );

    await waitFor(() => {
      expect(harness.mountedParams).toContain("status=none hash=#a");
    });

    shell.goTo("/projects/p1/overview#b");
    await waitFor(() => {
      expect(harness.mountedParams).toContain("status=none hash=#b");
    });
    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
    expect(harness.destroyCallCount).toBe(0);
  });

  it("does not repeat the controller factory or reload across several query-only navigations", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const harness = urlAwareRuntime();
    const shell = renderShellWithNavigation(
      "/projects/p1/overview?status=open",
      harness.runtime,
    );
    await screen.findByText(/status=open/);

    for (const query of ["draft", "closed", "void", "open"]) {
      shell.goTo(`/projects/p1/overview?status=${query}`);
      await waitFor(() => {
        expect(
          screen.getByText(new RegExp(`status=${query}`)),
        ).toBeInTheDocument();
      });
    }

    expect(harness.factoryCalls).toEqual(["overview"]);
    expect(harness.reloadCallCount).toBe(1);
    expect(harness.mountCallCount).toBe(5); // 1 initial + 4 query-only remounts
    expect(harness.destroyCallCount).toBe(0);
  });

  it("still destroys the old controller on a genuine path navigation", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const overviewRuntime = urlAwareRuntime();
    const dashboardFactoryCalls: FeatureKind[] = [];
    const combinedRuntime: ShellRuntime = {
      getApiClient: overviewRuntime.runtime.getApiClient,
      loadFeatureFactory: (kind) => {
        if (kind === "dashboard") {
          dashboardFactoryCalls.push(kind);
          return Promise.resolve((deps: FeatureControllerDeps) => ({
            mount(container: HTMLElement) {
              container.innerHTML = `<h1 id="page-title" tabindex="-1">FEATURE:dashboard</h1>`;
            },
            reload() {
              deps.requestRender();
              return Promise.resolve();
            },
            destroy() {
              /* no-op */
            },
          }));
        }
        return overviewRuntime.runtime.loadFeatureFactory(kind);
      },
    };

    const shell = renderShellWithNavigation(
      "/projects/p1/overview?status=open",
      combinedRuntime,
    );
    await screen.findByText(/status=open/);
    expect(overviewRuntime.factoryCalls).toEqual(["overview"]);

    shell.goTo("/dashboard");
    await screen.findByText("FEATURE:dashboard");

    expect(overviewRuntime.destroyCallCount).toBe(1);
    expect(dashboardFactoryCalls).toEqual(["dashboard"]);
  });

  it("supports browser Back/Forward across two different feature routes", async () => {
    installFetch({ session: () => READY_SESSION(), project: READY_PROJECT });
    const overviewFactoryCalls: FeatureKind[] = [];
    const dashboardFactoryCalls: FeatureKind[] = [];
    const runtime: ShellRuntime = {
      getApiClient: () =>
        Promise.resolve({
          request: () =>
            Promise.resolve({ data: undefined, requestId: "", status: 200 }),
        } as LegacyApiClient),
      loadFeatureFactory: (kind) => {
        if (kind === "overview") overviewFactoryCalls.push(kind);
        if (kind === "dashboard") dashboardFactoryCalls.push(kind);
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

    const shell = renderShellWithNavigation("/projects/p1/overview", runtime);
    await screen.findByText("FEATURE:overview");

    shell.goTo("/dashboard");
    await screen.findByText("FEATURE:dashboard");

    shell.back();
    await screen.findByText("FEATURE:overview");

    shell.forward();
    await screen.findByText("FEATURE:dashboard");

    expect(overviewFactoryCalls.length).toBeGreaterThanOrEqual(2);
    expect(dashboardFactoryCalls.length).toBeGreaterThanOrEqual(2);
  });
});
