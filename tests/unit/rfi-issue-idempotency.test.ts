/*
 * The idempotency rules for official RFI issue, proven at the level where they
 * are decided. A second key against the same RFI is the one way this UI could
 * cause a duplicate official issuance, so each rule is asserted directly rather
 * than only through the dialog.
 */

import { describe, expect, it } from "vitest";
import { RfiWorkspaceApiError } from "../../src/ui/features/rfi-workspace/api";
import {
  attemptLocksPayload,
  canonicalIssuePayload,
  classifyIssueFailure,
  createIdempotencyKey,
  discardUnusedAttempt,
  resolveAttemptKey,
  type IssueAttempt,
} from "../../src/ui/features/rfi-workspace/issueAttempt";
import type { RfiIssueRequestInput } from "../../src/ui/features/rfi-workspace/types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function payload(
  overrides: Partial<RfiIssueRequestInput> = {},
): RfiIssueRequestInput {
  return {
    recipientProjectContactIds: ["contact-1"],
    ccProjectContactIds: [],
    responseDueDate: "2026-08-05",
    includedFileIds: ["file-1"],
    deliveryMode: "record_only",
    ...overrides,
  };
}

function attempt(overrides: Partial<IssueAttempt> = {}): IssueAttempt {
  return {
    status: "retryable",
    key: "key-1",
    payload: canonicalIssuePayload(payload()),
    requestId: "req-1",
    message: "",
    code: "",
    ...overrides,
  };
}

describe("createIdempotencyKey", () => {
  it("uses crypto.randomUUID when the runtime provides it", () => {
    const source = {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    } as unknown as Crypto;
    expect(createIdempotencyKey(source)).toBe(
      "11111111-2222-4333-8444-555555555555",
    );
  });

  it("falls back to a cryptographic v4 UUID, never Math.random", () => {
    const source = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    } as unknown as Crypto;
    const key = createIdempotencyKey(source);
    expect(key).toMatch(UUID);
  });

  it("produces distinct keys for distinct attempts", () => {
    const keys = new Set(
      Array.from({ length: 25 }, () => createIdempotencyKey()),
    );
    expect(keys.size).toBe(25);
    for (const key of keys) {
      expect(key.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("canonicalIssuePayload", () => {
  it("is stable for the same request and different for a changed one", () => {
    expect(canonicalIssuePayload(payload())).toBe(
      canonicalIssuePayload(payload()),
    );
    expect(canonicalIssuePayload(payload())).not.toBe(
      canonicalIssuePayload(payload({ responseDueDate: "2026-08-06" })),
    );
    expect(canonicalIssuePayload(payload())).not.toBe(
      canonicalIssuePayload(payload({ ccProjectContactIds: ["contact-2"] })),
    );
    expect(canonicalIssuePayload(payload())).not.toBe(
      canonicalIssuePayload(payload({ includedFileIds: [] })),
    );
  });
});

describe("resolveAttemptKey", () => {
  const makeKey = () => "new-key";

  it("mints a key for the first deliberate attempt", () => {
    expect(
      resolveAttemptKey(null, canonicalIssuePayload(payload()), makeKey),
    ).toBe("new-key");
  });

  it("reuses the key for a retry of the same payload", () => {
    for (const status of ["retryable", "uncertain", "pending"] as const) {
      expect(
        resolveAttemptKey(
          attempt({ status }),
          canonicalIssuePayload(payload()),
          makeKey,
        ),
      ).toBe("key-1");
    }
  });

  it("never reuses a key once the payload changed", () => {
    expect(
      resolveAttemptKey(
        attempt({ status: "uncertain" }),
        canonicalIssuePayload(payload({ responseDueDate: "2026-09-01" })),
        makeKey,
      ),
    ).toBe("new-key");
  });

  it("never reuses a key the server definitively refused", () => {
    expect(
      resolveAttemptKey(
        attempt({ status: "rejected" }),
        canonicalIssuePayload(payload()),
        makeKey,
      ),
    ).toBe("new-key");
  });
});

describe("attemptLocksPayload / discardUnusedAttempt", () => {
  it("locks the submitted payload while the outcome is unknown", () => {
    expect(attemptLocksPayload(attempt({ status: "pending" }))).toBe(true);
    expect(attemptLocksPayload(attempt({ status: "uncertain" }))).toBe(true);
    expect(attemptLocksPayload(attempt({ status: "reconcile" }))).toBe(true);
  });

  it("leaves the payload editable after a definitive outcome", () => {
    expect(attemptLocksPayload(null)).toBe(false);
    expect(attemptLocksPayload(attempt({ status: "retryable" }))).toBe(false);
    expect(attemptLocksPayload(attempt({ status: "rejected" }))).toBe(false);
  });

  it("spends an unused key on edit but never drops an unresolved one", () => {
    expect(discardUnusedAttempt(attempt({ status: "retryable" }))).toBeNull();
    expect(discardUnusedAttempt(attempt({ status: "rejected" }))).toBeNull();
    expect(
      discardUnusedAttempt(attempt({ status: "uncertain" })),
    ).not.toBeNull();
    expect(discardUnusedAttempt(attempt({ status: "pending" }))).not.toBeNull();
    expect(
      discardUnusedAttempt(attempt({ status: "reconcile" })),
    ).not.toBeNull();
  });
});

describe("classifyIssueFailure", () => {
  const apiError = (status: number, code: string) =>
    new RfiWorkspaceApiError({ status, code, message: code });

  it("treats an unreachable server as an unknown outcome", () => {
    expect(classifyIssueFailure(apiError(0, ""))).toBe("uncertain");
    expect(classifyIssueFailure(new Error("boom"))).toBe("uncertain");
  });

  it("treats definitive pre-commit failures as retryable with the same key", () => {
    expect(
      classifyIssueFailure(apiError(503, "RFI_ARTIFACT_RENDER_FAILED")),
    ).toBe("retryable");
    expect(classifyIssueFailure(apiError(503, "RFI_STORAGE_UNAVAILABLE"))).toBe(
      "retryable",
    );
    expect(classifyIssueFailure(apiError(503, "RFI_ISSUE_COMMIT_FAILED"))).toBe(
      "retryable",
    );
  });

  it("treats reconciliation as its own terminal state", () => {
    expect(
      classifyIssueFailure(
        apiError(500, "RFI_ARTIFACT_RECONCILIATION_REQUIRED"),
      ),
    ).toBe("reconcile");
  });

  it("treats client refusals as definitive", () => {
    for (const [status, code] of [
      [400, "IDEMPOTENCY_KEY_REQUIRED"],
      [400, "VALIDATION_FAILED"],
      [401, "AUTHENTICATION_REQUIRED"],
      [403, "AUTHORIZATION_DENIED"],
      [404, "RFI_NOT_FOUND"],
      [409, "RFI_ILLEGAL_TRANSITION"],
      [409, "RFI_ALREADY_ISSUED"],
      [409, "IDEMPOTENCY_KEY_REUSED"],
      [422, "RFI_ISSUE_VALIDATION_FAILED"],
    ] as [number, string][]) {
      expect(classifyIssueFailure(apiError(status, code))).toBe("rejected");
    }
  });

  it("treats an unexplained server error as an unknown outcome", () => {
    expect(classifyIssueFailure(apiError(500, "INTERNAL_ERROR"))).toBe(
      "uncertain",
    );
    expect(classifyIssueFailure(apiError(502, ""))).toBe("uncertain");
  });
});
