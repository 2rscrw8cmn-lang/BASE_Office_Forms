import type { MouseEvent } from "react";
import { ProjectStatusBadge } from "../../components";
import { AppLink } from "../../app/AppLink";
import { formatProjectDate, projectLocation } from "./format";
import type { ProjectListItem } from "./types";

export interface ProjectsTableProps {
  projects: ProjectListItem[];
  onNavigate: (href: string) => void;
}

export function projectOverviewHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/overview`;
}

function isPlainRowClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      "a, button, input, select, textarea, label, [contenteditable='true']",
    )
  ) {
    return false;
  }
  const selection =
    event.currentTarget.ownerDocument.defaultView?.getSelection();
  return !(selection && !selection.isCollapsed && selection.toString());
}

export function ProjectsTable({ projects, onNavigate }: ProjectsTableProps) {
  return (
    <div
      className="projects-register-table-wrap"
      role="region"
      aria-label="Projects"
      tabIndex={0}
    >
      <table className="projects-register-table">
        <caption className="base-sr-only">
          Projects you are authorized to access
        </caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Location</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const href = projectOverviewHref(project.id);
            const projectNumber = project.projectNumber?.trim();
            return (
              <tr
                key={project.id}
                className="projects-register-row"
                onClick={(event) => {
                  if (isPlainRowClick(event)) onNavigate(href);
                }}
              >
                <th scope="row">
                  <AppLink
                    className="projects-register-name"
                    href={href}
                    aria-label={`Open ${project.name}${
                      projectNumber ? ` (${projectNumber})` : ""
                    }`}
                  >
                    {project.name}
                  </AppLink>
                  <span className="projects-register-number">
                    {projectNumber || "No project number"}
                  </span>
                </th>
                <td>
                  <ProjectStatusBadge status={project.status} />
                </td>
                <td>{projectLocation(project)}</td>
                <td className="projects-register-updated">
                  <time dateTime={project.updatedAt}>
                    {formatProjectDate(project.updatedAt)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
