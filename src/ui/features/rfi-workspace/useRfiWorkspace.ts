/*
 * TanStack Query hook for the RFI workspace read model, following the same
 * contract as the register hook and the Record/Revision workspace hooks: 403 and
 * 404 collapse into one generic `missing` treatment, every other failure is a
 * retryable `error` carrying the request id, and a denied call is never retried.
 *
 * The key includes both the project and the RFI, so navigating between RFIs can
 * never render a previously cached one.
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { fetchRfiWorkspace, RfiWorkspaceApiError } from "./api";
import type { RfiWorkspaceModel } from "./types";

export function rfiWorkspaceQueryKey(projectId: string, rfiId: string) {
  return ["rfi-workspace", projectId, rfiId] as const;
}

type QueryResult =
  | { kind: "ready"; data: RfiWorkspaceModel }
  | { kind: "missing" }
  | { kind: "error"; requestId: string };

export type RfiWorkspaceState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; requestId: string; retry: () => void }
  | {
      status: "ready";
      data: RfiWorkspaceModel;
      refreshing: boolean;
      retry: () => void;
    };

/**
 * Reloads the authoritative workspace and hands back the server's answer.
 *
 * Lifecycle work uses this instead of trusting its own request's outcome: after
 * an issue attempt whose result is unknown, the only honest question is what the
 * server now says about this RFI. Returns `null` when the reload did not produce
 * a readable model (denied, missing, or still failing), which is deliberately
 * not the same as "no official issue".
 */
export async function refetchRfiWorkspace(
  queryClient: QueryClient,
  projectId: string,
  rfiId: string,
): Promise<RfiWorkspaceModel | null> {
  const key = rfiWorkspaceQueryKey(projectId, rfiId);
  await queryClient.invalidateQueries({ queryKey: key });
  const cached = queryClient.getQueryData<QueryResult>(key);
  return cached?.kind === "ready" ? cached.data : null;
}

async function load(
  projectId: string,
  rfiId: string,
  signal: AbortSignal,
): Promise<QueryResult> {
  try {
    return {
      kind: "ready",
      data: await fetchRfiWorkspace(projectId, rfiId, signal),
    };
  } catch (error) {
    if (error instanceof RfiWorkspaceApiError) {
      if (error.status === 403 || error.status === 404)
        return { kind: "missing" };
      return { kind: "error", requestId: error.requestId };
    }
    throw error;
  }
}

export function useRfiWorkspace(
  projectId: string,
  rfiId: string,
): RfiWorkspaceState {
  const query = useQuery({
    queryKey: rfiWorkspaceQueryKey(projectId, rfiId),
    queryFn: ({ signal }) => load(projectId, rfiId, signal),
    enabled: Boolean(projectId && rfiId),
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
  if (query.status === "error")
    return { status: "error", requestId: "", retry };
  return { status: "loading" };
}
