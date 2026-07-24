import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../../../domain/projects/project";
import type { ProjectListItem } from "./types";

export interface ProjectFilters {
  q: string;
  status: ProjectStatus | "all";
}

export function defaultProjectFilters(): ProjectFilters {
  return { q: "", status: "all" };
}

export function filtersFromSearchParams(
  params: URLSearchParams,
): ProjectFilters {
  const status = params.get("status");
  return {
    q: params.get("q") ?? "",
    status:
      status && (PROJECT_STATUSES as readonly string[]).includes(status)
        ? (status as ProjectStatus)
        : "all",
  };
}

export function statusOptions(projects: ProjectListItem[]): ProjectStatus[] {
  const present = new Set(projects.map((project) => project.status));
  return PROJECT_STATUSES.filter((status) => present.has(status));
}

export function normalizeStatusFilter(
  filters: ProjectFilters,
  availableStatuses: readonly ProjectStatus[],
): ProjectFilters {
  if (filters.status !== "all" && !availableStatuses.includes(filters.status)) {
    return { ...filters, status: "all" };
  }
  return filters;
}

function collate(
  left: string | null | undefined,
  right: string | null | undefined,
  numeric = false,
): number {
  return (left || "").localeCompare(right || "", undefined, {
    numeric,
    sensitivity: "base",
  });
}

export function sortProjects(projects: ProjectListItem[]): ProjectListItem[] {
  return [...projects].sort((left, right) => {
    const activeOrder =
      Number(left.status !== "active") - Number(right.status !== "active");
    return (
      activeOrder ||
      collate(left.projectNumber, right.projectNumber, true) ||
      collate(left.name, right.name) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function applyProjectFilters(
  projects: ProjectListItem[],
  filters: ProjectFilters,
): ProjectListItem[] {
  const query = filters.q.trim().toLowerCase();
  return sortProjects(
    projects.filter((project) => {
      if (filters.status !== "all" && project.status !== filters.status) {
        return false;
      }
      if (!query) return true;
      return [project.name, project.projectNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    }),
  );
}

export function hasProjectFilters(filters: ProjectFilters): boolean {
  return Boolean(filters.q.trim()) || filters.status !== "all";
}
