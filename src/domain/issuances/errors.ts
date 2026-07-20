export class IssuanceNotFoundError extends Error {
  constructor() {
    super("The requested issuance was not found.");
  }
}

export type IssuanceCapability = "issuances:issue";

export class IssuanceAuthorizationError extends Error {
  constructor(readonly capability: IssuanceCapability) {
    super(
      "The current membership does not have the required issuance capability.",
    );
  }
}

export class IssuanceEligibilityError extends Error {}

export class IssuanceFileObjectMissingError extends Error {
  constructor() {
    super("An issuance source file's stored content is missing.");
  }
}

export class IssuanceFileObjectIntegrityError extends Error {
  constructor() {
    super(
      "An issuance source file's stored content does not match its recorded metadata.",
    );
  }
}

export class IssuanceStorageVerificationError extends Error {
  constructor(readonly cause: unknown) {
    super("Issuance source files could not be verified.");
  }
}

export class IssuancePersistenceError extends Error {
  constructor(readonly cause: unknown) {
    super("The issuance could not be recorded atomically.");
  }
}
