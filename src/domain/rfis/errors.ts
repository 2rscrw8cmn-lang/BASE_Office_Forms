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
