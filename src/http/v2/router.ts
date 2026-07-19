import { apiError, apiSuccess, createApiRequestContext } from "../api-response";

const V2_BASE_PATH = "/api/v2";

export function routeV2Request(request: Request): Response {
  const context = createApiRequestContext();
  const { pathname } = new URL(request.url);

  if (pathname === `${V2_BASE_PATH}/health`) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return apiError(
        context,
        405,
        "METHOD_NOT_ALLOWED",
        "This route only supports GET and HEAD.",
      );
    }

    const response = apiSuccess(context, { status: "ok", apiVersion: "v2" });
    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }
    return response;
  }

  return apiError(
    context,
    404,
    "API_ROUTE_NOT_FOUND",
    "The requested API route was not found.",
  );
}
