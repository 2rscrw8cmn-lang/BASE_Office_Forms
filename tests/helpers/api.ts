import { createPagesEventContext } from "cloudflare:test";

import { onRequest as legacyApi } from "../../functions/api/[[path]]";
import { routeV2Request } from "../../src/http/v2/router";

export function apiRequest(
  path: string,
  init: RequestInit = {},
): Request<unknown, IncomingRequestCfProperties> {
  return new Request(`https://example.test${path}`, init) as Request<
    unknown,
    IncomingRequestCfProperties
  >;
}

export function invokeV2Api(path: string, init: RequestInit = {}): Response {
  return routeV2Request(apiRequest(path, init));
}

export async function invokeLegacyApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const routePath = path.replace(/^\/api\/?/, "");
  const params = routePath ? routePath.split("/") : [];

  const context = createPagesEventContext<typeof legacyApi>({
    request: apiRequest(path, init),
    functionPath: "/api/[[path]]",
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    params: { path: params },
    data: {},
  });
  return legacyApi(context);
}

export async function jsonBody(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected a JSON object response.");
  }
  return body as Record<string, unknown>;
}
