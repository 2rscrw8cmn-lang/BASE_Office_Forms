import { ProjectStatusBadge } from "../../components";
import { AppLink } from "../../app/AppLink";
import { formatProjectDate, projectLocation } from "./format";
import { projectOverviewHref } from "./ProjectsTable";
import type { ProjectListItem } from "./types";

export function ProjectsCards({ projects }: { projects: ProjectListItem[] }) {
  return (
    <ul className="projects-register-cards" aria-label="Projects">
      {projects.map((project) => {
        const projectNumber = project.projectNumber?.trim();
        return (
          <li key={project.id}>
            <AppLink
              className="projects-register-card"
              href={projectOverviewHref(project.id)}
              aria-label={`Open ${project.name}${
                projectNumber ? ` (${projectNumber})` : ""
              }`}
            >
              <span className="projects-register-card__top">
                <span className="projects-register-card__identity">
                  <strong>{project.name}</strong>
                  <span>{projectNumber || "No project number"}</span>
                </span>
                <ProjectStatusBadge status={project.status} />
              </span>
              <span className="projects-register-card__facts">
                <span>
                  <span className="projects-register-card__label">
                    Location
                  </span>
                  {projectLocation(project)}
                </span>
                <span>
                  <span className="projects-register-card__label">Updated</span>
                  <time dateTime={project.updatedAt}>
                    {formatProjectDate(project.updatedAt)}
                  </time>
                </span>
              </span>
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}
