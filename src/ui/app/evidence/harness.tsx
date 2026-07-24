/*
 * Development-only evidence harness for UI-4. It mounts the REAL application
 * shell (AppProviders + ShellRoutes + AppLayout) with the production CSS, but
 * substitutes a stub runtime and a mocked session/project fetch so the shell
 * chrome can be captured without an authenticated Cloudflare Access session.
 * The feature content area shows a representative placeholder — the shell
 * chrome (sidebar, navigation, project header, tabs, drawer) is the real React
 * output. This harness is never part of the production bundle.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, ShellRoutes, createQueryClient } from "../App";
import type {
  FeatureControllerDeps,
  LegacyApiClient,
  ShellRuntime,
} from "../types";
import type { FeatureKind } from "../routing";
import "../../styles/app.css";

const params = new URLSearchParams(window.location.search);
const route = params.get("route") ?? "/projects/p1/records";
const openDrawer = params.get("drawer") === "1";
const role = params.get("role") ?? "org_admin";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.includes("/api/v2/session")) {
    return Promise.resolve(
      response({
        data: {
          organization: { name: "BASE Construction Group" },
          membership: { role },
        },
      }),
    );
  }
  if (/\/api\/v2\/projects\/[^/?]+$/.test(url)) {
    return Promise.resolve(
      response({
        data: {
          id: "p1",
          name: "Riverside Medical Center",
          projectNumber: "24-018",
          status: "active",
        },
      }),
    );
  }
  return Promise.resolve(response({}, 404));
};

const FEATURE_TITLES: Record<FeatureKind, string> = {
  dashboard: "Work Dashboard",
  projects: "Projects",
  overview: "Overview",
  records: "Document Register",
  "record-detail": "Record detail",
  "revision-detail": "Document revision",
  rfis: "RFIs",
  "rfi-workspace": "RFI",
};

function renderStubFeature(container: HTMLElement, kind: FeatureKind) {
  const title = FEATURE_TITLES[kind];
  container.innerHTML = `
    <section class="workspace-page app-register-page">
      <header class="app-register-header app-container-register">
        <div class="app-register-title">
          <h1 id="page-title" tabindex="-1">${title}</h1>
          <span class="app-register-count">3 documents</span>
        </div>
        <button class="primary-button" type="button">Add document</button>
      </header>
      <div class="app-register-toolbar app-container-register">
        <div class="app-register-controls">
          <div class="app-field app-search-field app-register-control">
            <input type="search" placeholder="Search documents..." />
          </div>
        </div>
        <div class="app-register-filter-state">
          <p class="app-register-result-count">3 documents</p>
        </div>
      </div>
      <p style="padding: 0 var(--app-gutter); color: var(--shell-muted); font-size: 12px;">
        Compatibility mount: the ${kind} feature controller renders here
        unchanged. The surrounding sidebar, project header, tabs, and drawer are
        the React application shell.
      </p>
    </section>`;
}

const runtime: ShellRuntime = {
  getApiClient: () =>
    Promise.resolve({
      request: () =>
        Promise.resolve({ data: undefined, requestId: "", status: 200 }),
    } as LegacyApiClient),
  loadFeatureFactory: (kind) =>
    Promise.resolve((deps: FeatureControllerDeps) => ({
      mount: (container: HTMLElement) => {
        renderStubFeature(container, kind);
      },
      reload: () => {
        deps.requestRender();
      },
      destroy: () => {
        /* no-op */
      },
    })),
};

const rootElement = document.getElementById("react-app");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppProviders queryClient={createQueryClient()}>
        <MemoryRouter initialEntries={[route]}>
          <ShellRoutes runtime={runtime} />
        </MemoryRouter>
      </AppProviders>
    </StrictMode>,
  );
}

if (openDrawer) {
  window.setTimeout(() => {
    document.querySelector<HTMLButtonElement>(".mobile-menu-button")?.click();
  }, 300);
}
