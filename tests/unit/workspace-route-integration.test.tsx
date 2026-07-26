// @vitest-environment happy-dom
/*
 * UI-7 route ownership: the Record, Revision, and RFI detail routes render
 * their native React workspaces directly from the real shell, never through the
 * compatibility bridge, and only after the shell has confirmed project access.
 *
 * The legacy controllers and their `featureDescriptor` entries stay in the tree
 * as the documented rollback path -- removing the AppLayout branch restores
 * them -- which this suite also proves is still wired.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../../src/ui/app/types";
import type { FeatureKind } from "../../src/ui/app/routing";
import { featureDescriptor, resolveRoute } from "../../src/ui/app/routing";
import {
  jsonResponse,
  READY_SESSION,
  renderShellWithNavigation,
} from "../helpers/react-shell-harness";
import {
  recordWorkspace,
  revisionWorkspace,
  rfiWorkspace,
} from "../helpers/workspace-harness";

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

function installShellFetch(calls: string[] = []) {
  globalThis.fetch = (input: string | URL | Request) => {
    const target = url(input);
    calls.push(target);
    if (target.includes("/api/v2/session"))
      return Promise.resolve(READY_SESSION());
    if (/\/records\/[^/?]+\/revisions\/[^/?]+\/workspace$/.test(target)) {
      return Promise.resolve(jsonResponse({ data: revisionWorkspace() }));
    }
    if (/\/records\/[^/?]+\/workspace$/.test(target)) {
      return Promise.resolve(jsonResponse({ data: recordWorkspace() }));
    }
    if (/\/rfis\/[^/?]+\/workspace$/.test(target)) {
      return Promise.resolve(jsonResponse({ data: rfiWorkspace() }));
    }
    if (/\/api\/v2\/projects\/([^/?]+)$/.test(target)) {
      return Promise.resolve(jsonResponse({ data: PROJECT }));
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };
  return calls;
}

const ROUTES = [
  {
    name: "Record workspace",
    path: "/projects/project-1/records/record-1",
    selector: ".record-workspace",
    kind: "record-detail" as FeatureKind,
    tab: "Documents",
  },
  {
    name: "Revision workspace",
    path: "/projects/project-1/records/record-1/revisions/revision-1",
    selector: ".revision-workspace",
    kind: "revision-detail" as FeatureKind,
    tab: "Documents",
  },
  {
    name: "RFI workspace",
    path: "/projects/project-1/rfis/rfi-1",
    selector: ".rfi-workspace",
    kind: "rfi-workspace" as FeatureKind,
    tab: "RFIs",
  },
];

describe("UI-7 detail workspace route wiring", () => {
  for (const route of ROUTES) {
    it(`mounts the native ${route.name} and never loads its legacy controller`, async () => {
      const { runtime, factoryCalls } = makeRuntime();
      installShellFetch();

      renderShellWithNavigation(route.path, runtime);

      await waitFor(() => {
        expect(document.querySelector(route.selector)).not.toBeNull();
      });
      expect(
        document.querySelector(`[data-feature="${route.kind}"]`),
      ).toBeNull();
      expect(factoryCalls).not.toContain(route.kind);
    });

    it(`keeps the shell-owned project header and ${route.tab} tab on the ${route.name}`, async () => {
      const { runtime } = makeRuntime();
      installShellFetch();

      renderShellWithNavigation(route.path, runtime);

      await waitFor(() => {
        expect(document.querySelector(route.selector)).not.toBeNull();
      });
      // Exactly one page heading: the shell's project <h1>. A workspace's own
      // identity title is an <h2> beneath it.
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      const tab = [...document.querySelectorAll("a")].find(
        (link) => link.textContent === route.tab,
      );
      expect(tab?.getAttribute("aria-current")).toBe("page");
    });
  }

  it("requests a workspace read model only after project access is confirmed", async () => {
    const { runtime } = makeRuntime();
    const workspaceCalls: string[] = [];
    let releaseProject: (value: Response) => void = () => undefined;
    globalThis.fetch = (input: string | URL | Request) => {
      const target = url(input);
      if (target.includes("/api/v2/session"))
        return Promise.resolve(READY_SESSION());
      if (target.endsWith("/workspace")) {
        workspaceCalls.push(target);
        return Promise.resolve(jsonResponse({ data: recordWorkspace() }));
      }
      if (/\/api\/v2\/projects\/([^/?]+)$/.test(target)) {
        return new Promise<Response>((resolve) => {
          releaseProject = resolve;
        });
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };

    renderShellWithNavigation("/projects/project-1/records/record-1", runtime);
    await waitFor(() => {
      expect(document.body.textContent).toContain("Loading project");
    });
    expect(workspaceCalls).toHaveLength(0);

    releaseProject(jsonResponse({ data: PROJECT }));
    await waitFor(() => {
      expect(workspaceCalls.length).toBeGreaterThan(0);
    });
  });

  it("shows the shell's generic project not-found before any workspace request", async () => {
    const { runtime } = makeRuntime();
    const workspaceCalls: string[] = [];
    globalThis.fetch = (input: string | URL | Request) => {
      const target = url(input);
      if (target.includes("/api/v2/session"))
        return Promise.resolve(READY_SESSION());
      if (target.endsWith("/workspace")) {
        workspaceCalls.push(target);
        return Promise.resolve(jsonResponse({ data: recordWorkspace() }));
      }
      if (/\/api\/v2\/projects\/([^/?]+)$/.test(target)) {
        return Promise.resolve(jsonResponse({ error: {} }, { status: 403 }));
      }
      return Promise.resolve(jsonResponse({}, { status: 404 }));
    };

    renderShellWithNavigation("/projects/project-1/records/record-1", runtime);
    await waitFor(() => {
      expect(document.body.textContent).toContain("Project not found");
    });
    expect(workspaceCalls).toHaveLength(0);
  });

  it("keeps the legacy rollback descriptors resolvable for every migrated route", () => {
    // Rollback contract: removing the AppLayout branch must return each route
    // to its compatibility controller, which requires the descriptor to remain.
    for (const route of ROUTES) {
      const resolved = resolveRoute(route.path);
      expect(resolved).not.toBeNull();
      if (resolved === null || "redirectTo" in resolved) {
        throw new Error(`Expected ${route.path} to resolve to a route.`);
      }
      expect(featureDescriptor(resolved)?.kind).toBe(route.kind);
    }
  });
});
