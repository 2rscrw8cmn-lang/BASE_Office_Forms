import { describe, expect, it } from "vitest";

import { RfiIllegalTransitionError } from "../../src/domain/rfis/errors";
import {
  assertCanUpdateDraft,
  closeStatus,
  issueStatus,
  reopenStatus,
  respondStatus,
} from "../../src/domain/rfis/lifecycle";
import { formatRfiNumber } from "../../src/domain/rfis/numbering";

describe("RFI domain lifecycle", () => {
  it("allows only the draft → issued → answered → closed → answered flow", () => {
    assertCanUpdateDraft("draft");
    expect(issueStatus("draft")).toBe("issued");
    expect(respondStatus("issued")).toBe("answered");
    expect(closeStatus("answered")).toBe("closed");
    expect(reopenStatus("closed")).toBe("answered");
  });

  it("rejects illegal status transitions", () => {
    expect(() => issueStatus("issued")).toThrow(RfiIllegalTransitionError);
    expect(() => respondStatus("draft")).toThrow(RfiIllegalTransitionError);
    expect(() => closeStatus("issued")).toThrow(RfiIllegalTransitionError);
    expect(() => reopenStatus("answered")).toThrow(RfiIllegalTransitionError);
    expect(() => {
      assertCanUpdateDraft("issued");
    }).toThrow(RfiIllegalTransitionError);
  });

  it("formats permanent project-local numbers", () => {
    expect(formatRfiNumber(1)).toBe("RFI-001");
    expect(formatRfiNumber(1000)).toBe("RFI-1000");
    expect(() => formatRfiNumber(0)).toThrow(RangeError);
  });
});
