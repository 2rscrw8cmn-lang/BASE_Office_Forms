/*
 * Native React Document Register: `/projects/:projectId/records`.
 *
 * The user-facing surface is the Document Register (project tab "Documents"),
 * while the backend domain terminology stays Record / Revision / File /
 * Issuance. The register keeps those concepts visibly distinct and never lets a
 * draft stand in for the authoritative current revision.
 *
 * Record and Revision detail routes stay compatibility-mounted until UI-7; this
 * feature owns only the register and the Add Document workflow.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  PageHeader,
  PermissionState,
  RegisterPage,
  RegisterToolbar,
  REVISION_STATUS_VOCABULARY,
  Select,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { AddDocumentDrawer } from "./AddDocumentDrawer";
import { RecordsCards } from "./RecordsCards";
import { RecordsTable } from "./RecordsTable";
import { disciplineLabel, recordTypeLabel } from "./format";
import {
  ARCHIVED_OPTIONS,
  applyFilters,
  activeFilterCount as countActiveFilters,
  defaultFilters,
  disciplineOptions,
  filtersFromSearchParams,
  filtersToSearchParams,
  hasActiveFilters,
  normalizeFilters,
  revisionStatusOptions,
  SORT_KEYS,
  typeOptions,
  visibleUniverse,
  type ArchivedVisibility,
  type RecordFilters,
  type SortKey,
} from "./urlState";
import { useProjectRecords } from "./useProjectRecords";
import type { RevisionStatus } from "../../../domain/revisions/revision";
import "./records.css";

/** Revision-status labels come from the one shared vocabulary, never a copy. */
function revisionStatusLabel(status: RevisionStatus): string {
  return REVISION_STATUS_VOCABULARY[status].label;
}

