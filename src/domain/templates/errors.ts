export class TemplateNotFoundError extends Error {
  constructor() {
    super("The requested template was not found.");
  }
}

export type TemplateCapability = "templates:publish";

export class TemplateAuthorizationError extends Error {
  constructor(readonly capability: TemplateCapability) {
    super(
      "The current membership does not have the required template capability.",
    );
  }
}
