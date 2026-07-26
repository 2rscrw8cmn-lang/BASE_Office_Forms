/*
 * Typed access to the existing `/api/v2` RFI contract: the feature-local
 * equivalent of `public/app-api.js`'s `getRfiWorkspace`, `updateRfi`,
 * `recordRfiResponse`, `uploadRfiAttachment`, and the lifecycle transition
 * POSTs. Same paths, same methods, same bodies; no endpoint or response shape
 * changed for UI-7.
 *
 * Issuance is deliberately absent. The server fails `issue`/`ready` closed until
 * the Slice 2 transaction exists, and this module offers no way to call them.
 */

import type {
  RecordResponseInput,
  RfiTransition,
  RfiWorkspaceModel,
  UpdateRfiInput,
} from "./types";

export class RfiWorkspaceApiError extends Error {
  status: number;
  code: string;
  requestId: string;

  constructor(options: {
    status?: number;
    code?: string;
    message?: string;
    requestId?: string;
  }) {
    super(options.message || "The request could not be completed.");
    this.name = "RfiWorkspaceApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "";
    this.requestId = options.requestId ?? "";
  }
}

interface ApiEnvelope {
  data?: unknown;
  meta?: { requestId?: string };
  error?: { code?: string; message?: string; requestId?: string };
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

async function request(
  path: string,
  init: RequestOptions = {},
): Promise<{ data: unknown; requestId: string }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      body: init.body,
      signal: init.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new RfiWorkspaceApiError({
      message: "The request could not reach the server.",
    });
  }

  const payload = (await response
    .json()
    .catch(() => null)) as ApiEnvelope | null;
  const requestId =
    payload?.meta?.requestId ||
    payload?.error?.requestId ||
    response.headers.get("x-request-id") ||
    "";

  if (!response.ok) {
    throw new RfiWorkspaceApiError({
      status: response.status,
      code: payload?.error?.code || "",
      message: payload?.error?.message || "The request could not be completed.",
      requestId,
    });
  }
  return { data: payload?.data, requestId };
}

function rfiPath(projectId: string, rfiId: string): string {
  return `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}`;
}

export function rfiRegisterHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/rfis`;
}

/** Authenticated attachment content endpoint; never a public storage URL. */
export function attachmentContentHref(
  projectId: string,
  rfiId: string,
  attachmentId: string,
): string {
  return `${rfiPath(projectId, rfiId)}/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export async function fetchRfiWorkspace(
  projectId: string,
  rfiId: string,
  signal?: AbortSignal,
): Promise<RfiWorkspaceModel> {
  const { data } = await request(`${rfiPath(projectId, rfiId)}/workspace`, {
    signal,
  });
  return data as RfiWorkspaceModel;
}

export async function updateRfi(
  projectId: string,
  rfiId: string,
  input: UpdateRfiInput,
): Promise<void> {
  await request(rfiPath(projectId, rfiId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function recordRfiResponse(
  projectId: string,
  rfiId: string,
  input: RecordResponseInput,
): Promise<void> {
  await request(`${rfiPath(projectId, rfiId)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadRfiAttachment(
  projectId: string,
  rfiId: string,
  role: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("role", role);
  form.append("file", file);
  await request(`${rfiPath(projectId, rfiId)}/attachments`, {
    method: "POST",
    body: form,
  });
}

/**
 * A lifecycle transition, never an ordinary save. Only transitions that already
 * had a browser surface are callable; `issue` and `ready` are not offered.
 */
export async function runRfiTransition(
  projectId: string,
  rfiId: string,
  transition: RfiTransition,
): Promise<void> {
  await request(`${rfiPath(projectId, rfiId)}/${transition}`, {
    method: "POST",
  });
}
