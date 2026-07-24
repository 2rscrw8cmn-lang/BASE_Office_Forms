// @vitest-environment happy-dom
/*
 * Proves the UI-5 routing boundary: `project-rfis`
 * (/projects/:projectId/rfis) renders the native React
 * `RfiRegisterFeature` directly from the real shell, while `rfi-workspace`
 * (/projects/:projectId/rfis/:rfiId) still mounts through
 * `LegacyFeatureMount` (compatibility bridge to public/rfi-workspace-view.js),
 * unchanged, per the binding UI-5 scope.
 */
import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";
import {
  installFetch,
  jsonResponse,
  READY_PROJECT,
  READY_SESSION,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";
import { CONTACT, rfi } from "../helpers/rfi-register-harness";

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
          container.innerHTML = `<h1 id="page-title" tabindex="-1">LEGACY:${kind}</h1>`;
        },
        reload() {
          deps.requestRender();
        },
        destroy() {
          /* no-op */
        },
      }));
    },
  };
  return { runtime, factoryCalls };
}

describe("UI-5 route wiring", () => {
  it("mounts the native React register for project-rfis and never loads the legacy rfis-view factory", async () => {
    const { runtime, factoryCalls } = makeRuntime();
    installFetch({
      session: READY_SESSION,
      project: READY_PROJECT,
    });
    const projectRfisResponse = () =>
      jsonResponse({
        data: {
          project: {
            id: "project-1",
            projectNumber: "24-001",
            name: "Riverside Tower",
            status: "active",
          },
          responsibleContacts: [CONTACT],
          rfis: [rfi()],
          capabilities: { createRfi: true },
        },
      });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/rfis")) return Promise.resolve(projectRfisResponse());
      return originalFetch(input, init);
    };

    renderShellWithNavigation("/projects/project-1/rfis", runtime);

    await waitFor(() => {
      expect(document.querySelector(".rfi-register-page")).not.toBeNull();
    });
    expect(document.querySelector('[data-feature="rfis"]')).toBeNull();
    expect(factoryCalls).not.toContain("rfis");
  });

  it("still mounts the RFI workspace through LegacyFeatureMount", async () => {
    const { runtime, factoryCalls } = makeRuntime();
    installFetch({ session: READY_SESSION, project: READY_PROJECT });
    renderShellWithNavigation("/projects/project-1/rfis/rfi-1", runtime);

    await waitFor(() => {
      expect(
        document.querySelector('[data-feature="rfi-workspace"]'),
      ).not.toBeNull();
    });
    expect(factoryCalls).toContain("rfi-workspace");
  });
});
