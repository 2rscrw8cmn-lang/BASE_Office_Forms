import { describe, expect, it } from "vitest";

import { REVISION_STATUSES } from "../../src/domain/revisions/revision";
import {
  RevisionValidationError,
  validateRevisionMetadata,
} from "../../src/domain/revisions/validation";

describe("revision domain validation", () => {
  it("supports only the controlled revision statuses", () => {
    expect(REVISION_STATUSES).toEqual(["draft", "published", "superseded"]);
  });

  it("normalizes optional metadata, trims labels, and requires title and changeSummary", () => {
    expect(
      validateRevisionMetadata({
        revisionLabel: "  P0  ",
        title: "  Floor plan  ",
        description: "   ",
        discipline: " Architecture ",
        source: null,
        changeSummary: "  Initial issue  ",
      }),
    ).toEqual({
      revisionLabel: "P0",
      title: "Floor plan",
      description: null,
      discipline: "Architecture",
      source: null,
      changeSummary: "Initial issue",
    });

    expect(
      validateRevisionMetadata({
        revisionLabel: "   ",
        title: "Floor plan",
        description: null,
        discipline: null,
        source: null,
        changeSummary: "Initial issue",
      }).revisionLabel,
    ).toBeNull();

    expect(() =>
      validateRevisionMetadata({
        revisionLabel: null,
        title: "  ",
        description: null,
        discipline: null,
        source: null,
        changeSummary: "Initial issue",
      }),
    ).toThrow(RevisionValidationError);

    expect(() =>
      validateRevisionMetadata({
        revisionLabel: null,
        title: "Floor plan",
        description: null,
        discipline: null,
        source: null,
        changeSummary: "   ",
      }),
    ).toThrow(RevisionValidationError);
  });
});
