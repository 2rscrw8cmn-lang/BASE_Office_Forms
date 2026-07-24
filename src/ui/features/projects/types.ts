import type { ProjectStatus } from "../../../domain/projects/project";

export interface ProjectListItem {
  id: string;
  projectNumber: string | null;
  name: string;
  status: ProjectStatus;
  description: string | null;
  address: {
    city: string | null;
    region: string | null;
  };
  updatedAt: string;
}

export interface ProjectsCapabilities {
  createProject: boolean;
}

export interface ProjectsReadModel {
  projects: ProjectListItem[];
  capabilities: ProjectsCapabilities;
}

export interface CreateProjectInput {
  projectNumber: string;
  name: string;
  status: Exclude<ProjectStatus, "archived">;
  description?: string;
  address?: {
    city: string | null;
    region: string | null;
  };
}
