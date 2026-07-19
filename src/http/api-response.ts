const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export interface ApiRequestContext {
  requestId: string;
}

export function createApiRequestContext(): ApiRequestContext {
  return { requestId: `req_${crypto.randomUUID()}` };
}

export function apiSuccess(
  context: ApiRequestContext,
  data: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({ data, meta: { requestId: context.requestId } }),
    {
      status,
      headers: { ...JSON_HEADERS, "X-Request-ID": context.requestId },
    },
  );
}

export function apiError(
  context: ApiRequestContext,
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      error: { code, message, requestId: context.requestId },
    }),
    {
      status,
      headers: { ...JSON_HEADERS, "X-Request-ID": context.requestId },
    },
  );
}
