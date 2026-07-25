/*
 * Typed access to the existing /api/v2 Records contract. This layer adds no
 * endpoints and changes no response shapes -- it is the feature-local
 * equivalent of `public/app-api.js`'s `getProjectRecords` / `createRecord` /
 * `createRevision` / `uploadRevisionFile`, following the same feature-local
 * pattern UI-5 (RFIs) and UI-6A (Projects) already established.
 *
 * Authorization stays entirely server-side: the register requests the whole
 * authorized set once (including archived records, exactly as the legacy
 * controller did) and the browser only searches, filters, and sorts within
 * that already-authorized response.
 */

import type {
  CreatedRecord,
  CreatedRevision,
  CreateRecordInput,
  CreateRevisionInput,
  RecordListItem,
  RecordsReadModel,
} from "./types";

export class RecordsApiError extends Error {
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
    this.name = "RecordsApiError";
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
    throw new RecordsApiError({
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
    throw new RecordsApiError({
      status: response.status,
      code: payload?.error?.code || "",
      message: payload?.error?.message || "The request could not be completed.",
      requestId,
    });
  }
  return { data: payload?.data, requestId };
}

function recordsPath(projectId: string): string {
  return `/api/v2/projects/${encodeURIComponent(projectId)}/records`;
}

/**
 * The whole authorized set in one request, archived included, so archived
 * visibility toggles in the browser without another round trip. This mirrors
 * `createRecordsView`'s single `includeArchived: true` load.
 */
export async function fetchProjectRecords(
  projectId: string,
  signal?: AbortSignal,
): Promise<RecordsReadModel> {
  const { data } = await request(
    `${recordsPath(projectId)}?includeArchived=true`,
    { signal },
  );
  const model = data as
    | { records?: unknown; capabilities?: { createRecord?: boolean } }
    | undefined;
  return {
    records: Array.isArray(model?.records)
      ? (model.records as RecordListItem[])
      : [],
    capabilities: { createRecord: model?.capabilities?.createRecord === true },
  };
}

export async function createRecord(
  projectId: string,
  input: CreateRecordInput,
): Promise<CreatedRecord> {
  const { data } = await request(recordsPath(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return data as CreatedRecord;
}

export async function createRevision(
  projectId: string,
  recordId: string,
  input: CreateRevisionInput,
): Promise<CreatedRevision> {
  const { data } = await request(
    `${recordsPath(projectId)}/${encodeURIComponent(recordId)}/revisions`,
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
  await request(
    `${recordsPath(projectId)}/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/files`,
    { method: "POST", body: form },
  );
}
