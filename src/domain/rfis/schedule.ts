import type { RfiStatus } from "./rfi";

// Overdue and due-soon are calculated conditions, never stored statuses
// (docs/WORKFLOWS.md §5.1). Only an RFI still awaiting a response can be overdue.
const AWAITING_RESPONSE: readonly RfiStatus[] = [
  "open",
  "returned_for_clarification",
];

const DUE_SOON_DAYS = 3;

export interface RfiScheduleFlags {
  isOverdue: boolean;
  dueSoon: boolean;
}

function toDayNumber(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(time) ? null : Math.floor(time / 86_400_000);
}

/**
 * Computes overdue / due-soon relative to `today` (an ISO yyyy-mm-dd). Returns
 * both false unless the RFI is awaiting a response and has a requested response
 * date. `today` is supplied by the caller so the calculation is deterministic
 * and timezone decisions live in one place.
 */
export function rfiScheduleFlags(
  status: RfiStatus,
  requestedResponseDate: string | null,
  today: string,
): RfiScheduleFlags {
  if (!requestedResponseDate || !AWAITING_RESPONSE.includes(status)) {
    return { isOverdue: false, dueSoon: false };
  }
  const due = toDayNumber(requestedResponseDate);
  const now = toDayNumber(today);
  if (due === null || now === null) return { isOverdue: false, dueSoon: false };
  return {
    isOverdue: due < now,
    dueSoon: due >= now && due - now <= DUE_SOON_DAYS,
  };
}

export function currentIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
