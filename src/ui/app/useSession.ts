/*
 * Session context on TanStack Query. Cloudflare Access and GET /api/v2/session
 * remain authoritative; this hook only surfaces the server's answer. It never
 * caches an authorization decision and never invents identity: a failed session
 * yields the safe message, error code, and request id for the shell to show,
 * and only a successful session unlocks project and feature loading.
 */

import { useQuery } from "@tanstack/react-query";
import type { SessionData, SessionError, SessionSnapshot } from "./types";

class SessionRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(error: SessionError) {
    super(error.message);
    this.name = "SessionRequestError";
    this.status = error.status;
    this.code = error.code;
    this.requestId = error.requestId;
  }
}

interface SessionPayload {
  data?: SessionData;
  meta?: { requestId?: string };
  error?: { code?: string; message?: string; requestId?: string };
}

async function fetchSession(): Promise<SessionData> {
  let response: Response;
  try {
    response = await fetch("/api/v2/session", {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new SessionRequestError({
      status: 0,
      code: "",
      message: "The request could not reach the server.",
      requestId: "",
    });
  }

  const payload = (await response
    .json()
    .catch(() => null)) as SessionPayload | null;
  const requestId =
    payload?.meta?.requestId ||
    payload?.error?.requestId ||
    response.headers.get("x-request-id") ||
    "";

  if (!response.ok) {
    throw new SessionRequestError({
      status: response.status,
      code: payload?.error?.code ?? "",
      message: payload?.error?.message ?? "The request could not be completed.",
      requestId,
    });
  }

  return payload?.data ?? {};
}

export type SessionResult = SessionSnapshot & { retry: () => void };

export function useSession(): SessionResult {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const retry = () => {
    void query.refetch();
  };

  if (query.status === "success") {
    return { status: "ready", data: query.data, error: null, retry };
  }

  if (query.status === "error") {
    const error = query.error;
    const mapped: SessionError =
      error instanceof SessionRequestError
        ? {
            status: error.status,
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          }
        : {
            status: 0,
            code: "",
            message:
              error instanceof Error
                ? error.message
                : "Your session could not be verified. No changes were made.",
            requestId: "",
          };
    return { status: "error", data: null, error: mapped, retry };
  }

  return { status: "loading", data: null, error: null, retry };
}
