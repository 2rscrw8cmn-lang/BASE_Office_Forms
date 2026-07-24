// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";
import {
  jsonResponse,
  READY_SESSION,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";
import { project } from "../helpers/projects-register-harness";

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
          container.innerHTML = `<h1 id="page-title">LEGACY:${kind}</h1>`;
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

describe("UI-6A Projects route wiring", () => {
  it("mounts the native Projects feature and never loads the legacy projects controller", async () => {
    const { runtime, factoryCalls } = makeRuntime();
    globalThis.fetch = (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/v2/session"))
        return Promise.resolve(READY_SESSION());
      if (url.endsWith("/api/v2/projects")) {
        return Promise.resolve(
          jsonResponse({
            data: [project()],
            meta: {
              capabilities: { createProject: true },
              requestId: "req-projects",
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };

    renderShellWithNavigation("/projects", runtime);

    await waitFor(() => {
      expect(document.querySelector(".projects-register-page")).not.toBeNull();
    });
    expect(document.querySelector('[data-feature="projects"]')).toBeNull();
    expect(factoryCalls).not.toContain("projects");
  });

  it("keeps Project Overview compatibility-mounted as the rollback boundary", async () => {
    const { runtime, factoryCalls } = makeRuntime();
    globalThis.fetch = (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/v2/session"))
        return Promise.resolve(READY_SESSION());
      if (/\/api\/v2\/projects\/project-1$/.test(url)) {
        return Promise.resolve(jsonResponse({ data: project() }));
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };
    renderShellWithNavigation("/projects/project-1/overview", runtime);
    await waitFor(() => {
      expect(
        document.querySelector('[data-feature="overview"]'),
      ).not.toBeNull();
    });
    expect(factoryCalls).toContain("overview");
  });
});