export function RecordsRegisterFeature({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const shell = useShell();
  const state = useProjectRecords(projectId);
  const [addOpen, setAddOpen] = useState(false);
  // The Drawer has two possible openers (the page header action and the
  // first-use empty state), so focus restoration is explicit here rather than
  // relying on a single Radix Trigger -- the same approach UI-5 uses.
  const addTriggerRef = useRef<HTMLElement | null>(null);

  const openAddDocument = (trigger: HTMLElement) => {
    addTriggerRef.current = trigger;
    setAddOpen(true);
  };

  const handleAddOpenChange = (nextOpen: boolean) => {
    setAddOpen(nextOpen);
    if (!nextOpen) {
      window.requestAnimationFrame(() => addTriggerRef.current?.focus());
    }
  };

  const records = state.status === "ready" ? state.data.records : [];
  const requested = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );
  const filters = useMemo(
    () => normalizeFilters(requested, records, revisionStatusLabel),
    [requested, records],
  );

  // An invalid or stale filter value (a discipline nobody in this project uses
  // any more, say) is dropped from the URL as well as from the view, without
  // ever offering an option the authorized response does not contain.
  useEffect(() => {
    if (state.status !== "ready") return;
    if (
      requested.type === filters.type &&
      requested.discipline === filters.discipline &&
      requested.revisionStatus === filters.revisionStatus
    ) {
      return;
    }
    const params = filtersToSearchParams(
      filters,
      new URLSearchParams(location.search),
    ).toString();
    void navigate(
      {
        pathname: location.pathname,
        search: params ? `?${params}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [state.status, requested, filters, location, navigate]);

  const updateFilters = (patch: Partial<RecordFilters>, push: boolean) => {
    const merged = { ...filters, ...patch };
    const params = filtersToSearchParams(
      merged,
      new URLSearchParams(location.search),
    ).toString();
    void navigate(
      {
        pathname: location.pathname,
        // Unrelated query state and the hash both survive.
        search: params ? `?${params}` : "",
        hash: location.hash,
      },
      { replace: !push },
    );
  };

  // Clear resets search and every active filter but deliberately keeps the
  // chosen sort and direction, matching the accepted Records behaviour.
  const clearFilters = () => {
    const { sort, direction } = filters;
    updateFilters({ ...defaultFilters(), sort, direction }, true);
    shell.announce("Document filters cleared.");
  };

  const canCreate =
    state.status === "ready" && state.data.capabilities.createRecord;

  const header = {
    title: "Document Register",
    // The shell already owns the project <h1>; this is the section header, the
    // same hierarchy the native RFI register uses.
    asHeading: false,
    primaryAction: canCreate ? (
      <Button
        variant="primary"
        iconStart="plus"
        data-add-document
        onClick={(event) => {
          openAddDocument(event.currentTarget);
        }}
      >
        Add document
      </Button>
    ) : undefined,
  };

  const drawer = canCreate ? (
    <AddDocumentDrawer
      projectId={projectId}
      open={addOpen}
      onOpenChange={handleAddOpenChange}
    />
  ) : null;

  if (state.status === "loading") {
    return (
      <RegisterPage
        className="records-register-page"
        header={header}
        status="loading"
        loadingLabel="Loading documents"
      />
    );
  }

  if (state.status === "missing") {
    return (
      <div className="records-register-page">
        <PageHeader {...header} />
        <PermissionState description="This document register is unavailable or you do not have access to this project." />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <RegisterPage
        className="records-register-page"
        header={header}
        status="error"
        error={
          <ErrorState
            title="Unable to load documents"
            description="The document register could not be loaded. No changes were made."
            requestId={state.requestId}
            onRetry={state.retry}
          />
        }
      />
    );
  }

  const universe = visibleUniverse(records, filters.archived);
  const filtered = applyFilters(records, filters);
  const active = hasActiveFilters(filters);
  const activeCount = countActiveFilters(filters);
  const availableRevisionStatuses = revisionStatusOptions(
    records,
    revisionStatusLabel,
  );

  const chips: ReactNode = active ? (
    <>
      {filters.type !== "all" ? (
        <FilterChip
          label="Type"
          value={recordTypeLabel(filters.type)}
          onRemove={() => {
            updateFilters({ type: "all" }, true);
            shell.announce("Type filter removed.");
          }}
        />
      ) : null}
      {filters.discipline !== "all" ? (
        <FilterChip
          label="Discipline"
          value={disciplineLabel(filters.discipline)}
          onRemove={() => {
            updateFilters({ discipline: "all" }, true);
            shell.announce("Discipline filter removed.");
          }}
        />
      ) : null}
      {filters.revisionStatus !== "all" ? (
        <FilterChip
          label="Revision"
          value={
            filters.revisionStatus === "none"
              ? "No revision"
              : revisionStatusLabel(filters.revisionStatus as RevisionStatus)
          }
          onRemove={() => {
            updateFilters({ revisionStatus: "all" }, true);
            shell.announce("Revision filter removed.");
          }}
        />
      ) : null}
      {filters.archived !== "active" ? (
        <FilterChip
          label="Archived"
          value={
            ARCHIVED_OPTIONS.find(
              ([value]) => value === filters.archived,
            )?.[1] ?? filters.archived
          }
          onRemove={() => {
            updateFilters({ archived: "active" }, true);
            shell.announce("Archived filter removed.");
          }}
        />
      ) : null}
      <Button
        variant="ghost"
        size="compact"
        data-clear-filters
        onClick={clearFilters}
      >
        Clear
      </Button>
    </>
  ) : undefined;

  const toolbar =
    records.length > 0 ? (
      <RegisterToolbar
        searchValue={filters.q}
        // Search replaces history so typing never fills the back stack.
        onSearchChange={(q) => {
          updateFilters({ q }, false);
        }}
        searchLabel="Search documents"
        searchPlaceholder="Search title, number, type, or discipline…"
        mobileFilterDisclosure={{
          // Counts active filters only -- never the search query, which stays
          // visible on mobile outside the disclosure.
          activeCount: activeCount,
          label: "filters",
        }}
        filters={
          <>
            <Field label="Document type" hideLabel controlId="records-type">
              <Select
                size="compact"
                value={filters.type}
                onChange={(event) => {
                  updateFilters({ type: event.target.value }, true);
                }}
              >
                <option value="all">All types</option>
                {typeOptions(records).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Discipline" hideLabel controlId="records-discipline">
              <Select
                size="compact"
                value={filters.discipline}
                onChange={(event) => {
                  updateFilters({ discipline: event.target.value }, true);
                }}
              >
                <option value="all">All disciplines</option>
                {disciplineOptions(records).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Revision status"
              hideLabel
              controlId="records-revision"
            >
              <Select
                size="compact"
                value={filters.revisionStatus}
                onChange={(event) => {
                  updateFilters({ revisionStatus: event.target.value }, true);
                }}
              >
                <option value="all">All revisions</option>
                {availableRevisionStatuses.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Archived visibility"
              hideLabel
              controlId="records-archived"
            >
              <Select
                size="compact"
                value={filters.archived}
                onChange={(event) => {
                  updateFilters(
                    { archived: event.target.value as ArchivedVisibility },
                    true,
                  );
                }}
              >
                {ARCHIVED_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {/* Sort lives in the same disclosure group as the filters so
                mobile keeps only Search visible, per the shared toolbar
                contract. It is not counted as an active filter. */}
            <Field label="Sort documents" hideLabel controlId="records-sort">
              <Select
                size="compact"
                value={filters.sort}
                onChange={(event) => {
                  const sort = event.target.value as SortKey;
                  // Choosing a sort also restores its natural direction.
                  updateFilters(
                    { sort, direction: SORT_KEYS[sort].defaultDir },
                    true,
                  );
                }}
              >
                {Object.entries(SORT_KEYS).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        }
        chips={chips}
        resultCount={
          active
            ? `${String(filtered.length)} of ${String(universe.length)} documents`
            : `${String(records.length)} document${records.length === 1 ? "" : "s"}`
        }
      />
    ) : undefined;

  if (records.length === 0) {
    return (
      <>
        <RegisterPage
          className="records-register-page"
          header={header}
          status="empty-first-use"
          emptyFirstUse={
            <EmptyState
              variant="first-use"
              icon="file-text"
              title="No documents yet"
              description="This project has no documents. Add the first one to begin tracking its revisions and files."
              action={
                canCreate ? (
                  <Button
                    variant="secondary"
                    iconStart="plus"
                    data-add-document
                    onClick={(event) => {
                      openAddDocument(event.currentTarget);
                    }}
                  >
                    Add document
                  </Button>
                ) : null
              }
            />
          }
        />
        {drawer}
      </>
    );
  }

  // Active-only view with nothing active, while archived documents do exist.
  // This is a filter outcome, not a first-use state, so it offers the existing
  // path to include archived documents rather than an Add action.
  const noActiveButArchived =
    filters.archived === "active" && universe.length === 0;

  return (
    <>
      <RegisterPage
        className="records-register-page"
        header={header}
        toolbar={toolbar}
        status={filtered.length > 0 ? "populated" : "empty-filtered"}
        emptyFiltered={
          noActiveButArchived ? (
            <EmptyState
              variant="filtered"
              title="No active documents"
              description="This project has archived documents. Include them to see the full register."
              action={
                <Button
                  variant="secondary"
                  data-include-archived
                  onClick={() => {
                    updateFilters({ archived: "all" }, true);
                    shell.announce("Archived documents included.");
                  }}
                >
                  Include archived documents
                </Button>
              }
            />
          ) : (
            <EmptyState
              variant="filtered"
              title="No documents match the current search or filters."
              action={
                <Button
                  variant="secondary"
                  data-clear-filters
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              }
            />
          )
        }
      >
        {state.refreshing ? (
          <p className="base-sr-only" aria-live="polite">
            Refreshing documents.
          </p>
        ) : null}
        <RecordsTable
          projectId={projectId}
          records={filtered}
          onNavigate={(href) => {
            shell.navigate(href);
          }}
        />
        <RecordsCards projectId={projectId} records={filtered} />
      </RegisterPage>
      {drawer}
    </>
  );
}
