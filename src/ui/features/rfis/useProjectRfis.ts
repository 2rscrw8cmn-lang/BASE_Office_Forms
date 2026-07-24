/*
 * TanStack Query hook for the project RFI register read model. Mirrors
 * `useProject.ts`'s pattern: a 403/404 collapses into the generic `missing`
 * treatment, any other failure is a retryable `error` carrying the request id
 * when available, and the query never silently retries a denied call.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchProjectRfis, RfiApiError } from "./api";
import type { ProjectRfisReadModel } from "./types";

export function projectRfisQueryKey(projectId: string) {
  return ["project-rfis", projectId] as const;
}

export type ProjectRfisQueryResult =
  | { kind: "ready"; data: ProjectRfisReadModel }
  | { kind: "missing" }
  | { kind: "error"; requestId: string };

async function load(
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectRfisQueryResult> {
  try {
    const data = await fetchProjectRfis(projectId, signal);
    return { kind: "ready", data };
  } catch (error) {
    if (error instanceof RfiApiError) {
      if (error.status === 403 || error.status === 404) {
        return { kind: "missing" };
      }
      return { kind: "error", requestId: error.requestId };
    }
    throw error;
  }
}

export type ProjectRfisState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; requestId: string; retry: () => void }
  | { status: "ready"; data: ProjectRfisReadModel; retry: () => void };

export function useProjectRfis(projectId: string): ProjectRfisState {
  const query = useQuery({
    queryKey: projectRfisQueryKey(projectId),
    queryFn: ({ signal }) => load(projectId, signal),
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 0,
  });

  const retry = () => {
    void query.refetch();
  };

  if (query.status === "success") {
    const result = query.data;
    if (result.kind === "ready")
      return { status: "ready", data: result.data, retry };
    if (result.kind === "missing") return { status: "missing" };
    return { status: "error", requestId: result.requestId, retry };
  }
  if (query.status === "error") {
    return { status: "error", requestId: "", retry };
  }
  return { status: "loading" };
}
