// Shared browser API client for the authenticated /api/v2 platform routes.
// One place owns Accept/Content-Type headers, JSON parsing, request-ID
// extraction, AbortController support, and stable error objects so feature
// modules never duplicate fetch or error-handling logic. Authorization
// decisions are never cached here or in localStorage; every call re-checks the
// server.

export class ApiError extends Error {
  constructor({
    status = 0,
    code = "",
    message,
    requestId = "",
    aborted = false,
  }) {
    super(message || "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.aborted = aborted;
  }
}

function extractRequestId(payload, response) {
  return (
    payload?.meta?.requestId ||
    payload?.error?.requestId ||
    response?.headers?.get?.("x-request-id") ||
    ""
  );
}

export function createApiClient(options = {}) {
  const fetchImpl =
    options.fetch ||
    (typeof window !== "undefined" ? window.fetch.bind(window) : null);
  if (!fetchImpl)
    throw new Error("An API client requires a fetch implementation.");

  async function request(
    path,
    { method = "GET", body, rawBody, signal, headers } = {},
  ) {
    const finalHeaders = { Accept: "application/json", ...(headers || {}) };
    const init = { method, headers: finalHeaders };
    if (signal) init.signal = signal;
    if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    } else if (rawBody !== undefined) {
      init.body = rawBody;
    }

    let response;
    try {
      response = await fetchImpl(path, init);
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new ApiError({
          aborted: true,
          message: "The request was cancelled.",
        });
      }
      throw new ApiError({
        message: "The request could not reach the server.",
      });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const requestId = extractRequestId(payload, response);

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: payload?.error?.code || "",
        message:
          payload?.error?.message || "The request could not be completed.",
        requestId,
      });
    }

    return {
      data: payload ? payload.data : undefined,
      requestId,
      status: response.status,
    };
  }

  return {
    request,
    getDashboard: (opts) => request("/api/v2/dashboard", opts),
    getProjects: (opts) => request("/api/v2/projects", opts),
    getProjectOverview: (projectId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/overview`,
        opts,
      ),
    createProject: (input, opts) =>
      request("/api/v2/projects", {
        ...(opts || {}),
        method: "POST",
        body: input,
      }),
    getProjectRecords: (projectId, { includeArchived = false, ...opts } = {}) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records${
          includeArchived ? "?includeArchived=true" : ""
        }`,
        opts,
      ),
    createRecord: (projectId, input, opts) =>
      request(`/api/v2/projects/${encodeURIComponent(projectId)}/records`, {
        ...(opts || {}),
        method: "POST",
        body: input,
      }),
    getRecordWorkspace: (projectId, recordId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/workspace`,
        opts,
      ),
    updateRecord: (projectId, recordId, input, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}`,
        { ...(opts || {}), method: "PATCH", body: input },
      ),
    archiveRecord: (projectId, recordId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/archive`,
        { ...(opts || {}), method: "POST" },
      ),
    createRevision: (projectId, recordId, input, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions`,
        { ...(opts || {}), method: "POST", body: input },
      ),
    getRevisionWorkspace: (projectId, recordId, revisionId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/workspace`,
        opts,
      ),
    uploadRevisionFile: (projectId, recordId, revisionId, file, opts) => {
      const form = new FormData();
      form.append("file", file);
      return request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/files`,
        { ...(opts || {}), method: "POST", rawBody: form },
      );
    },
    publishRevision: (projectId, recordId, revisionId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/publish`,
        { ...(opts || {}), method: "POST" },
      ),
    getProjectRfis: (projectId, opts) =>
      request(`/api/v2/projects/${encodeURIComponent(projectId)}/rfis`, opts),
    createRfi: (projectId, input, opts) =>
      request(`/api/v2/projects/${encodeURIComponent(projectId)}/rfis`, {
        ...(opts || {}),
        method: "POST",
        body: input,
      }),
    getRfiWorkspace: (projectId, rfiId, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}/workspace`,
        opts,
      ),
    updateRfi: (projectId, rfiId, input, opts) =>
      request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}`,
        { ...(opts || {}), method: "PATCH", body: input },
      ),
    uploadRfiAttachment: (projectId, rfiId, role, file, opts) => {
      const form = new FormData();
      form.append("role", role);
      form.append("file", file);
      return request(
        `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}/attachments`,
        { ...(opts || {}), method: "POST", rawBody: form },
      );
    },
  };
}
