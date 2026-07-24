/*
 * Project context on TanStack Query. Mirrors the legacy shell's project header
 * loading: a 403 or 404 is collapsed into the same generic `missing` treatment
 * (a cross-tenant or unauthorized project is indistinguishable from one that
 * does not exist), any other failure is a retryable `error` carrying the API
 * request id when available, and no project values are ever invented. The
 * query is enabled only once the session is ready, so no project request is
 * issued before authentication resolves.
 *
 * Authorization is never trusted indefinitely. `revalidationKey` (supplied by
 * the caller as the current route's normalized pathname) identifies a
 * "meaningful" route navigation. Every time it changes, this hook forces a
 * brand-new query — not a background refetch that keeps showing the previous
 * `ready` result while revalidating — so a project the caller has returned to
 * (e.g. via browser Back/Forward) is shown as `loading` again, and the
 * destination feature cannot mount, until the server has re-confirmed access.
 * A 403/404 discovered on that revalidation replaces any previously cached
 * `ready` identity with the generic `missing` state. Changing only the query
 * string or hash on the same route (an ordinary controller rerender, or a
 * legacy feature's own filter/sort URL update) does not change
 * `revalidationKey` and therefore does not force a new request — the server
 * remains the sole authority for the decision itself, this only controls how
 * long the client is willing to describe an old answer as still current.
 */

import { useRef, useState } from "react";
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
  revalidationKey: string,
): ProjectResultState {
  // Adjusting state in response to a changed prop during render (React's
  // documented pattern for resetting state when an input changes) rather than
  // in an effect: this must take effect before the query below runs for this
  // render, so a revalidation never briefly serves the previous epoch's cached
  // `ready` data.
  const [epoch, setEpoch] = useState(0);
  const previousKeyRef = useRef(revalidationKey);
  if (previousKeyRef.current !== revalidationKey) {
    previousKeyRef.current = revalidationKey;
    // Only a route that actually has a project needs revalidation; entering a
    // non-project route (and its eventual return) is handled by `enabled`
    // going false/true, not by burning an epoch no query will use.
    if (projectId) {
      setEpoch((value) => value + 1);
    }
  }

  const query = useQuery({
    queryKey: ["project", projectId, epoch],
    queryFn: () => fetchProject(projectId ?? ""),
    enabled: enabled && Boolean(projectId),
    retry: false,
    // Infinite within one epoch: an epoch bump (a meaningful navigation) is
    // the only thing that should ever ask the server again for this decision.
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
