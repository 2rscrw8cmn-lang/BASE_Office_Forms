const PLACEHOLDER_NOTE = "Coming in the next implementation milestone.";

const routes = [
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
    pattern: /^\/projects\/([^/]+)\/rfis(?:\/[^/]+)?$/,
    id: "project-rfis",
    title: "RFIs",
    eyebrow: "Project communication",
    description:
      "The existing RFI API will be integrated with this project shell in a later milestone.",
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

export function normalizePathname(pathname) {
  const value = pathname || "/";
  if (value === "/") return value;
  return value.replace(/\/+$/, "") || "/";
}

export function isApplicationPath(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === "/api" || normalized.startsWith("/api/")) return false;
  return !/\.[a-z0-9]+$/i.test(normalized);
}

export function canViewAdministration(role) {
  return role === "org_admin";
}

export function resolveRoute(pathname) {
  const normalized = normalizePathname(pathname);
  if (!isApplicationPath(normalized)) return null;
  if (normalized === "/") return { redirectTo: "/dashboard" };

  const projectRoot = normalized.match(/^\/projects\/([^/]+)$/);
  if (projectRoot) {
    return {
      redirectTo: `/projects/${encodeURIComponent(decodeURIComponent(projectRoot[1]))}/overview`,
    };
  }

  for (const definition of routes) {
    const match = normalized.match(definition.pattern);
    if (!match) continue;
    const params = {};
    (definition.params || []).forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });
    return {
      ...definition,
      pathname: normalized,
      params,
      placeholderNote: PLACEHOLDER_NOTE,
    };
  }

  return {
    id: "not-found",
    title: "Page not found",
    eyebrow: "BASE Office Forms",
    description: "The requested page is not available.",
    pathname: normalized,
    params: {},
    surface: "not-found",
  };
}

export function projectTabHref(projectId, tab) {
  const id = encodeURIComponent(projectId);
  return `/projects/${id}/${tab}`;
}

export const PROJECT_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "records", label: "Documents" },
  { id: "issuances", label: "Issuances" },
  { id: "rfis", label: "RFIs" },
  { id: "team", label: "Team" },
]);
