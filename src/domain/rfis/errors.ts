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

export type RfiCapability =
  | "rfis:create_draft"
  | "rfis:update_draft"
  | "rfis:issue"
  | "rfis:respond"
  | "rfis:close"
  | "rfis:reopen";

export class RfiAuthorizationError extends Error {
  constructor(readonly capability: RfiCapability) {
    super("The current membership does not have the required RFI capability.");
  }
}
