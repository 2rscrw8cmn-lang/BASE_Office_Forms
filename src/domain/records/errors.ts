export class RecordNotFoundError extends Error {
  constructor() {
    super("The requested record was not found.");
  }
}

export class RecordArchivedError extends Error {
  constructor(readonly action: "be edited" | "be archived") {
    super(`Record cannot ${action} while archived.`);
  }
}

export type RecordCapability =
  "records:create" | "records:update" | "records:archive";

export class RecordAuthorizationError extends Error {
  constructor(readonly capability: RecordCapability) {
    super(
      "The current membership does not have the required record capability.",
    );
  }
}
