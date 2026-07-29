/*
 * Presentational date/status formatting for the RFI register. Behavior mirrors
 * `public/app-format.js` exactly (the same functions back the legacy
 * `rfis-view.js` this feature replaces) so the visible text does not change
 * during migration. Overdue/due-soon framing always comes from the
 * server-computed `isOverdue`/`dueSoon` flags -- never recomputed here.
 */

import type { RfiStatus } from "../../../domain/rfis/rfi";

export function formatDate(
  value: string | null | undefined,
  timeZone?: string,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const SHORT_DATE_FORMAT_WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatShortDate(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const format =
    date.getFullYear() === now.getFullYear()
      ? SHORT_DATE_FORMAT
      : SHORT_DATE_FORMAT_WITH_YEAR;
  return format.format(date);
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function calendarDayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

export function formatRelativeUpdated(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dayDiff = calendarDayDiff(date, now);
  if (dayDiff <= 0) {
    const minutes = Math.max(
      0,
      Math.round((now.getTime() - date.getTime()) / 60_000),
    );
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${String(minutes)} min ago`;
    const hours = Math.round(minutes / 60);
    return `${String(hours)} hr ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  return formatShortDate(value, now);
}

/** Due-column text; the Overdue/Due framing itself comes from `isOverdue`. */
export function rfiDueUrgencyText(
  requestedResponseDate: string | null | undefined,
  isOverdue: boolean,
  now: Date = new Date(),
): string {
  if (!requestedResponseDate) return "No due date";
  const due = new Date(`${requestedResponseDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return "";
  const dayDiff = calendarDayDiff(now, due);
  if (isOverdue) {
    const days = Math.max(1, -dayDiff);
    return `${String(days)} day${days === 1 ? "" : "s"} overdue`;
  }
  if (dayDiff === 0) return "Due today";
  if (dayDiff > 0)
    return `Due in ${String(dayDiff)} day${dayDiff === 1 ? "" : "s"}`;
  return "";
}

const RFI_STATUS_LABELS: Record<RfiStatus, string> = {
  draft: "Draft",
  ready_to_issue: "Ready to issue",
  open: "Open",
  response_received: "Response received",
  closed: "Closed",
  returned_for_clarification: "Returned for clarification",
  void: "Void",
};

export function rfiStatusLabel(status: string): string {
  return RFI_STATUS_LABELS[status as RfiStatus] || status || "—";
}
