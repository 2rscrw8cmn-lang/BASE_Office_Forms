// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RFI_STATUSES, type RfiStatus } from "../../src/domain/rfis/rfi";
import {
  RECORD_STATUSES,
  type RecordStatus,
} from "../../src/domain/records/record";
import {
  REVISION_STATUSES,
  type RevisionStatus,
} from "../../src/domain/revisions/revision";
import {
  ATTENTION_CONDITIONS,
  ATTENTION_VOCABULARY,
  AttentionBadge,
  RECORD_STATUS_VOCABULARY,
  RFI_STATUS_VOCABULARY,
  REVISION_STATUS_VOCABULARY,
  RecordStatusBadge,
  RevisionStatusBadge,
  RfiStatusBadge,
} from "../../src/ui/components/patterns/StatusBadge";

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

describe("RFI status vocabulary matches the authoritative domain enum", () => {
  it("has exactly one entry per RfiStatus, no more, no fewer", () => {
    expect(sorted(Object.keys(RFI_STATUS_VOCABULARY) as RfiStatus[])).toEqual(
      sorted(RFI_STATUSES),
    );
  });

  it("does not carry any non-authoritative alias (e.g. responded, issued, in_review, due_soon)", () => {
    const keys = Object.keys(RFI_STATUS_VOCABULARY);
    for (const alias of ["responded", "issued", "in_review", "due_soon"]) {
      expect(keys).not.toContain(alias);
    }
  });

  it.each(RFI_STATUSES)(
    "renders a readable label for RFI status %s",
    (status) => {
      render(<RfiStatusBadge status={status} />);
      expect(
        screen.getByText(RFI_STATUS_VOCABULARY[status].label),
      ).toBeInTheDocument();
    },
  );
});

describe("Record status vocabulary matches the authoritative domain enum", () => {
  it("has exactly one entry per RecordStatus", () => {
    expect(
      sorted(Object.keys(RECORD_STATUS_VOCABULARY) as RecordStatus[]),
    ).toEqual(sorted(RECORD_STATUSES));
  });

  it.each(RECORD_STATUSES)(
    "renders a readable label for record status %s",
    (status) => {
      render(<RecordStatusBadge status={status} />);
      expect(
        screen.getByText(RECORD_STATUS_VOCABULARY[status].label),
      ).toBeInTheDocument();
    },
  );
});

describe("Revision status vocabulary matches the authoritative domain enum", () => {
  it("has exactly one entry per RevisionStatus", () => {
    expect(
      sorted(Object.keys(REVISION_STATUS_VOCABULARY) as RevisionStatus[]),
    ).toEqual(sorted(REVISION_STATUSES));
  });

  it.each(REVISION_STATUSES)(
    "renders a readable label for revision status %s",
    (status) => {
      render(<RevisionStatusBadge status={status} />);
      expect(
        screen.getByText(REVISION_STATUS_VOCABULARY[status].label),
      ).toBeInTheDocument();
    },
  );
});

describe("Attention conditions are calculated, not stored statuses", () => {
  it("does not overlap with any stored RFI status", () => {
    for (const condition of ATTENTION_CONDITIONS) {
      expect(RFI_STATUSES as readonly string[]).not.toContain(condition);
    }
  });

  it.each(ATTENTION_CONDITIONS)(
    "renders a readable label for attention condition %s",
    (condition) => {
      render(<AttentionBadge condition={condition} />);
      expect(
        screen.getByText(ATTENTION_VOCABULARY[condition].label),
      ).toBeInTheDocument();
    },
  );
});
