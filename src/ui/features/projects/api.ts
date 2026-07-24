import type {
  CreateProjectInput,
  ProjectListItem,
  ProjectsReadModel,
} from "./types";

export class ProjectsApiError extends Error {
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
    this.name = "ProjectsApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "";
    this.requestId = options.requestId ?? "";
  }
}

interface ProjectsEnvelope {
  data?: unknown;
  meta?: {
    requestId?: string;
    capabilities?: { createProject?: boolean };
  };
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
): Promise<{ payload: ProjectsEnvelope; requestId: string }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      body: init.body,
      signal: init.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new ProjectsApiError({
      message: "The request could not reach the server.",
    });
  }

  const payload = (await response
    .json()
    .catch(() => null)) as ProjectsEnvelope | null;
  const requestId =
    payload?.meta?.requestId ||
    payload?.error?.requestId ||
    response.headers.get("x-request-id") ||
    "";

  if (!response.ok) {
    throw new ProjectsApiError({
      status: response.status,
      code: payload?.error?.code || "",
      message: payload?.error?.message || "The request could not be completed.",
      requestId,
    });
  }

  return { payload: payload ?? {}, requestId };
}

export async function fetchProjects(
  signal?: AbortSignal,
): Promise<ProjectsReadModel> {
  const { payload } = await request("/api/v2/projects", { signal });
  return {
    projects: Array.isArray(payload.data)
      ? (payload.data as ProjectListItem[])
      : [],
    capabilities: {
      createProject: payload.meta?.capabilities?.createProject === true,
    },
  };
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectListItem> {
  const { payload } = await request("/api/v2/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return payload.data as ProjectListItem;
}
