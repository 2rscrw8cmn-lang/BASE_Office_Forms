/*
 * Browser-side idempotency for official RFI issue.
 *
 * One deliberate operator attempt gets exactly one key. That key survives every
 * retry of the same canonical payload, including retries after a network
 * failure or an ambiguous server outcome, because a second key against the same
 * RFI is the one way this UI could cause a duplicate official issuance. A key is
 * only ever discarded when it was never definitively used and the operator has
 * changed the payload it belonged to.
 *
 * Nothing here is persisted: the key lives in component state for the lifetime
 * of the attempt and is never written to localStorage, a URL, the activity feed,
 * or the rendered page.
 */

import { RfiWorkspaceApiError } from "./api";
import type { RfiIssueRequestInput } from "./types";

/**
 * A cryptographically suitable UUID. `crypto.randomUUID` is used when the
 * runtime provides it; the fallback builds an RFC 4122 v4 value from
 * `crypto.getRandomValues`, so the key is never derived from `Math.random`.
 * The source is injectable purely so tests can prove both paths.
 */
export function createIdempotencyKey(
  source: Crypto = globalThis.crypto,
): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A stable string identity for one issue request body. Field order is fixed so
 * two logically identical payloads always compare equal, which is what decides
 * whether a retry may reuse the existing key.
 */
export function canonicalIssuePayload(input: RfiIssueRequestInput): string {
  return JSON.stringify({
    recipientProjectContactIds: input.recipientProjectContactIds,
    ccProjectContactIds: input.ccProjectContactIds,
    responseDueDate: input.responseDueDate,
    includedFileIds: input.includedFileIds,
    deliveryMode: input.deliveryMode,
  });
}

/**
 * `pending`   — a request is in flight.
 * `retryable` — the server definitively failed before committing; the same key
 *               and the same payload may be sent again.
 * `uncertain` — the request may or may not have committed (network failure,
 *               timeout, unexpected response). Nothing may change until an
 *               authoritative workspace read settles it.
 * `reconcile` — `RFI_ARTIFACT_RECONCILIATION_REQUIRED`. Support must reconcile;
 *               a blind retry is never offered and no second key is minted.
 * `rejected`  — a definitive refusal (validation, conflict, permission). The
 *               payload must change, so the key is spent.
 */
export type IssueAttemptStatus =
  "pending" | "retryable" | "uncertain" | "reconcile" | "rejected";

export interface IssueAttempt {
  status: IssueAttemptStatus;
  /** The idempotency key for this attempt. Never rendered. */
  key: string;
  /** `canonicalIssuePayload` of the exact body that was submitted. */
  payload: string;
  requestId: string;
  message: string;
  code: string;
}

/**
 * The key to submit with. An attempt that failed transiently or ambiguously
 * keeps its key as long as the payload is byte-identical; anything else is a
 * new deliberate attempt and gets a new key.
 */
export function resolveAttemptKey(
  current: IssueAttempt | null,
  payload: string,
  makeKey: () => string = createIdempotencyKey,
): string {
  if (
    current &&
    current.payload === payload &&
    (current.status === "retryable" ||
      current.status === "uncertain" ||
      current.status === "pending")
  ) {
    return current.key;
  }
  return makeKey();
}

/** While true, the submitted payload must not be editable or resubmittable. */
export function attemptLocksPayload(current: IssueAttempt | null): boolean {
  if (!current) return false;
  return (
    current.status === "pending" ||
    current.status === "uncertain" ||
    current.status === "reconcile"
  );
}

/**
 * Editing the payload invalidates a key that was never definitively used. A
 * locked attempt is left alone — its fields cannot be edited in the first
 * place, and silently dropping an in-flight or unresolved key would be exactly
 * the duplicate-issue hazard this module exists to prevent.
 */
export function discardUnusedAttempt(
  current: IssueAttempt | null,
): IssueAttempt | null {
  if (!current) return null;
  return attemptLocksPayload(current) ? current : null;
}

export type IssueFailureKind =
  "retryable" | "uncertain" | "reconcile" | "rejected";

/**
 * Classifies an issue failure into what the operator may safely do next.
 *
 * A definitive server refusal is `rejected`; a definitive pre-commit failure is
 * `retryable` with the same key; anything that leaves the outcome unknown —
 * including a failed fetch, which does not prove the request never reached the
 * server — is `uncertain`. Reconciliation is its own terminal state.
 */
export function classifyIssueFailure(error: unknown): IssueFailureKind {
  if (!(error instanceof RfiWorkspaceApiError)) return "uncertain";
  if (error.code === "RFI_ARTIFACT_RECONCILIATION_REQUIRED") return "reconcile";
  // status 0 is this API layer's "the request could not reach the server", which
  // is not proof that it never arrived.
  if (error.status === 0) return "uncertain";
  if (
    error.code === "RFI_ARTIFACT_RENDER_FAILED" ||
    error.code === "RFI_STORAGE_UNAVAILABLE" ||
    error.code === "RFI_ISSUE_COMMIT_FAILED"
  ) {
    return "retryable";
  }
  if (error.status >= 400 && error.status < 500) return "rejected";
  return "uncertain";
}
