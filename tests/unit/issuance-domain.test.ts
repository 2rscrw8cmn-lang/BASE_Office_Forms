import { describe, expect, it } from "vitest";

import { formatIssueNumber } from "../../src/domain/issuances/numbering";
import {
  buildRevisionSnapshot,
  serializeRevisionSnapshot,
} from "../../src/domain/issuances/snapshot";
import {
  IssuanceValidationError,
  validateIssuanceIssueInput,
} from "../../src/domain/issuances/validation";
import type { Revision } from "../../src/domain/revisions/revision";

const purposes = [
  "for_information",
  "for_review",
  "for_approval",
  "for_construction",
  "as_recorded",
  "other",
] as const;

function input(purpose: string, notes?: unknown) {
  return {
    purpose,
    notes,
    fileIds: ["file-1"],
    correlationId: "request-1",
  };
}

describe("issuance validation and snapshots", () => {
  it.each(purposes)("accepts purpose %s", (purpose) => {
    const validated = validateIssuanceIssueInput(
      input(purpose, purpose === "other" ? "Custom issue" : undefined),
    );
    expect(validated.purpose).toBe(purpose);
  });

  it("rejects invalid purposes and requires notes for other", () => {
    expect(() => validateIssuanceIssueInput(input("invalid"))).toThrow(
      IssuanceValidationError,
    );
    expect(() => validateIssuanceIssueInput(input("other", "   "))).toThrow(
      /notes are required/,
    );
  });

  it("normalizes blank notes to null", () => {
    expect(validateIssuanceIssueInput(input("for_review", "   ")).notes).toBe(
      null,
    );
  });

  it("rejects empty, duplicate, and blank file selections", () => {
    expect(() =>
      validateIssuanceIssueInput({
        ...input("for_review"),
        fileIds: [],
      }),
    ).toThrow(/At least one/);
    expect(() =>
      validateIssuanceIssueInput({
        ...input("for_review"),
        fileIds: ["file-1", "file-1"],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateIssuanceIssueInput({
        ...input("for_review"),
        fileIds: [" "],
      }),
    ).toThrow(/nonblank/);
  });

  it("formats project issuance numbers", () => {
    expect(formatIssueNumber(1)).toBe("ISS-001");
    expect(formatIssueNumber(12)).toBe("ISS-012");
    expect(formatIssueNumber(1234)).toBe("ISS-1234");
    expect(() => formatIssueNumber(0)).toThrow(RangeError);
  });

  it("constructs a deterministic snapshot from actual revision fields", () => {
    const revision: Revision = {
      id: "revision-1",
      organizationId: "org-1",
      projectId: "project-1",
      recordId: "record-1",
      revisionNumber: 2,
      revisionLabel: "B",
      title: "Issued drawing",
      description: "Description",
      discipline: "Architectural",
      source: "Design team",
      changeSummary: "Approved changes",
      status: "published",
      createdBy: "user-1",
      createdAt: "2026-07-20T12:00:00.000Z",
    };
    const snapshot = buildRevisionSnapshot(revision, "Alex Issuer");
    expect(snapshot).toEqual({
      ...revision,
      issuedByDisplayName: "Alex Issuer",
    });
    expect(serializeRevisionSnapshot(snapshot)).toBe(JSON.stringify(snapshot));
  });
});
