/*
 * Read/write access to the existing /api/v2 RFI register contract. This layer
 * does not change response shapes or introduce new endpoints -- it is a typed
 * fetch wrapper equivalent to `public/app-api.js`'s `getProjectRfis`/
 * `createRfi`/`updateRfi`, kept local to the feature per the UI-5 boundary
 * (API/read-model types, query/mutation logic, and UI stay in separate
 * modules).
 */

import type { ProjectRfisReadModel, RfiEditableField } from "./types";

export class RfiApiError extends Error {
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
    this.name = "RfiApiError";
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
  body?: string;
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
    throw new RfiApiError({
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
    throw new RfiApiError({
      status: response.status,
      code: payload?.error?.code || "",
      message: payload?.error?.message || "The request could not be completed.",
      requestId,
    });
  }
  return { data: payload?.data, requestId };
}

export async function fetchProjectRfis(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectRfisReadModel> {
  const { data } = await request(
    `/api/v2/projects/${encodeURIComponent(projectId)}/rfis`,
    {
      signal,
    },
  );
  return data as ProjectRfisReadModel;
}

export interface CreateRfiInput {
  subject: string;
  question: string;
  contractorSuggestion: string | null;
  drawingReferences: string | null;
  specificationReferences: string | null;
  responsiblePartyId: string | null;
  submittedBy: string | null;
  requestedResponseDate: string | null;
  costImpact: string | null;
  scheduleImpact: string | null;
}

export async function createRfiDraft(
  projectId: string,
  input: CreateRfiInput,
): Promise<Record<string, unknown>> {
  const { data } = await request(
    `/api/v2/projects/${encodeURIComponent(projectId)}/rfis`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return data as Record<string, unknown>;
}

export async function updateRfiField(
  projectId: string,
  rfiId: string,
  field: RfiEditableField,
  value: string | null,
  lockVersion: number,
): Promise<Record<string, unknown>> {
  const { data } = await request(
    `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value, lockVersion }),
    },
  );
  return data as Record<string, unknown>;
}
