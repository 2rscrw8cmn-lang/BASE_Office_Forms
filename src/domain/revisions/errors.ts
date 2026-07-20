export class RevisionNotFoundError extends Error {
  constructor() {
    super("The requested revision was not found.");
  }
}

export class RevisionIllegalTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(`Revision cannot ${action} while in ${from} status.`);
  }
}

export type RevisionCapability = "revisions:create_draft" | "revisions:publish";

export class RevisionAuthorizationError extends Error {
  constructor(readonly capability: RevisionCapability) {
    super(
      "The current membership does not have the required revision capability.",
    );
  }
}
