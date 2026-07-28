/*
 * TanStack Query hooks for the Record and Revision workspace read models.
 *
 * They follow the established UI-5/UI-6 contract: a 403 or 404 collapses into
 * one generic `missing` treatment (the browser never distinguishes "forbidden"
 * from "absent", so a workspace cannot be used to probe for records in another
 * tenant), any other failure is a retryable `error` carrying the request id, and
 * a denied call is never silently retried.
 *
 * Query keys include every identity in the path, so navigating between records
 * or revisions can never show a previously cached one.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchRecordWorkspace,
  fetchRevisionWorkspace,
  RecordWorkspaceApiError,
} from "./api";
import type { RecordWorkspaceModel, RevisionWorkspaceModel } from "./types";

export function recordWorkspaceQueryKey(projectId: string, recordId: string) {
  return ["record-workspace", projectId, recordId] as const;
}

export function revisionWorkspaceQueryKey(
  projectId: string,
  recordId: string,
  revisionId: string,
) {
  return ["revision-workspace", projectId, recordId, revisionId] as const;
}

type QueryResult<Model> =
  | { kind: "ready"; data: Model }
  | { kind: "missing" }
  | { kind: "error"; requestId: string };

export type WorkspaceState<Model> =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; requestId: string; retry: () => void }
  | {
      status: "ready";
      data: Model;
      refreshing: boolean;
      retry: () => void;
    };

async function load<Model>(
  loader: () => Promise<Model>,
): Promise<QueryResult<Model>> {
  try {
    return { kind: "ready", data: await loader() };
  } catch (error) {
    if (error instanceof RecordWorkspaceApiError) {
      if (error.status === 403 || error.status === 404)
        return { kind: "missing" };
      return { kind: "error", requestId: error.requestId };
    }
    throw error;
  }
}

function toState<Model>(
  status: "pending" | "success" | "error",
  result: QueryResult<Model> | undefined,
  refreshing: boolean,
  retry: () => void,
): WorkspaceState<Model> {
  if (status === "success" && result) {
    if (result.kind === "ready") {
      return { status: "ready", data: result.data, refreshing, retry };
    }
    if (result.kind === "missing") return { status: "missing" };
    return { status: "error", requestId: result.requestId, retry };
  }
  if (status === "error") return { status: "error", requestId: "", retry };
  return { status: "loading" };
}

export function useRecordWorkspace(
  projectId: string,
  recordId: string,
): WorkspaceState<RecordWorkspaceModel> {
  const query = useQuery({
    queryKey: recordWorkspaceQueryKey(projectId, recordId),
    queryFn: ({ signal }) =>
      load(() => fetchRecordWorkspace(projectId, recordId, signal)),
    enabled: Boolean(projectId && recordId),
    retry: false,
    staleTime: 0,
  });

  return toState(query.status, query.data, query.isFetching, () => {
    void query.refetch();
  });
}

export function useRevisionWorkspace(
  projectId: string,
  recordId: string,
  revisionId: string,
): WorkspaceState<RevisionWorkspaceModel> {
  const query = useQuery({
    queryKey: revisionWorkspaceQueryKey(projectId, recordId, revisionId),
    queryFn: ({ signal }) =>
      load(() =>
        fetchRevisionWorkspace(projectId, recordId, revisionId, signal),
      ),
    enabled: Boolean(projectId && recordId && revisionId),
    retry: false,
    staleTime: 0,
  });

  return toState(query.status, query.data, query.isFetching, () => {
    void query.refetch();
  });
}
