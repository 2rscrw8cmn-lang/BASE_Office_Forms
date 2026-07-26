/*
 * Typed access to the existing `/api/v2` Record, Revision, and File contracts.
 * The feature-local equivalent of `public/app-api.js`'s `getRecordWorkspace`,
 * `getRevisionWorkspace`, `updateRecord`, `archiveRecord`, `createRevision`,
 * `uploadRevisionFile`, and `publishRevision` -- same paths, same methods, same
 * bodies. No endpoint is added and no response shape is altered for UI-7.
 *
 * Authorization, lifecycle eligibility, numbering, and immutability all stay
 * server-side; this module only carries requests and typed errors.
 */

import type {
  CreatedRevision,
  CreateRevisionInput,
  RecordWorkspaceModel,
  RevisionWorkspaceModel,
  UpdateRecordInput,
} from "./types";

export class RecordWorkspaceApiError extends Error {
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
    this.name = "RecordWorkspaceApiError";
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
    throw new RecordWorkspaceApiError({
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
    throw new RecordWorkspaceApiError({
      status: response.status,
      code: payload?.error?.code || "",
      message: payload?.error?.message || "The request could not be completed.",
      requestId,
    });
  }
  return { data: payload?.data, requestId };
}

function recordPath(projectId: string, recordId: string): string {
  return `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}`;
}

function revisionPath(
  projectId: string,
  recordId: string,
  revisionId: string,
): string {
  return `${recordPath(projectId, recordId)}/revisions/${encodeURIComponent(revisionId)}`;
}

/** The authenticated content endpoint; never a permanent public R2 URL. */
export function fileContentHref(
  projectId: string,
  recordId: string,
  revisionId: string,
  fileId: string,
): string {
  return `${revisionPath(projectId, recordId, revisionId)}/files/${encodeURIComponent(fileId)}/content`;
}

export function recordHref(projectId: string, recordId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}`;
}

export function revisionHref(
  projectId: string,
  recordId: string,
  revisionId: string,
): string {
  return `${recordHref(projectId, recordId)}/revisions/${encodeURIComponent(revisionId)}`;
}

export function recordsRegisterHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/records`;
}

export async function fetchRecordWorkspace(
  projectId: string,
  recordId: string,
  signal?: AbortSignal,
): Promise<RecordWorkspaceModel> {
  const { data } = await request(
    `${recordPath(projectId, recordId)}/workspace`,
    { signal },
  );
  return data as RecordWorkspaceModel;
}

export async function fetchRevisionWorkspace(
  projectId: string,
  recordId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<RevisionWorkspaceModel> {
  const { data } = await request(
    `${revisionPath(projectId, recordId, revisionId)}/workspace`,
    { signal },
  );
  return data as RevisionWorkspaceModel;
}

export async function updateRecord(
  projectId: string,
  recordId: string,
  input: UpdateRecordInput,
): Promise<void> {
  await request(recordPath(projectId, recordId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function archiveRecord(
  projectId: string,
  recordId: string,
): Promise<void> {
  await request(`${recordPath(projectId, recordId)}/archive`, {
    method: "POST",
  });
}

export async function createRevision(
  projectId: string,
  recordId: string,
  input: CreateRevisionInput,
): Promise<CreatedRevision> {
  const { data } = await request(
    `${recordPath(projectId, recordId)}/revisions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return data as CreatedRevision;
}

export async function uploadRevisionFile(
  projectId: string,
  recordId: string,
  revisionId: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await request(`${revisionPath(projectId, recordId, revisionId)}/files`, {
    method: "POST",
    body: form,
  });
}

/**
 * Publication is an official transition, not an ordinary save: it is only ever
 * called from an explicit confirmation, and the server decides whether it is
 * allowed.
 */
export async function publishRevision(
  projectId: string,
  recordId: string,
  revisionId: string,
): Promise<void> {
  await request(`${revisionPath(projectId, recordId, revisionId)}/publish`, {
    method: "POST",
  });
}
