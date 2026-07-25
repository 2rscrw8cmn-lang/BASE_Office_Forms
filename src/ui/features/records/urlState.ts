/*
 * URL-backed register state and the pure filter/sort functions applied over the
 * already-authorized Records response.
 *
 * Parameter names, defaults, comparison rules, and the deterministic id
 * tie-break mirror `public/records-view.js` exactly (`q`, `type`, `discipline`,
 * `revisionStatus`, `archived`, `sort`, `direction`), so bookmarked and shared
 * register URLs keep working across the migration. Filtering here is never an
 * authorization boundary -- the server already decided what this member may
 * see.
 */

import type { RecordStatus } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";
import { disciplineLabel, recordTypeLabel } from "./format";
import type { RecordListItem } from "./types";

export type SortKey = "created" | "updated" | "title" | "recordNumber" | "type";

export const SORT_KEYS: Record<
  SortKey,
  { label: string; defaultDir: "asc" | "desc" }
> = {
  created: { label: "Newest", defaultDir: "desc" },
  updated: { label: "Recently updated", defaultDir: "desc" },
  title: { label: "Title A–Z", defaultDir: "asc" },
  recordNumber: { label: "Record number", defaultDir: "asc" },
  type: { label: "Type", defaultDir: "asc" },
};

export type ArchivedVisibility = "active" | "all" | "archived";

export const ARCHIVED_OPTIONS: [ArchivedVisibility, string][] = [
  ["active", "Active only"],
  ["all", "Include archived"],
  ["archived", "Archived only"],
];

/**
 * The revision-status filter also carries the factual "no revision" condition
 * (a record whose authoritative current revision does not exist yet). That is
 * not an invented status -- it is the absence of the relationship.
 */
export type RevisionStatusFilter = RevisionStatus | "none";

export interface RecordFilters {
  q: string;
  type: string;
  discipline: string;
  revisionStatus: string;
  archived: ArchivedVisibility;
  sort: SortKey;
  direction: "asc" | "desc";
}

export function defaultFilters(): RecordFilters {
  return {
    q: "",
    type: "all",
    discipline: "all",
    revisionStatus: "all",
    archived: "active",
    sort: "created",
    direction: "desc",
  };
}

function isSortKey(value: string | null): value is SortKey {
  return value !== null && Object.hasOwn(SORT_KEYS, value);
}

export function filtersFromSearchParams(
  params: URLSearchParams,
): RecordFilters {
  const next = defaultFilters();
  next.q = params.get("q") ?? "";
  next.type = params.get("type") ?? "all";
  next.discipline = params.get("discipline") ?? "all";
  next.revisionStatus = params.get("revisionStatus") ?? "all";
  const archived = params.get("archived");
  next.archived =
    archived === "all" || archived === "archived" ? archived : "active";
  const sort = params.get("sort");
  next.sort = isSortKey(sort) ? sort : "created";
  const direction = params.get("direction");
  next.direction =
    direction === "asc" || direction === "desc"
      ? direction
      : SORT_KEYS[next.sort].defaultDir;
  return next;
}

/**
 * Writes only the parameters that differ from their implied default, so
 * unrelated query state (and the hash) is never clobbered.
 */
export function filtersToSearchParams(
  filters: RecordFilters,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base);
  const set = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) params.delete(key);
    else params.set(key, value);
  };
  const query = filters.q.trim();
  set("q", query, !query);
  set("type", filters.type, filters.type === "all");
  set("discipline", filters.discipline, filters.discipline === "all");
  set(
    "revisionStatus",
    filters.revisionStatus,
    filters.revisionStatus === "all",
  );
  set("archived", filters.archived, filters.archived === "active");
  set("sort", filters.sort, filters.sort === "created");
  set(
    "direction",
    filters.direction,
    filters.direction === SORT_KEYS[filters.sort].defaultDir,
  );
  return params;
}

/** Active non-search filters only; the search query is counted separately. */
export function activeFilterCount(filters: RecordFilters): number {
  return [
    filters.type !== "all",
    filters.discipline !== "all",
    filters.revisionStatus !== "all",
    filters.archived !== "active",
  ].filter(Boolean).length;
}

export function hasActiveFilters(filters: RecordFilters): boolean {
  return Boolean(filters.q.trim()) || activeFilterCount(filters) > 0;
}

/** The authoritative current-revision status, or the factual "no revision". */
export function currentRevisionStatusValue(
  record: RecordListItem,
): RevisionStatusFilter {
  return record.currentRevision ? record.currentRevision.status : "none";
}

function collate(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return (left || "").localeCompare(right || "", undefined, {
    sensitivity: "base",
  });
}

