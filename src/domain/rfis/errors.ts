export class RfiNotFoundError extends Error {
  constructor() {
    super("The requested RFI was not found.");
  }
}

export class RfiIllegalTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(`RFI cannot ${action} while in ${from} status.`);
  }
}

// Optimistic-concurrency failure: the caller's lockVersion no longer matches the
// authoritative row, meaning another writer changed it first. Surfaced as 409 so
// the browser can reload and let the user retry honestly.
export class RfiConflictError extends Error {
  constructor() {
    super("This RFI was changed by someone else. Reload and try again.");
  }
}

export class RfiIssueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RfiIssueValidationError";
  }
}

export class RfiIssueIdempotencyConflictError extends Error {
  constructor() {
    super("This Idempotency-Key was already used with a different request.");
    this.name = "RfiIssueIdempotencyConflictError";
  }
}

export class RfiAlreadyIssuedError extends Error {
  constructor() {
    super("This RFI already has an official issuance.");
    this.name = "RfiAlreadyIssuedError";
  }
}

export class RfiIssueStorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RfiIssueStorageError";
  }
}

export class RfiIssueRenderError extends Error {
  constructor(readonly cause?: unknown) {
    super("The official RFI artifact could not be generated.");
    this.name = "RfiIssueRenderError";
  }
}

export class RfiIssuePersistenceError extends Error {
  constructor(readonly cause?: unknown) {
    super("The official RFI issuance could not be committed.");
    this.name = "RfiIssuePersistenceError";
  }
}

export class RfiIssueCompensationError extends Error {
  constructor(readonly cause?: unknown) {
    super(
      "The issuance failed and its uncommitted artifact requires reconciliation.",
    );
    this.name = "RfiIssueCompensationError";
  }
}

export class RfiResponsibleContactError extends Error {
  constructor() {
    super("Responsible party must be an active contact for this project.");
  }
}

// Normalized, server-derived RFI capabilities. Only capabilities that are
// actually implemented and authoritative are ever returned to the browser.
export type RfiCapability =
  | "rfis:create_draft"
  | "rfis:update_draft"
  | "rfis:upload_attachment"
  | "rfis:mark_ready"
  | "rfis:issue"
  | "rfis:respond"
  | "rfis:return_for_clarification"
  | "rfis:close"
  | "rfis:reopen"
  | "rfis:void";

export class RfiAuthorizationError extends Error {
  constructor(readonly capability: RfiCapability) {
    super("The current membership does not have the required RFI capability.");
  }
}
