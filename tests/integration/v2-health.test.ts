import { describe, expect, it } from "vitest";

import { invokeV2Api, jsonBody } from "../helpers/api";

describe("GET /api/v2/health", () => {
  it("returns the v2 health envelope and request ID", async () => {
    const response = await invokeV2Api("/api/v2/health");
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toMatch(/^req_/);
    expect(body).toMatchObject({
      data: { status: "ok", apiVersion: "v2" },
      meta: { requestId: response.headers.get("X-Request-ID") },
    });
  });

  it("returns a stable error for unsupported methods", async () => {
    const response = await invokeV2Api("/api/v2/health", { method: "POST" });
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "METHOD_NOT_ALLOWED" },
    });
  });

  it("does not route unknown v2 resources into the legacy API", async () => {
    const response = await invokeV2Api("/api/v2/projects");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "API_ROUTE_NOT_FOUND" },
    });
  });
});
