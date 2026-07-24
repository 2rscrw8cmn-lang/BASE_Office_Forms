import { useQuery } from "@tanstack/react-query";
import { fetchProjects, ProjectsApiError } from "./api";
import type { ProjectsReadModel } from "./types";

export const projectsQueryKey = ["projects"] as const;

type ProjectsQueryResult =
  | { kind: "ready"; data: ProjectsReadModel }
  | { kind: "error"; requestId: string };

async function load(signal: AbortSignal): Promise<ProjectsQueryResult> {
  try {
    return { kind: "ready", data: await fetchProjects(signal) };
  } catch (error) {
    if (error instanceof ProjectsApiError) {
      return { kind: "error", requestId: error.requestId };
    }
    throw error;
  }
}

export type ProjectsState =
  | { status: "loading" }
  | { status: "error"; requestId: string; retry: () => void }
  | {
      status: "ready";
      data: ProjectsReadModel;
      refreshing: boolean;
      retry: () => void;
    };

export function useProjects(): ProjectsState {
  const query = useQuery({
    queryKey: projectsQueryKey,
    queryFn: ({ signal }) => load(signal),
    retry: false,
    staleTime: 0,
  });

  const retry = () => {
    void query.refetch();
  };

  if (query.status === "success") {
    if (query.data.kind === "ready") {
      return {
        status: "ready",
        data: query.data.data,
        refreshing: query.isFetching,
        retry,
      };
    }
    return { status: "error", requestId: query.data.requestId, retry };
  }
  if (query.status === "error") {
    return { status: "error", requestId: "", retry };
  }
  return { status: "loading" };
}
