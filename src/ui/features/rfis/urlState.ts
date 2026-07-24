/*
 * URL-backed filter/sort state and the pure filtering/sorting functions the
 * register applies over the already-authorized RFI list. Mirrors
 * `public/rfis-view.js` exactly: same query parameter names and meanings (`q`,
 * `status`, `responsible`, `due`, `sort`, `direction`), same default sort
 * (`number` ascending), and the same comparison/collation rules, so bookmarked
 * or shared register URLs keep working during the migration.
 */

import type { RfiListItem, ResponsibleContactOption } from "./types";
import { rfiStatusLabel } from "./format";

export type SortKey =
  "number" | "updated" | "created" | "subject" | "responsible" | "due";

export const SORT_KEYS: Record<
  SortKey,
  { label: string; defaultDir: "asc" | "desc" }
> = {
  number: { label: "RFI number", defaultDir: "asc" },
  updated: { label: "Recently updated", defaultDir: "desc" },
  // "created" has no dedicated header (the register only sorts by its five
  // visible columns) but stays a valid key so old bookmarked/shared URLs
  // still parse instead of silently resetting to the default sort.
  created: { label: "Newest", defaultDir: "desc" },
  subject: { label: "Subject A–Z", defaultDir: "asc" },
  responsible: { label: "Party", defaultDir: "asc" },
  due: { label: "Response due date", defaultDir: "asc" },
};

/** Header label + sort key for each sortable desktop column, in display order. */
export const SORT_HEADERS: [SortKey, string][] = [
  ["number", "RFI"],
  ["subject", "Subject"],
  ["responsible", "Party"],
  ["due", "Due"],
  ["updated", "Updated"],
];

export type DueFilter = "all" | "overdue" | "due_soon";

export const DUE_OPTIONS: [DueFilter, string][] = [
  ["overdue", "Overdue"],
  ["due_soon", "Due soon"],
];

export interface RfiFilters {
  q: string;
  status: string;
  responsible: string;
  due: DueFilter;
  sort: SortKey;
  direction: "asc" | "desc";
}

export function defaultFilters(): RfiFilters {
  return {
    q: "",
    status: "all",
    responsible: "all",
    due: "all",
    sort: "number",
    direction: "asc",
  };
}

function isSortKey(value: string | null): value is SortKey {
  return value !== null && Object.hasOwn(SORT_KEYS, value);
}

export function filtersFromSearchParams(params: URLSearchParams): RfiFilters {
  const next = defaultFilters();
  next.q = params.get("q") ?? "";
  next.status = params.get("status") ?? "all";
  next.responsible = params.get("responsible") ?? "all";
  const due = params.get("due");
  next.due = due === "overdue" || due === "due_soon" ? due : "all";
  const sort = params.get("sort");
  next.sort = isSortKey(sort) ? sort : "number";
  const direction = params.get("direction");
  next.direction =
    direction === "asc" || direction === "desc"
      ? direction
      : SORT_KEYS[next.sort].defaultDir;
  return next;
}

/** Only writes params that differ from the implied default, matching the
 * legacy controller's `syncUrl` so unrelated query state is never clobbered. */
export function filtersToSearchParams(filters: RfiFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.responsible !== "all")
    params.set("responsible", filters.responsible);
  if (filters.due !== "all") params.set("due", filters.due);
  if (filters.sort !== "number") params.set("sort", filters.sort);
  if (filters.direction !== SORT_KEYS[filters.sort].defaultDir) {
    params.set("direction", filters.direction);
  }
  return params;
}

export function hasActiveFilters(filters: RfiFilters): boolean {
  return (
    Boolean(filters.q.trim()) ||
    filters.status !== "all" ||
    filters.responsible !== "all" ||
    filters.due !== "all"
  );
}

function collate(a: string | null | undefined, b: string | null | undefined) {
  return (a || "").localeCompare(b || "", undefined, {
    sensitivity: "base",
  });
}
function collateNumber(a: string, b: string) {
  return (a || "").localeCompare(b || "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
function compareDate(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return (Date.parse(a || "") || 0) - (Date.parse(b || "") || 0);
}
function responsibleSortKey(rfi: RfiListItem): string {
  return rfi.responsibleParty || rfi.responsiblePartyLegacyText || "";
}

export function sortRfis(
  rfis: RfiListItem[],
  filters: RfiFilters,
): RfiListItem[] {
  const direction = filters.direction === "asc" ? 1 : -1;
  return [...rfis].sort((a, b) => {
    let comparison: number;
    if (filters.sort === "subject") comparison = collate(a.subject, b.subject);
    else if (filters.sort === "responsible")
      comparison = collate(responsibleSortKey(a), responsibleSortKey(b));
    else if (filters.sort === "updated")
      comparison = compareDate(a.updatedAt, b.updatedAt);
    else if (filters.sort === "created")
      comparison = compareDate(a.createdAt, b.createdAt);
    else if (filters.sort === "due")
      comparison = compareDate(
        a.requestedResponseDate,
        b.requestedResponseDate,
      );
    else comparison = collateNumber(a.rfiNumber || "~", b.rfiNumber || "~");
    return comparison ? comparison * direction : a.id.localeCompare(b.id);
  });
}

export function applyFilters(
  rfis: RfiListItem[],
  filters: RfiFilters,
): RfiListItem[] {
  const query = filters.q.trim().toLowerCase();
  const filtered = rfis.filter((rfi) => {
    if (filters.status !== "all" && rfi.status !== filters.status) return false;
    if (
      filters.responsible !== "all" &&
      (filters.responsible === "unresolved"
        ? !rfi.responsiblePartyLegacyText
        : rfi.responsiblePartyId !== filters.responsible)
    )
      return false;
    if (filters.due === "overdue" && !rfi.isOverdue) return false;
    if (filters.due === "due_soon" && !rfi.dueSoon) return false;
    if (!query) return true;
    return [
      rfi.rfiNumber,
      rfi.subject,
      rfi.question,
      rfi.contractorSuggestion,
      rfi.drawingReferences,
      rfi.specificationReferences,
      rfi.responsibleParty,
      rfi.latestResponse,
      rfi.legacyReference,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  return sortRfis(filtered, filters);
}

export function statusOptions(rfis: RfiListItem[]): [string, string][] {
  const present = new Set(rfis.map((rfi) => rfi.status));
  return (
    [
      "draft",
      "ready_to_issue",
      "open",
      "response_received",
      "returned_for_clarification",
      "closed",
      "void",
    ] as const
  )
    .filter((value) => present.has(value))
    .map((value) => [value, rfiStatusLabel(value)]);
}

export function responsibleOptions(
  rfis: RfiListItem[],
  responsibleContacts: ResponsibleContactOption[],
): [string, string][] {
  const ids = new Set(
    rfis.map((rfi) => rfi.responsiblePartyId).filter(Boolean),
  );
  const options: [string, string][] = responsibleContacts
    .filter((contact) => ids.has(contact.id))
    .map((contact) => [contact.id, contact.name]);
  if (rfis.some((rfi) => rfi.responsiblePartyLegacyText)) {
    options.push(["unresolved", "Unresolved legacy value"]);
  }
  return options;
}
