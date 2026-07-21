import { describe, expect, it } from "vitest";

import { RecordValidationError } from "../../src/domain/records/validation";
import { RECORD_STATUSES, RECORD_TYPES } from "../../src/domain/records/record";
import { validateRecordMetadata } from "../../src/domain/records/validation";

describe("record domain validation", () => {
  it("supports only the initial controlled record types and statuses", () => {
    expect(RECORD_TYPES).toEqual([
      "document",
      "drawing",
      "specification",
      "schedule",
      "report",
      "correspondence",
      "other",
    ]);
    expect(RECORD_STATUSES).toEqual(["active", "archived"]);
  });

  it("normalizes optional metadata and rejects invalid required metadata", () => {
    expect(
      validateRecordMetadata({
        recordType: "drawing",
        title: "  Floor plan  ",
        description: "   ",
        discipline: " architectural ",
        source: null,
      }),
    ).toEqual({
      recordType: "drawing",
      title: "Floor plan",
      description: null,
      discipline: "architectural",
      source: null,
    });
    expect(() =>
      validateRecordMetadata({
        recordType: "rfi",
        title: "Valid title",
        description: null,
        discipline: null,
        source: null,
      }),
    ).toThrow(RecordValidationError);
    expect(() =>
      validateRecordMetadata({
        recordType: "document",
        title: "  ",
        description: null,
        discipline: null,
        source: null,
      }),
    ).toThrow(RecordValidationError);
    expect(() =>
      validateRecordMetadata({
        recordType: "document",
        title: "Valid title",
        description: null,
        discipline: "Architecture",
        source: null,
      }),
    ).toThrow(RecordValidationError);
  });

  it("allows an existing legacy discipline only when it remains unchanged", () => {
    expect(
      validateRecordMetadata(
        {
          recordType: "document",
          title: "Legacy document",
          description: null,
          discipline: "ARCH",
          source: null,
        },
        { existingDiscipline: "ARCH" },
      ).discipline,
    ).toBe("ARCH");
    expect(() =>
      validateRecordMetadata(
        {
          recordType: "document",
          title: "Legacy document",
          description: null,
          discipline: "Different legacy value",
          source: null,
        },
        { existingDiscipline: "ARCH" },
      ),
    ).toThrow(RecordValidationError);
  });
});