function collateNumber(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return (left || "").localeCompare(right || "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareDate(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return (Date.parse(left || "") || 0) - (Date.parse(right || "") || 0);
}

/**
 * Records matching the current archived visibility only -- the universe the
 * result count is measured against, before search and field filters.
 */
export function visibleUniverse(
  records: RecordListItem[],
  archived: ArchivedVisibility,
): RecordListItem[] {
  return records.filter((record) => {
    if (archived === "active") return record.status === "active";
    if (archived === "archived") return record.status === "archived";
    return true;
  });
}

export function sortRecords(
  records: RecordListItem[],
  filters: RecordFilters,
): RecordListItem[] {
  const direction = filters.direction === "asc" ? 1 : -1;
  return [...records].sort((left, right) => {
    let comparison: number;
    if (filters.sort === "title") comparison = collate(left.title, right.title);
    else if (filters.sort === "recordNumber")
      comparison = collateNumber(left.recordNumber, right.recordNumber);
    else if (filters.sort === "type")
      comparison = collate(
        recordTypeLabel(left.recordType),
        recordTypeLabel(right.recordType),
      );
    else if (filters.sort === "updated")
      comparison = compareDate(left.updatedAt, right.updatedAt);
    else comparison = compareDate(left.createdAt, right.createdAt);
    const primary = comparison * direction;
    // Deterministic tie-break so equal keys never reorder between renders.
    return primary || left.id.localeCompare(right.id);
  });
}

export function applyFilters(
  records: RecordListItem[],
  filters: RecordFilters,
): RecordListItem[] {
  const query = filters.q.trim().toLowerCase();
  const filtered = visibleUniverse(records, filters.archived).filter(
    (record) => {
      if (filters.type !== "all" && record.recordType !== filters.type) {
        return false;
      }
      if (
        filters.discipline !== "all" &&
        (record.discipline || "") !== filters.discipline
      ) {
        return false;
      }
      if (
        filters.revisionStatus !== "all" &&
        currentRevisionStatusValue(record) !== filters.revisionStatus
      ) {
        return false;
      }
      if (!query) return true;
      return [
        record.title,
        record.recordNumber || "",
        recordTypeLabel(record.recordType),
        disciplineLabel(record.discipline),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    },
  );
  return sortRecords(filtered, filters);
}

/* ---- Filter options ---------------------------------------------------- *
 * Options are derived only from values actually present in the authorized
 * response (plus the factual "No revision" condition), so no type, discipline,
 * or status is ever offered that this member cannot actually see.
 */

export function typeOptions(records: RecordListItem[]): [string, string][] {
  return [...new Set(records.map((record) => record.recordType))]
    .sort((left, right) =>
      collate(recordTypeLabel(left), recordTypeLabel(right)),
    )
    .map((value) => [value, recordTypeLabel(value)]);
}

export function disciplineOptions(
  records: RecordListItem[],
): [string, string][] {
  return [
    ...new Set(
      records
        .map((record) => record.discipline)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .sort((left, right) =>
      collate(disciplineLabel(left), disciplineLabel(right)),
    )
    .map((value) => [value, disciplineLabel(value)]);
}

/**
 * Ordered by lifecycle, then the "No revision" condition last. `REVISION_ORDER`
 * is a display ordering only -- the labels themselves come from the shared
 * revision-status vocabulary via the caller.
 */
export const REVISION_STATUS_ORDER: RevisionStatus[] = [
  "published",
  "superseded",
  "draft",
];

export function revisionStatusOptions(
  records: RecordListItem[],
  label: (status: RevisionStatus) => string,
): [string, string][] {
  const present = new Set(
    records.map((record) => currentRevisionStatusValue(record)),
  );
  const options: [string, string][] = REVISION_STATUS_ORDER.filter((status) =>
    present.has(status),
  ).map((status) => [status, label(status)]);
  if (present.has("none")) options.push(["none", "No revision"]);
  return options;
}

/**
 * Drops filter values that are not present in the authorized response, so an
 * invalid or stale URL normalizes safely instead of showing an unknown option
 * or an empty register with no explanation.
 */
export function normalizeFilters(
  filters: RecordFilters,
  records: RecordListItem[],
  revisionLabel: (status: RevisionStatus) => string,
): RecordFilters {
  const types = new Set(typeOptions(records).map(([value]) => value));
  const disciplines = new Set(
    disciplineOptions(records).map(([value]) => value),
  );
  const revisionStatuses = new Set(
    revisionStatusOptions(records, revisionLabel).map(([value]) => value),
  );
  const next = { ...filters };
  if (next.type !== "all" && !types.has(next.type)) next.type = "all";
  if (next.discipline !== "all" && !disciplines.has(next.discipline)) {
    next.discipline = "all";
  }
  if (
    next.revisionStatus !== "all" &&
    !revisionStatuses.has(next.revisionStatus)
  ) {
    next.revisionStatus = "all";
  }
  return next;
}

export function recordStatusIsArchived(status: RecordStatus): boolean {
  return status === "archived";
}
