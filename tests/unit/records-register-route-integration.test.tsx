// @vitest-environment happy-dom
/*
 * UI-6B route ownership: `/projects/:projectId/records` is native React and
 * mounts only after the shell has confirmed project access, while the Record
 * and Revision detail routes stay on the compatibility bridge until UI-7.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
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
import { record } from "../helpers/records-register-harness";

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

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
          container.innerHTML = `<h2>LEGACY:${kind}</h2>`;
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

function url(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const PROJECT = {
  id: "project-1",
  name: "Riverside Tower",
  projectNumber: "24-001",
  status: "active",
};

function installShellFetch(
  options: { recordsStatus?: number; recordsCalls?: string[] } = {},
) {
  globalThis.fetch = (input: string | URL | Request) => {
    const target = url(input);
    if (target.includes("/api/v2/session"))
      return Promise.resolve(READY_SESSION());
    if (/\/api\/v2\/projects\/[^/?]+\/records/.test(target)) {
      options.recordsCalls?.push(target);
      if (options.recordsStatus) {
        return Promise.resolve(
          jsonResponse(
            { error: { code: "DENIED" } },
            {
              status: options.recordsStatus,
            },
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({
          data: {
            records: [record()],
            capabilities: { createRecord: true },
          },
        }),
      );
    }
    if (/\/api\/v2\/projects\/([^/?]+)$/.test(target)) {
      return Promise.resolve(jsonResponse({ data: PROJECT }));
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };
}

describe("UI-6B Document Register route wiring", () => {
  it("mounts the native feature and never loads the legacy records controller", async () => {
    const { runtime, factoryCalls } = makeRuntime();
    installShellFetch();

    renderShellWithNavigation("/projects/project-1/records", runtime);

    await waitFor(() => {
      expect(document.querySelector(".records-register-page")).not.toBeNull();
    });
    expect(document.querySelector('[data-feature="records"]')).toBeNull();
    expect(factoryCalls).not.toContain("records");
  });

  it("keeps the shell-owned project header and Documents tab", async () => {
    const { runtime } = makeRuntime();
    installShellFetch();

    renderShellWithNavigation("/projects/project-1/records", runtime);

    await waitFor(() => {
      expect(document.querySelector(".records-register-page")).not.toBeNull();
    });
    // Exactly one page heading: the shell's project <h1>. The register header
    // must not introduce a second one.
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    const tab = [...document.querySelectorAll("a")].find(
      (link) => link.textContent === "Documents",
    );
    expect(tab?.getAttribute("aria-current")).toBe("page");
  });

  it("requests Records only after project access is confirmed", async () => {
    const { runtime } = makeRuntime();
    const recordsCalls: string[] = [];
    let releaseProject: (value: Response) => void = () => undefined;
    globalThis.fetch = (input: string | URL | Request) => {
      const target = url(input);
      if (target.includes("/api/v2/session"))
        return Promise.resolve(READY_SESSION());
      if (/\/api\/v2\/projects\/[^/?]+\/records/.test(target)) {
        recordsCalls.push(target);
        return Promise.resolve(
          jsonResponse({
            data: { records: [], capabilities: { createRecord: false } },
          }),
        );
      }
      if (/\/api\/v2\/projects\/([^/?]+)$/.test(target)) {
        return new Promise<Response>((resolve) => {
          releaseProject = resolve;
        });
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };

    renderShellWithNavigation("/projects/project-1/records", runtime);
    await waitFor(() => {
      expect(document.body.textContent).toContain("Loading project");
    });
    expect(recordsCalls).toHaveLength(0);

    releaseProject(jsonResponse({ data: PROJECT }));
    await waitFor(() => {
      expect(recordsCalls.length).toBeGreaterThan(0);
    });
  });

  it("does not render the register on the Record and Revision detail routes", async () => {
    // Those routes became native in UI-7 and have their own coverage in
    // tests/unit/workspace-route-integration.test.tsx. What this suite still
    // owns is that the Document Register never leaks onto them.
    for (const path of [
      "/projects/project-1/records/record-1",
      "/projects/project-1/records/record-1/revisions/revision-1",
    ]) {
      const { runtime, factoryCalls } = makeRuntime();
      installShellFetch();
      renderShellWithNavigation(path, runtime);
      await waitFor(() => {
        expect(document.querySelector(".project-route-content")).not.toBeNull();
      });
      expect(document.querySelector(".records-register-page")).toBeNull();
      expect(factoryCalls).not.toContain("records");
      cleanup();
    }
  });
});
