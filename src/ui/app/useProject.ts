/*
 * Project context on TanStack Query. Mirrors the legacy shell's project header
 * loading: a 403 or 404 is collapsed into the same generic `missing` treatment
 * (a cross-tenant or unauthorized project is indistinguishable from one that
 * does not exist), any other failure is a retryable `error` carrying the API
 * request id when available, and no project values are ever invented. The
 * query is enabled only once the session is ready, so no project request is
 * issued before authentication resolves.
 */

import { useQuery } from "@tanstack/react-query";
import type { ProjectData, ProjectState } from "./types";

type ProjectResult =
  | { kind: "ready"; data: ProjectData; requestId: string }
  | { kind: "missing"; requestId: string }
  | { kind: "error"; requestId: string };

interface ProjectPayload {
  data?: ProjectData;
  meta?: { requestId?: string };
  error?: { requestId?: string };
}

async function fetchProject(projectId: string): Promise<ProjectResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/v2/projects/${encodeURIComponent(projectId)}`,
      {
        headers: { Accept: "application/json" },
      },
    );
  } catch {
    return { kind: "error", requestId: "" };
  }

  const payload = (await response.json().catch(() => ({}))) as ProjectPayload;
  const requestId =
    payload.meta?.requestId ||
    payload.error?.requestId ||
    response.headers.get("x-request-id") ||
    "";

  if (response.status === 403 || response.status === 404) {
    return { kind: "missing", requestId };
  }
  if (!response.ok || !payload.data) {
    return { kind: "error", requestId };
  }
  return { kind: "ready", data: payload.data, requestId };
}

export type ProjectResultState = ProjectState & { retry: () => void };

export function useProject(
  projectId: string | undefined,
  enabled: boolean,
): ProjectResultState {
  const query = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId ?? ""),
    enabled: enabled && Boolean(projectId),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const retry = () => {
    void query.refetch();
  };

  if (!projectId) return { status: "idle", retry };

  if (query.status === "success") {
    const result = query.data;
    if (result.kind === "ready") {
      return {
        status: "ready",
        id: projectId,
        data: result.data,
        requestId: result.requestId,
        retry,
      };
    }
    if (result.kind === "missing") {
      return {
        status: "missing",
        id: projectId,
        requestId: result.requestId,
        retry,
      };
    }
    return {
      status: "error",
      id: projectId,
      requestId: result.requestId,
      retry,
    };
  }

  if (query.status === "error") {
    return { status: "error", id: projectId, requestId: "", retry };
  }

  return { status: "loading", id: projectId, retry };
}
