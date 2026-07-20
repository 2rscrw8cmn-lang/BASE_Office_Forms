export class FileNotFoundError extends Error {
  constructor() {
    super("The requested file was not found.");
  }
}

export type FileCapability = "files:upload";

export class FileAuthorizationError extends Error {
  constructor(readonly capability: FileCapability) {
    super("The current membership does not have the required file capability.");
  }
}

/** Thrown when writing the uploaded binary to R2 fails before any D1 row exists. */
export class FileStorageWriteError extends Error {
  constructor(readonly cause: unknown) {
    super("The file could not be stored.");
  }
}

/**
 * Thrown after a successful R2 write when D1 persistence (metadata + activity
 * event) fails. `compensationSucceeded` records whether the orphaned R2
 * object was removed, so operators can find and clean up anything left
 * behind without the storage key ever reaching an API response.
 */
export class FileUploadCompensationError extends Error {
  constructor(
    readonly persistenceError: unknown,
    readonly compensationSucceeded: boolean,
    readonly compensationError: unknown,
  ) {
    super(
      compensationSucceeded
        ? "The file upload could not be completed; the stored object was removed."
        : "The file upload could not be completed and the stored object could not be removed automatically.",
    );
  }
}

/** Thrown when a file's D1 metadata exists but its R2 object cannot be found. */
export class FileObjectMissingError extends Error {
  constructor() {
    super("The file's stored content is missing.");
  }
}

/**
 * Thrown when a file's R2 object exists but disagrees with the authoritative
 * D1 metadata (for example its byte size differs). Distinct from a missing
 * object: the stored content is present but cannot be trusted, so it must not
 * be streamed to the caller.
 */
export class FileObjectIntegrityError extends Error {
  constructor() {
    super("The file's stored content does not match its recorded metadata.");
  }
}
