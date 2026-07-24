// @vitest-environment happy-dom
/*
 * Compatibility-module loading failures. LegacyFeatureMount must catch a
 * getApiClient()/loadFeatureFactory() rejection (e.g. a transient failure
 * importing a served public/*-view.js module) and show a shared, accessible
 * error surface with a Retry action instead of leaving an empty feature area;
 * a retry must be able to recover; and no controller may be created for a
 * feature the user has already navigated away from while it was loading.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import {
  installFetch,
  READY_PROJECT,
  READY_SESSION,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";

function makeFlakyRuntime() {
  let apiShouldFail = false;
  let factoryShouldFail = false;
  let apiAttempts = 0;
  let factoryAttempts = 0;
  const mountedKinds: string[] = [];

  const apiClient: LegacyApiClient = {
    request: () =>
      Promise.resolve({ data: undefined, requestId: "", status: 200 }),
  };

  const runtime: ShellRuntime = {
    getApiClient: () => {
      apiAttempts += 1;
      if (apiShouldFail)
        return Promise.reject(new Error("network unavailable"));
      return Promise.resolve(apiClient);
    },
    loadFeatureFactory: (kind) => {
      factoryAttempts += 1;
      if (factoryShouldFail) {
        return Promise.reject(new Error(`${kind}-view.js failed to import`));
      }
      return Promise.resolve((deps: FeatureControllerDeps) => ({
        mount(container: HTMLElement) {
          mountedKinds.push(kind);
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

  return {
    runtime,
    mountedKinds,
    setApiShouldFail: (value: boolean) => {
      apiShouldFail = value;
    },
    setFactoryShouldFail: (value: boolean) => {
      factoryShouldFail = value;
    },
    get apiAttempts() {
      return apiAttempts;
    },
    get factoryAttempts() {
      return factoryAttempts;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Compatibility-module loading failure handling", () => {
  it("shows the shared error surface when the feature factory import rejects, and recovers on retry", async () => {
    installFetch({
      session: () => READY_SESSION(),
      project: READY_PROJECT,
    });
    const harness = makeFlakyRuntime();
    harness.setFactoryShouldFail(true);

    renderShellWithNavigation("/dashboard", harness.runtime);

    await screen.findByRole("heading", {
      name: "This section could not be loaded",
    });
    expect(harness.mountedKinds).toEqual([]);

    harness.setFactoryShouldFail(false);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("FEATURE:dashboard");
    expect(harness.mountedKinds).toEqual(["dashboard"]);
  });

  it("shows the shared error surface when the API client import rejects, and recovers on retry", async () => {
    installFetch({
      session: () => READY_SESSION(),
      project: READY_PROJECT,
    });
    const harness = makeFlakyRuntime();
    harness.setApiShouldFail(true);

    renderShellWithNavigation("/projects/p1/records", harness.runtime);

    await screen.findByRole("heading", {
      name: "This section could not be loaded",
    });
    const attemptsBeforeRetry = harness.apiAttempts;

    harness.setApiShouldFail(false);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("FEATURE:records");
    expect(harness.apiAttempts).toBeGreaterThan(attemptsBeforeRetry);
  });

  it("does not mount an abandoned feature when the user navigates away while it is loading", async () => {
    installFetch({
      session: () => READY_SESSION(),
      project: READY_PROJECT,
    });
    const pendingFactoryResolve: { current: (() => void) | null } = {
      current: null,
    };
    const mountedKinds: string[] = [];
    const runtime: ShellRuntime = {
      getApiClient: () =>
        Promise.resolve({
          request: () =>
            Promise.resolve({ data: undefined, requestId: "", status: 200 }),
        } as LegacyApiClient),
      loadFeatureFactory: (kind) => {
        if (kind === "dashboard") {
          return new Promise((resolve) => {
            pendingFactoryResolve.current = () => {
              resolve((deps: FeatureControllerDeps) => ({
                mount(container: HTMLElement) {
                  mountedKinds.push(kind);
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
            };
          });
        }
        return Promise.resolve((deps: FeatureControllerDeps) => ({
          mount(container: HTMLElement) {
            mountedKinds.push(kind);
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

    const shell = renderShellWithNavigation("/dashboard", runtime);
    // The dashboard's factory promise is still pending; navigate away before
    // it resolves.
    shell.goTo("/projects/p1/records");
    await screen.findByText("FEATURE:records");

    // Now let the abandoned dashboard factory resolve.
    pendingFactoryResolve.current?.();
    await waitFor(() => {
      // Give any (incorrect) mount a chance to happen before asserting it did
      // not.
      expect(mountedKinds).toContain("records");
    });
    expect(mountedKinds).not.toContain("dashboard");
    expect(screen.getByText("FEATURE:records")).toBeInTheDocument();
  });

  it("gives the load error and retry action accessible labels", async () => {
    installFetch({ session: () => READY_SESSION() });
    const harness = makeFlakyRuntime();
    harness.setFactoryShouldFail(true);

    renderShellWithNavigation("/dashboard", harness.runtime);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This section could not be loaded");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toBeInTheDocument();
    expect(alert).toContainElement(retry);
  });
});
