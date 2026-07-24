/*
 * Shared types for the React application shell and its compatibility bridge to
 * the not-yet-migrated vanilla feature controllers (public/*-view.js).
 */

import type { FeatureKind } from "./routing";

/** Organization/membership context returned by GET /api/v2/session. */
export interface SessionData {
  organization?: { name?: string } | null;
  membership?: { role?: string } | null;
  [key: string]: unknown;
}

export interface SessionError {
  status: number;
  code: string;
  message: string;
  requestId: string;
}

/**
 * The session snapshot the shell exposes to feature controllers through
 * `getSession()`. It mirrors the shape the legacy shell provided, so feature
 * modules read it unchanged.
 */
export interface SessionSnapshot {
  status: "loading" | "ready" | "error";
  data: SessionData | null;
  error: SessionError | null;
}

/** Project context returned by GET /api/v2/projects/:projectId. */
export interface ProjectData {
  id: string;
  name: string;
  projectNumber?: string | null;
  status: string;
  [key: string]: unknown;
}

/**
 * Project context state. `missing` is the safe, generic treatment for both 403
 * and 404 (a cross-tenant or unauthorized project is indistinguishable from a
 * nonexistent one), exactly as the legacy shell behaved.
 */
export type ProjectState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; data: ProjectData; requestId: string }
  | { status: "missing"; id: string; requestId: string }
  | { status: "error"; id: string; requestId: string };

/** The bridge callbacks a feature controller receives. */
export interface FeatureBridge {
  navigate: (
    href: string,
    options?: { replace?: boolean; focus?: boolean },
  ) => void;
  announce: (message: string) => void;
  requestRender: () => void;
  getSession: () => SessionSnapshot;
}

/**
 * The vanilla /api/v2 browser client (public/app-api.js). Feature controllers
 * consume its request helpers; the shell only passes it through, so it is typed
 * as an opaque bag of callable helpers plus the base `request` method.
 */
export interface LegacyApiClient {
  request: (
    path: string,
    options?: unknown,
  ) => Promise<{ data: unknown; requestId: string; status: number }>;
  [method: string]: (...args: never[]) => unknown;
}

export interface FeatureControllerDeps extends FeatureBridge {
  api: LegacyApiClient;
  projectId?: string;
  recordId?: string;
  revisionId?: string;
  rfiId?: string;
}

export interface FeatureController {
  mount: (container: HTMLElement) => void;
  reload?: () => void | Promise<void>;
  destroy: () => void;
}

export type FeatureFactory = (deps: FeatureControllerDeps) => FeatureController;

/**
 * Injectable runtime for loading the compatibility modules. The default
 * implementation dynamically imports the statically-served browser modules; the
 * shell tests inject a synchronous stub so the shell can be exercised without
 * the real feature bundles.
 */
export interface ShellRuntime {
  getApiClient: () => Promise<LegacyApiClient>;
  loadFeatureFactory: (kind: FeatureKind) => Promise<FeatureFactory>;
}
