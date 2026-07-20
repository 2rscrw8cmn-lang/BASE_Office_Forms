import { describe, expect, it } from "vitest";

import { RevisionIllegalTransitionError } from "../../src/domain/revisions/errors";
import {
  assertIsDraft,
  publishStatus,
  supersedeStatus,
} from "../../src/domain/revisions/lifecycle";
import {
  isValidRevisionNumber,
  nextRevisionNumber,
} from "../../src/domain/revisions/numbering";

describe("revision domain lifecycle", () => {
  it("allows only the draft -> published -> superseded flow", () => {
    assertIsDraft("draft");
    expect(publishStatus("draft")).toBe("published");
    expect(supersedeStatus("published")).toBe("superseded");
  });

  it("rejects illegal status transitions", () => {
    expect(() => publishStatus("published")).toThrow(
      RevisionIllegalTransitionError,
    );
    expect(() => publishStatus("superseded")).toThrow(
      RevisionIllegalTransitionError,
    );
    expect(() => supersedeStatus("draft")).toThrow(
      RevisionIllegalTransitionError,
    );
    expect(() => supersedeStatus("superseded")).toThrow(
      RevisionIllegalTransitionError,
    );
    expect(() => {
      assertIsDraft("published");
    }).toThrow(RevisionIllegalTransitionError);
  });

  it("generates the next permanent, record-scoped revision number", () => {
    expect(nextRevisionNumber(0)).toBe(1);
    expect(nextRevisionNumber(1)).toBe(2);
    expect(nextRevisionNumber(999)).toBe(1000);
    expect(() => nextRevisionNumber(-1)).toThrow(RangeError);
  });

  it("validates revision number shape", () => {
    expect(isValidRevisionNumber(1)).toBe(true);
    expect(isValidRevisionNumber(1000)).toBe(true);
    expect(isValidRevisionNumber(0)).toBe(false);
    expect(isValidRevisionNumber(-1)).toBe(false);
    expect(isValidRevisionNumber(1.5)).toBe(false);
  });
});
