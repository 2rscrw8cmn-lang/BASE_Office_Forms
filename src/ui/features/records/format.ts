/*
 * Presentational formatting for the Document Register.
 *
 * Vocabulary is never re-invented here:
 *  - discipline labels come from the one controlled source,
 *    `public/record-options.js`, which the domain itself validates against
 *    (`src/domain/records/validation.ts`);
 *  - Record and Revision status labels come from the shared component
 *    vocabularies (`RECORD_STATUS_VOCABULARY`, `REVISION_STATUS_VOCABULARY`)
 *    rendered through `RecordStatusBadge` / `RevisionStatusBadge`;
 *  - record-type labels are keyed off the domain `RECORD_TYPES` union so a new
 *    domain type cannot be added without a label (enforced by test).
 *
 * Unknown legacy stored values stay readable rather than being silently
 * normalized or replaced, matching the legacy compatibility contract.
 */

import { RECORD_TYPES, type RecordType } from "../../../domain/records/record";
import {
  DISCIPLINE_OPTIONS,
  disciplineLabel as controlledDisciplineLabel,
} from "../../../../public/record-options.js";
import type { RecordCurrentRevision } from "./types";

export interface DisciplineOption {
  value: string;
  label: string;
}

/** The controlled discipline vocabulary, exactly as the domain defines it. */
export const DISCIPLINES: readonly DisciplineOption[] = DISCIPLINE_OPTIONS;

/**
 * A stored discipline's display label. An unrecognised legacy value is shown
 * verbatim (never blanked or remapped); an absent one renders as an em dash.
 */
export function disciplineLabel(value: string | null | undefined): string {
  return controlledDisciplineLabel(value);
}

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  document: "Document",
  drawing: "Drawing",
  specification: "Specification",
  schedule: "Schedule",
  report: "Report",
  correspondence: "Correspondence",
  other: "Other",
};

export const RECORD_TYPE_OPTIONS: readonly {
  value: RecordType;
  label: string;
}[] = RECORD_TYPES.map((value) => ({
  value,
  label: RECORD_TYPE_LABELS[value],
}));

/** A stored record type's display label; unknown legacy values stay readable. */
export function recordTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return RECORD_TYPE_LABELS[value as RecordType] || value;
}

/**
 * The product name for a revision number, matching `revisionName` in
 * `public/app-format.js`. The revision number is always represented -- an
 * optional human revision label is appended, never substituted for it.
 */
export function revisionName(
  revision: Pick<
    RecordCurrentRevision,
    "revisionNumber" | "revisionLabel"
  > | null,
): string {
  if (!revision) return "";
  const number = revision.revisionNumber;
  const label = (revision.revisionLabel ?? "").trim();
  const numbered =
    number === 1
      ? "Original"
      : Number.isInteger(number) && number > 1
        ? `Rev ${String(number - 1)}`
        : "Version";
  return label ? `${numbered} · ${label}` : numbered;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Shared register date presentation; `—` when the value is absent. */
export function formatRecordDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

/** True when the timestamp can back a semantic `<time dateTime=…>` element. */
export function isValidTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function fileCountLabel(count: number): string {
  return `${String(count)} file${count === 1 ? "" : "s"}`;
}
