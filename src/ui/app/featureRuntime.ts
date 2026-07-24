/*
 * Default shell runtime: loads the statically-served compatibility modules at
 * runtime. Feature screens that have not yet been migrated to React continue to
 * run through their existing browser controllers (public/*-view.js); the shell
 * mounts them unchanged and only bridges navigation, announcements, session
 * context, and re-render requests.
 *
 * The api client and each feature factory are imported through @vite-ignore
 * dynamic imports (the same boundary the UI-2 compatibility host used for the
 * shell), so these modules are never bundled into the React entry and remain
 * ordinary served assets. Tests inject a synchronous stub runtime instead.
 */

import type { FeatureFactory, LegacyApiClient, ShellRuntime } from "./types";
import type { FeatureKind } from "./routing";

interface ApiModule {
  createApiClient?: (options: { fetch: typeof fetch }) => LegacyApiClient;
}

type FeatureModule = Record<string, FeatureFactory | undefined>;

const FEATURE_MODULES: Record<
  FeatureKind,
  { file: string; exportName: string }
> = {
  dashboard: { file: "/dashboard-view.js", exportName: "createDashboardView" },
  projects: { file: "/projects-view.js", exportName: "createProjectsView" },
  overview: {
    file: "/project-overview-view.js",
    exportName: "createProjectOverviewView",
  },
  records: { file: "/records-view.js", exportName: "createRecordsView" },
  "record-detail": {
    file: "/record-detail-view.js",
    exportName: "createRecordDetailView",
  },
  "revision-detail": {
    file: "/revision-detail-view.js",
    exportName: "createRevisionDetailView",
  },
  rfis: { file: "/rfis-view.js", exportName: "createRfisView" },
  "rfi-workspace": {
    file: "/rfi-workspace-view.js",
    exportName: "createRfiWorkspaceView",
  },
};

let apiClientPromise: Promise<LegacyApiClient> | null = null;

// The specifiers are held in variables so TypeScript leaves them un-resolved
// (they are served, not bundled) and @vite-ignore keeps Vite from trying to
// bundle them; the results are narrowed through explicit module shapes.
async function loadApiClient(): Promise<LegacyApiClient> {
  apiClientPromise ??= (async () => {
    const specifier = "/app-api.js";
    const module = (await import(/* @vite-ignore */ specifier)) as ApiModule;
    if (!module.createApiClient) {
      throw new Error("app-api.js did not export createApiClient.");
    }
    return module.createApiClient({ fetch: window.fetch.bind(window) });
  })();
  return apiClientPromise;
}

async function loadFeatureFactory(kind: FeatureKind): Promise<FeatureFactory> {
  const { file, exportName } = FEATURE_MODULES[kind];
  const module = (await import(/* @vite-ignore */ file)) as FeatureModule;
  const factory = module[exportName];
  if (!factory) {
    throw new Error(`${file} did not export ${exportName}.`);
  }
  return factory;
}

export const defaultShellRuntime: ShellRuntime = {
  getApiClient: loadApiClient,
  loadFeatureFactory,
};
