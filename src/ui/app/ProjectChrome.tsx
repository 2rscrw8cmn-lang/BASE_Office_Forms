/*
 * Project context header and tabs, reproducing the legacy shell structure and
 * class names. The header is data-backed and only shows real, server-derived
 * project values; while the project loads (or before its data arrives) it shows
 * a factual project-id loading context and never invents a name or status. Tabs
 * are real links (router owns selection), and record/revision/issue descendants
 * keep their parent tab selected via the route's `projectTab`.
 */

import { AppLink } from "./AppLink";
import { PROJECT_TABS, projectTabHref } from "./routing";
import type { ResolvedRoute } from "./routing";
import type { ProjectState } from "./types";

export function ProjectHeader({
  projectId,
  project,
}: {
  projectId: string;
  project: ProjectState;
}) {
  if (project.status !== "ready" || project.id !== projectId) {
    return (
      <header className="project-context-header" aria-busy="true">
        <div>
          <p className="project-context-number">
            Project <code>{projectId}</code>
          </p>
          <h1 tabIndex={-1}>Loading project&hellip;</h1>
        </div>
        <span className="status-badge status-neutral">Loading</span>
      </header>
    );
  }
  const data = project.data;
  return (
    <header className="project-context-header">
      <div>
        <p className="project-context-number">
          {data.projectNumber || "Project"}
        </p>
        <h1 tabIndex={-1}>{data.name}</h1>
      </div>
      <span
        className={`status-badge status-${data.status === "active" ? "success" : "neutral"}`}
      >
        {data.status}
      </span>
    </header>
  );
}

export function ProjectTabs({
  projectId,
  route,
}: {
  projectId: string;
  route: ResolvedRoute;
}) {
  return (
    <nav className="project-tabs" aria-label="Project navigation">
      <div className="project-tabs-scroll">
        {PROJECT_TABS.map((tab) => {
          const selected = tab.id === route.projectTab;
          return (
            <AppLink
              key={tab.id}
              href={projectTabHref(projectId, tab.id)}
              className={selected ? "is-active" : undefined}
              aria-current={selected ? "page" : undefined}
            >
              {tab.label}
            </AppLink>
          );
        })}
      </div>
    </nav>
  );
}
