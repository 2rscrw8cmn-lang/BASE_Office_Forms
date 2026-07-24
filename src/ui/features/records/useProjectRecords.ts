/*
 * TanStack Query hook for the project Records register read model. Follows the
 * UI-5 `useProjectRfis` pattern: a 403/404 collapses into the generic `missing`
 * treatment (never a message that distinguishes "forbidden" from "absent"),
 * any other failure is a retryable `error` carrying the request id, and a
 * denied call is never silently retried.
 *
 * The query key includes the project id, so navigating between projects never
 * shows another project's already-cached documents.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchProjectRecords, RecordsApiError } from "./api";
import type { RecordsReadModel } from "./types";

export function projectRecordsQueryKey(projectId: string) {
  return ["project-records", projectId] as const;
}

export type ProjectRecordsQueryResult =
  | { kind: "ready"; data: RecordsReadModel }
  | { kind: "missing" }
  | { kind: "error"; requestId: string };

async function load(
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectRecordsQueryResult> {
  try {
    return {
      kind: "ready",
      data: await fetchProjectRecords(projectId, signal),
    };
  } catch (error) {
    if (error instanceof RecordsApiError) {
      if (error.status === 403 || error.status === 404)
        return { kind: "missing" };
      return { kind: "error", requestId: error.requestId };
    }
    throw error;
  }
}

export type ProjectRecordsState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; requestId: string; retry: () => void }
  | {
      status: "ready";
      data: RecordsReadModel;
      refreshing: boolean;
      retry: () => void;
    };

export function useProjectRecords(projectId: string): ProjectRecordsState {
  const query = useQuery({
    queryKey: projectRecordsQueryKey(projectId),
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
    if (result.kind === "ready") {
      return {
        status: "ready",
        data: result.data,
        refreshing: query.isFetching,
        retry,
      };
    }
    if (result.kind === "missing") return { status: "missing" };
    return { status: "error", requestId: result.requestId, retry };
  }
  if (query.status === "error") {
    return { status: "error", requestId: "", retry };
  }
  return { status: "loading" };
}
