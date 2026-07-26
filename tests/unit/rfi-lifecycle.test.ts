import { describe, expect, it } from "vitest";

import { RfiIllegalTransitionError } from "../../src/domain/rfis/errors";
import {
  assertCanUpdateDraft,
  canAttach,
  closeStatus,
  issueStatus,
  markReadyStatus,
  reopenStatus,
  respondStatus,
  returnForClarificationStatus,
  voidStatus,
} from "../../src/domain/rfis/lifecycle";
import { formatRfiNumber } from "../../src/domain/rfis/numbering";
import { rfiScheduleFlags } from "../../src/domain/rfis/schedule";

describe("RFI domain lifecycle", () => {
  it("allows the binding draft → ready_to_issue → open → response_received → closed flow", () => {
    assertCanUpdateDraft("draft");
    expect(markReadyStatus("draft")).toBe("ready_to_issue");
    expect(issueStatus("ready_to_issue")).toBe("open");
    expect(respondStatus("open")).toBe("response_received");
    expect(closeStatus("response_received")).toBe("closed");
    expect(reopenStatus("closed")).toBe("open");
  });

  it("supports return-for-clarification and void branches", () => {
    expect(returnForClarificationStatus("response_received")).toBe(
      "returned_for_clarification",
    );
    expect(respondStatus("returned_for_clarification")).toBe(
      "response_received",
    );
    expect(voidStatus("draft")).toBe("void");
    expect(voidStatus("open")).toBe("void");
  });

  it("rejects illegal status transitions", () => {
    expect(() => issueStatus("draft")).toThrow(RfiIllegalTransitionError);
    expect(() => issueStatus("open")).toThrow(RfiIllegalTransitionError);
    expect(() => respondStatus("draft")).toThrow(RfiIllegalTransitionError);
    expect(() => closeStatus("open")).toThrow(RfiIllegalTransitionError);
    expect(() => reopenStatus("open")).toThrow(RfiIllegalTransitionError);
    expect(() => voidStatus("closed")).toThrow(RfiIllegalTransitionError);
    expect(() => {
      assertCanUpdateDraft("open");
    }).toThrow(RfiIllegalTransitionError);
  });

  it("permits attachments only in the pre-issue draft context", () => {
    expect(canAttach("draft")).toBe(true);
    expect(canAttach("ready_to_issue")).toBe(true);
    expect(canAttach("open")).toBe(false);
    expect(canAttach("closed")).toBe(false);
  });

  it("computes overdue and due-soon only while awaiting a response", () => {
    expect(rfiScheduleFlags("open", "2026-07-20", "2026-07-22")).toEqual({
      isOverdue: true,
      dueSoon: false,
    });
    expect(rfiScheduleFlags("open", "2026-07-24", "2026-07-22")).toEqual({
      isOverdue: false,
      dueSoon: true,
    });
    expect(rfiScheduleFlags("open", "2026-08-30", "2026-07-22")).toEqual({
      isOverdue: false,
      dueSoon: false,
    });
    // Not awaiting a response: never overdue.
    expect(rfiScheduleFlags("draft", "2026-07-20", "2026-07-22")).toEqual({
      isOverdue: false,
      dueSoon: false,
    });
    expect(rfiScheduleFlags("closed", "2026-07-20", "2026-07-22")).toEqual({
      isOverdue: false,
      dueSoon: false,
    });
  });

  it("formats permanent project-local numbers", () => {
    expect(formatRfiNumber(1)).toBe("RFI-001");
    expect(formatRfiNumber(1000)).toBe("RFI-1000");
    expect(() => formatRfiNumber(0)).toThrow(RangeError);
  });
});
