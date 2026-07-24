/*
 * Typed application route map for the React shell.
 *
 * This is a faithful TypeScript port of the canonical route table in
 * `public/app-routing.js`, which remains the source of truth for the legacy
 * compatibility shell (and its tests). Parity between the two is enforced by
 * `tests/unit/react-shell-routing.test.ts`, which resolves every canonical URL
 * through both modules and asserts identical results, so neither can drift.
 *
 * The React shell resolves the current location through `resolveRoute` and
 * composes the shell chrome, project context, and compatibility feature mounts
 * around the result. URL normalization, redirects, project-tab selection for
 * descendant routes, and the not-found surface all match the legacy shell.
 */

export const PLACEHOLDER_NOTE = "Coming in the next implementation milestone.";

export type GlobalSection = "dashboard" | "projects" | "admin";
export type ProjectTabId =
  "overview" | "records" | "issuances" | "rfis" | "team";

export interface RouteParams {
  projectId?: string;
  recordId?: string;
  revisionId?: string;
  issuanceId?: string;
  rfiId?: string;
}

interface RouteDefinition {
  pattern: RegExp;
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  globalSection: GlobalSection;
  projectTab?: ProjectTabId;
  requiresAdministration?: boolean;
  params?: (keyof RouteParams)[];
}

export interface ResolvedRoute {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  globalSection?: GlobalSection;
  projectTab?: ProjectTabId;
  requiresAdministration?: boolean;
  pathname: string;
  params: RouteParams;
  surface?: "not-found";
  placeholderNote?: string;
}

export type RouteResolution = { redirectTo: string } | ResolvedRoute;

