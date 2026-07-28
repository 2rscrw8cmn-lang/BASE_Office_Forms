/*
 * Typed access to the existing `/api/v2` RFI contract: the feature-local
 * equivalent of `public/app-api.js`'s `getRfiWorkspace`, `updateRfi`,
 * `recordRfiResponse`, `uploadRfiAttachment`, and the lifecycle transition
 * POSTs. Same paths, same methods, same bodies; no endpoint or response shape
 * changed for UI-7.
 *
 * Slice 2B adds the two remaining pre-response lifecycle calls the browser
 * needs — `POST .../ready` and `POST .../issue` — against the accepted Slice 2A
 * contract. Nothing here re-implements server authority: numbering, validation,
 * idempotency persistence, and artifact commit all stay on the server.
 */

import type {
  RecordResponseInput,
  RfiIssueRequestInput,
  RfiOfficialIssueResult,
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
 * A lifecycle transition, never an ordinary save. `ready` and `issue` have their
 * own typed operations below because they carry extra contract obligations.
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

/**
 * `draft -> ready_to_issue`. The server re-validates subject, question, the
 * active same-project responsible contact, and the exact published template
 * binding, and answers `422 RFI_READY_VALIDATION_FAILED` when any of them fail;
 * the RFI then stays editable in `draft`. No body is sent: there is nothing the
 * browser may assert about readiness.
 */
export async function markRfiReady(
  projectId: string,
  rfiId: string,
): Promise<void> {
  await request(`${rfiPath(projectId, rfiId)}/ready`, { method: "POST" });
}

/**
 * The one official issue call.
 *
 * The `Idempotency-Key` header is required by the server and is supplied
 * explicitly by the caller rather than generated here, because one deliberate
 * operator attempt — including every retry of the same canonical payload — must
 * carry exactly one key. Generating it inside this function would silently mint
 * a second key on retry and risk a duplicate official issue.
 */
export async function issueRfi(
  projectId: string,
  rfiId: string,
  idempotencyKey: string,
  input: RfiIssueRequestInput,
  signal?: AbortSignal,
): Promise<{ result: RfiOfficialIssueResult; requestId: string }> {
  const { data, requestId } = await request(
    `${rfiPath(projectId, rfiId)}/issue`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
      signal,
    },
  );
  return { result: data as RfiOfficialIssueResult, requestId };
}
