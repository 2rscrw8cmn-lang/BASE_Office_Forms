/*
 * The Slice 2B API layer: the exact endpoints, methods, bodies, and headers the
 * accepted Slice 2A contract requires, plus faithful propagation of the server's
 * error code, message, and request ID. The browser never invents a number, a
 * status, or an idempotency key here.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  issueRfi,
  markRfiReady,
  RfiWorkspaceApiError,
} from "../../src/ui/features/rfi-workspace/api";
import type { RfiIssueRequestInput } from "../../src/ui/features/rfi-workspace/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function stub(response: Response | (() => Promise<Response>)) {
  const calls: Captured[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    calls.push({
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers,
      body: typeof init?.body === "string" ? init.body : "",
    });
    return typeof response === "function"
      ? response()
      : Promise.resolve(response.clone());
  };
  return calls;
}

function json(body: unknown, status = 200, requestId?: string): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (requestId) headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

const REQUEST: RfiIssueRequestInput = {
  recipientProjectContactIds: ["contact-1"],
  ccProjectContactIds: ["contact-2"],
  responseDueDate: "2026-08-05",
  includedFileIds: ["attachment-1"],
  deliveryMode: "record_only",
};

describe("markRfiReady", () => {
  it("POSTs the ready endpoint with no body", async () => {
    const calls = stub(json({ data: {} }));
    await markRfiReady("p 1", "rfi 1");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/api/v2/projects/p%201/rfis/rfi%201/ready");
    expect(calls[0].body).toBe("");
  });

  it("propagates 422 RFI_READY_VALIDATION_FAILED with its request ID", async () => {
    stub(
      json(
        {
          error: {
            code: "RFI_READY_VALIDATION_FAILED",
            message: "A responsible project contact is required.",
            requestId: "req-ready",
          },
        },
        422,
      ),
    );

    const error = await markRfiReady("p1", "rfi-1").catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(RfiWorkspaceApiError);
    const api = error as RfiWorkspaceApiError;
    expect(api.status).toBe(422);
    expect(api.code).toBe("RFI_READY_VALIDATION_FAILED");
    expect(api.message).toBe("A responsible project contact is required.");
    expect(api.requestId).toBe("req-ready");
  });
});

describe("issueRfi", () => {
  it("sends the exact endpoint, body, and Idempotency-Key header", async () => {
    const calls = stub(
      json({ data: { officialDisplayNumber: "RFI-001" } }, 200, "req-issue"),
    );
    const { result, requestId } = await issueRfi(
      "project-1",
      "rfi-1",
      "key-abc",
      REQUEST,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/api/v2/projects/project-1/rfis/rfi-1/issue");
    expect(calls[0].headers["idempotency-key"]).toBe("key-abc");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0].body)).toEqual({
      recipientProjectContactIds: ["contact-1"],
      ccProjectContactIds: ["contact-2"],
      responseDueDate: "2026-08-05",
      includedFileIds: ["attachment-1"],
      deliveryMode: "record_only",
    });
    // No client-supplied number, status, or unknown field is ever sent.
    expect(calls[0].body).not.toContain("rfiNumber");
    expect(calls[0].body).not.toContain("status");
    expect(result.officialDisplayNumber).toBe("RFI-001");
    expect(requestId).toBe("req-issue");
  });

  it("returns the typed official issue result", async () => {
    stub(
      json({
        data: {
          rfiId: "rfi-1",
          recordId: "rfi-1",
          officialDisplayNumber: "RFI-014",
          status: "open",
          issuedRevision: {
            id: "rev-1",
            internalRevisionNumber: 1,
            userFacingVersion: "Original Issue",
          },
          issuance: { id: "iss-1", issueNumber: "ISS-014" },
          issuedAt: "2026-07-25T09:00:00Z",
          responseDueDate: "2026-08-05",
          officialArtifact: { fileId: "artifact-1" },
          includedFiles: [],
          recipients: { to: [], cc: [] },
          capabilities: { issue: false },
          requestId: "req-issue",
        },
      }),
    );

    const { result } = await issueRfi("project-1", "rfi-1", "key", REQUEST);
    expect(result.status).toBe("open");
    expect(result.issuance.issueNumber).toBe("ISS-014");
    expect(result.issuedRevision.userFacingVersion).toBe("Original Issue");
  });

  it("propagates each documented server failure with its code and request ID", async () => {
    const cases: [number, string][] = [
      [400, "IDEMPOTENCY_KEY_REQUIRED"],
      [400, "VALIDATION_FAILED"],
      [401, "AUTHENTICATION_REQUIRED"],
      [409, "RFI_ILLEGAL_TRANSITION"],
      [409, "RFI_ALREADY_ISSUED"],
      [409, "IDEMPOTENCY_KEY_REUSED"],
      [422, "RFI_ISSUE_VALIDATION_FAILED"],
      [503, "RFI_ARTIFACT_RENDER_FAILED"],
      [503, "RFI_STORAGE_UNAVAILABLE"],
      [503, "RFI_ISSUE_COMMIT_FAILED"],
      [500, "RFI_ARTIFACT_RECONCILIATION_REQUIRED"],
    ];

    for (const [status, code] of cases) {
      stub(
        json(
          { error: { code, message: `${code} happened`, requestId: "req-x" } },
          status,
        ),
      );
      const error = (await issueRfi("p", "r", "key", REQUEST).catch(
        (thrown: unknown) => thrown,
      )) as RfiWorkspaceApiError;
      expect(error).toBeInstanceOf(RfiWorkspaceApiError);
      expect(error.status).toBe(status);
      expect(error.code).toBe(code);
      expect(error.requestId).toBe("req-x");
    }
  });

  it("reports an unreachable server as an outcome-unknown failure, not a refusal", async () => {
    stub(() => Promise.reject(new Error("network down")));
    const error = (await issueRfi("p", "r", "key", REQUEST).catch(
      (thrown: unknown) => thrown,
    )) as RfiWorkspaceApiError;

    expect(error).toBeInstanceOf(RfiWorkspaceApiError);
    // Status 0 is deliberately not a 4xx: a failed fetch does not prove the
    // request never arrived.
    expect(error.status).toBe(0);
    expect(error.code).toBe("");
  });
});