const routes: RouteDefinition[] = [
  {
    pattern: /^\/dashboard$/,
    id: "dashboard",
    title: "Work dashboard",
    eyebrow: "Workspace",
    description:
      "A focused view of document-control work across your projects.",
    globalSection: "dashboard",
  },
  {
    pattern: /^\/projects$/,
    id: "projects",
    title: "Projects",
    eyebrow: "Project directory",
    description: "Browse and open projects from this workspace.",
    globalSection: "projects",
  },
  {
    pattern: /^\/admin$/,
    id: "admin",
    title: "Administration",
    eyebrow: "Organization",
    description:
      "Organization administration will be delivered in a later milestone.",
    globalSection: "admin",
    requiresAdministration: true,
  },
  {
    pattern:
      /^\/projects\/([^/]+)\/records\/([^/]+)\/revisions\/([^/]+)\/issue$/,
    id: "revision-issue",
    title: "Create issuance",
    eyebrow: "Records",
    description:
      "Reviewing and issuing a published revision will be implemented in the issuance milestone.",
    globalSection: "projects",
    projectTab: "records",
    params: ["projectId", "recordId", "revisionId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/records\/([^/]+)\/revisions\/([^/]+)$/,
    id: "revision-detail",
    title: "Document revision",
    eyebrow: "Records",
    description: "Revision files and publishing workspace.",
    globalSection: "projects",
    projectTab: "records",
    params: ["projectId", "recordId", "revisionId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/records\/([^/]+)$/,
    id: "record-detail",
    title: "Record detail",
    eyebrow: "Records",
    description: "Record metadata and revision history.",
    globalSection: "projects",
    projectTab: "records",
    params: ["projectId", "recordId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/records$/,
    id: "project-records",
    title: "Document Register",
    eyebrow: "Project documents",
    description: "The project document register.",
    globalSection: "projects",
    projectTab: "records",
    params: ["projectId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/issuances\/([^/]+)\/created$/,
    id: "issuance-created",
    title: "Issuance created",
    eyebrow: "Issuances",
    description:
      "The persisted issuance confirmation will be implemented with the issuance workflow.",
    globalSection: "projects",
    projectTab: "issuances",
    params: ["projectId", "issuanceId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/issuances\/([^/]+)$/,
    id: "issuance-detail",
    title: "Issuance detail",
    eyebrow: "Issuances",
    description:
      "The immutable issuance snapshot will be implemented in the issuance milestone.",
    globalSection: "projects",
    projectTab: "issuances",
    params: ["projectId", "issuanceId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/issuances$/,
    id: "project-issuances",
    title: "Issuances",
    eyebrow: "Project history",
    description:
      "Permanent project issuance history will be implemented in the issuance milestone.",
    globalSection: "projects",
    projectTab: "issuances",
    params: ["projectId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/rfis\/([^/]+)$/,
    id: "rfi-workspace",
    title: "RFI",
    eyebrow: "Request for Information",
    description: "The RFI record, document view, attachments, and activity.",
    globalSection: "projects",
    projectTab: "rfis",
    params: ["projectId", "rfiId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/rfis$/,
    id: "project-rfis",
    title: "RFIs",
    eyebrow: "Project communication",
    description: "The project RFI register.",
    globalSection: "projects",
    projectTab: "rfis",
    params: ["projectId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/team$/,
    id: "project-team",
    title: "Team",
    eyebrow: "Project access",
    description:
      "Project membership and capabilities require a dedicated read model before this surface is implemented.",
    globalSection: "projects",
    projectTab: "team",
    params: ["projectId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/overview$/,
    id: "project-overview",
    title: "Overview",
    eyebrow: "Project workspace",
    description: "Project summary, attention items, and recent activity.",
    globalSection: "projects",
    projectTab: "overview",
    params: ["projectId"],
  },
];

export function normalizePathname(pathname: string): string {
  const value = pathname || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

export function isApplicationPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/api" || normalized.startsWith("/api/")) return false;
  return !/\.[a-z0-9]+$/i.test(normalized);
}

export function canViewAdministration(
  role: string | undefined | null,
): boolean {
  return role === "org_admin";
}

function notFoundRoute(pathname: string): ResolvedRoute {
  return {
    id: "not-found",
    title: "Page not found",
    eyebrow: "BASE Office Forms",
    description: "The requested page is not available.",
    pathname,
    params: {},
    surface: "not-found",
  };
}

export function resolveRoute(pathname: string): RouteResolution | null {
  const normalized = normalizePathname(pathname);
  if (!isApplicationPath(normalized)) return null;
  if (normalized === "/") return { redirectTo: "/dashboard" };

  const projectRoot = /^\/projects\/([^/]+)$/.exec(normalized);
  if (projectRoot) {
    return {
      redirectTo: `/projects/${encodeURIComponent(decodeURIComponent(projectRoot[1]))}/overview`,
    };
  }

  for (const definition of routes) {
    const match = definition.pattern.exec(normalized);
    if (!match) continue;
    const params: RouteParams = {};
    (definition.params ?? []).forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });
    return {
      id: definition.id,
      title: definition.title,
      eyebrow: definition.eyebrow,
      description: definition.description,
      globalSection: definition.globalSection,
      projectTab: definition.projectTab,
      requiresAdministration: definition.requiresAdministration,
      pathname: normalized,
      params,
      placeholderNote: PLACEHOLDER_NOTE,
    };
  }

  return notFoundRoute(normalized);
}

/**
 * Resolve to a concrete route for rendering: unwraps redirects into the target
 * route and treats non-application paths as not-found (the router only ever
 * hands application locations to the shell, but this keeps the shell safe).
 */
export function resolveRouteForRender(pathname: string): ResolvedRoute {
  const resolution = resolveRoute(pathname);
  if (!resolution) return notFoundRoute(normalizePathname(pathname));
  if ("redirectTo" in resolution) {
    const target = resolveRoute(resolution.redirectTo);
    if (target && !("redirectTo" in target)) return target;
    return notFoundRoute(normalizePathname(pathname));
  }
  return resolution;
}

export function projectTabHref(projectId: string, tab: string): string {
  const id = encodeURIComponent(projectId);
  return `/projects/${id}/${tab}`;
}

export interface ProjectTabDefinition {
  id: ProjectTabId;
  label: string;
}

export const PROJECT_TABS: readonly ProjectTabDefinition[] = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "records", label: "Documents" },
  { id: "issuances", label: "Issuances" },
  { id: "rfis", label: "RFIs" },
  { id: "team", label: "Team" },
]);

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Organization administrator",
  document_control_admin: "Document control administrator",
  project_manager: "Project manager",
  contributor: "Contributor",
  viewer: "Viewer",
};

export function readableRole(role: string | undefined | null): string {
  return (role && ROLE_LABELS[role]) || "Authenticated member";
}

/**
 * The compatibility feature modules that a route mounts, keyed by route id.
 * Routes not listed here render a placeholder (their milestone is not built).
 */
export type FeatureKind =
  | "dashboard"
  | "projects"
  | "overview"
  | "records"
  | "record-detail"
  | "revision-detail"
  | "rfis"
  | "rfi-workspace";

export interface FeatureDescriptor {
  /** Stable identity; changing it tears down and recreates the controller. */
  key: string;
  kind: FeatureKind;
  projectId?: string;
  recordId?: string;
  revisionId?: string;
  rfiId?: string;
}

export function featureDescriptor(
  route: ResolvedRoute,
): FeatureDescriptor | null {
  // Route params are always present for the routes handled below (the pattern
  // captured them); the `?? ""` only satisfies the optional param types.
  const projectId = route.params.projectId ?? "";
  const recordId = route.params.recordId ?? "";
  const revisionId = route.params.revisionId ?? "";
  const rfiId = route.params.rfiId ?? "";
  switch (route.id) {
    case "dashboard":
      return { key: "dashboard", kind: "dashboard" };
    case "projects":
      return { key: "projects", kind: "projects" };
    case "project-overview":
      return { key: `overview:${projectId}`, kind: "overview", projectId };
    case "project-records":
      return { key: `records:${projectId}`, kind: "records", projectId };
    case "record-detail":
      return {
        key: `record-detail:${projectId}:${recordId}`,
        kind: "record-detail",
        projectId,
        recordId,
      };
    case "revision-detail":
      return {
        key: `revision-detail:${projectId}:${recordId}:${revisionId}`,
        kind: "revision-detail",
        projectId,
        recordId,
        revisionId,
      };
    case "project-rfis":
      return { key: `rfis:${projectId}`, kind: "rfis", projectId };
    case "rfi-workspace":
      return {
        key: `rfi-workspace:${projectId}:${rfiId}`,
        kind: "rfi-workspace",
        projectId,
        rfiId,
      };
    default:
      return null;
  }
}
