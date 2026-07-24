/*
 * Native React RFI register: `/projects/:projectId/rfis`. This is a parity
 * migration off the compatibility-mounted `public/rfis-view.js` controller,
 * not a redesign -- the interaction model (one expandable draft editor,
 * changed-only commits, capability-gated editing, URL-backed search/filter/
 * sort) matches the approved model in `docs/UX_RFI_SPEC.md` §13 exactly.
 * The RFI workspace route stays on `LegacyFeatureMount` until UI-7.
 */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  PermissionState,
  RegisterToolbar,
  Select,
  Skeleton,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import "./rfis.css";
import { createRfiDraft, updateRfiField, RfiApiError } from "./api";
import { EDITABLE_FIELDS, validationMessage } from "./editableFields";
import { RfiCards } from "./RfiCards";
import type { FieldState } from "./RfiEditorPanel";
import { RfiTable } from "./RfiTable";
import {
  applyFilters,
  DUE_OPTIONS,
  defaultFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  hasActiveFilters,
  responsibleOptions,
  SORT_KEYS,
  statusOptions,
  type DueFilter,
  type RfiFilters,
} from "./urlState";
import {
  projectRfisQueryKey,
  useProjectRfis,
  type ProjectRfisQueryResult,
} from "./useProjectRfis";
import type { RfiEditableField, RfiListItem } from "./types";

type FieldStatesByRfi = Record<
  string,
  Partial<Record<RfiEditableField, FieldState>>
>;

function getFieldValue(
  rfi: RfiListItem,
  field: RfiEditableField,
): string | null {
  return rfi[field] ?? null;
}

export function RfiRegisterFeature({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromSearchParams(searchParams);
  const rfisState = useProjectRfis(projectId);
  const queryClient = useQueryClient();
  const shell = useShell();

  const [editorOpenId, setEditorOpenId] = useState<string | null>(null);
  const [fieldStates, setFieldStates] = useState<FieldStatesByRfi>({});
  const [editorResetSignal, setEditorResetSignal] = useState(0);
  const [creating, setCreating] = useState(false);

  const updateFilters = useCallback(
    (patch: Partial<RfiFilters>, push: boolean) => {
      const merged = { ...filters, ...patch };
      setSearchParams(filtersToSearchParams(merged), { replace: !push });
    },
    [filters, setSearchParams],
  );

  const setFieldState = useCallback(
    (rfiId: string, field: RfiEditableField, next: FieldState | null) => {
      setFieldStates((prev) => ({
        ...prev,
        [rfiId]: { ...prev[rfiId], [field]: next ?? undefined },
      }));
    },
    [],
  );

  const focusSubjectTrigger = useCallback((rfiId: string) => {
    document
      .querySelector<HTMLElement>(`[data-subject-edit][data-id="${rfiId}"]`)
      ?.focus();
  }, []);

  const toggleEditor = useCallback(
    (id: string) => {
      if (editorOpenId === id) {
        setEditorOpenId(null);
        shell.announce("Editor closed.");
        focusSubjectTrigger(id);
        return;
      }
      if (rfisState.status !== "ready") return;
      const rfi = rfisState.data.rfis.find((item) => item.id === id);
      if (!rfi?.capabilities.updateDraft) return;
      setEditorOpenId(id);
      shell.announce(`Editing ${rfi.subject || "RFI"}.`);
    },
    [editorOpenId, rfisState, shell, focusSubjectTrigger],
  );

  const closeEditor = useCallback(() => {
    if (!editorOpenId) return;
    const id = editorOpenId;
    setEditorOpenId(null);
    shell.announce("Editor closed.");
    focusSubjectTrigger(id);
  }, [editorOpenId, shell, focusSubjectTrigger]);

  const commitField = useCallback(
    async (rfiId: string, field: RfiEditableField, rawValue: string) => {
      if (rfisState.status !== "ready") return;
      const rfi = rfisState.data.rfis.find((item) => item.id === rfiId);
      if (!rfi?.capabilities.updateDraft) return;
      const nextText = rawValue.trim();
      const normalized = nextText || null;
      const current = getFieldValue(rfi, field);
      const validation = validationMessage(field, nextText);
      if (validation) {
        setFieldState(rfiId, field, { status: "failed", message: validation });
        shell.announce(validation);
        return;
      }
      if (normalized === current) {
        setFieldState(rfiId, field, null);
        return;
      }
      setFieldState(rfiId, field, { status: "saving", message: "Saving…" });
      shell.announce("Saving…");
      try {
        const data = await updateRfiField(
          projectId,
          rfiId,
          field,
          normalized,
          rfi.lockVersion,
        );
        queryClient.setQueryData<ProjectRfisQueryResult>(
          projectRfisQueryKey(projectId),
          (old) => {
            if (!old || old.kind !== "ready") return old;
            return {
              kind: "ready",
              data: {
                ...old.data,
                rfis: old.data.rfis.map((item) =>
                  item.id === rfiId
                    ? { ...item, ...(data as Partial<RfiListItem>) }
                    : item,
                ),
              },
            };
          },
        );
        setFieldState(rfiId, field, { status: "saved", message: "Saved" });
        shell.announce(`${EDITABLE_FIELDS[field].label} saved.`);
        window.setTimeout(() => {
          setFieldStates((prev) => {
            if (prev[rfiId][field]?.status !== "saved") return prev;
            return { ...prev, [rfiId]: { ...prev[rfiId], [field]: undefined } };
          });
        }, 1400);
      } catch (error) {
        if (error instanceof RfiApiError && error.status === 409) {
          try {
            await queryClient.refetchQueries({
              queryKey: projectRfisQueryKey(projectId),
              exact: true,
            });
          } catch {
            // Keep current rows if the refresh itself fails.
          }
          setFieldState(rfiId, field, {
            status: "conflict",
            message:
              "Changed elsewhere. Latest values loaded; review and retry.",
          });
          shell.announce(
            "This RFI changed elsewhere. Latest values were loaded.",
          );
          setEditorResetSignal((value) => value + 1);
          return;
        }
        const message =
          error instanceof RfiApiError && error.status === 403
            ? "You no longer have permission to edit this draft."
            : error instanceof Error
              ? error.message
              : "Could not save. Try again.";
        setFieldState(rfiId, field, { status: "failed", message });
        shell.announce(message);
      }
    },
    [rfisState, projectId, queryClient, shell, setFieldState],
  );

  const handleAddRfi = useCallback(async () => {
    if (
      rfisState.status !== "ready" ||
      !rfisState.data.capabilities.createRfi ||
      creating
    ) {
      return;
    }
    setCreating(true);
    try {
      const data = await createRfiDraft(projectId, {
        subject: "Untitled RFI",
        question: "Describe the question",
        contractorSuggestion: null,
        drawingReferences: null,
        specificationReferences: null,
        responsiblePartyId: null,
        submittedBy: null,
        requestedResponseDate: null,
        costImpact: null,
        scheduleImpact: null,
      });
      const newItem = {
        ...data,
        latestResponse: null,
        attachmentCount: 0,
        isOverdue: false,
        dueSoon: false,
        capabilities: { updateDraft: true },
      } as RfiListItem;
      queryClient.setQueryData<ProjectRfisQueryResult>(
        projectRfisQueryKey(projectId),
        (old) => {
          if (!old || old.kind !== "ready") return old;
          return {
            kind: "ready",
            data: { ...old.data, rfis: [...old.data.rfis, newItem] },
          };
        },
      );
      updateFilters({ status: "all", q: "" }, false);
      setCreating(false);
      setEditorOpenId(newItem.id);
      shell.announce("New RFI draft added. Its subject is ready to edit.");
    } catch (error) {
      setCreating(false);
      shell.announce(
        error instanceof Error
          ? error.message
          : "The RFI draft could not be added.",
      );
    }
  }, [rfisState, creating, projectId, queryClient, updateFilters, shell]);

  if (rfisState.status === "loading") {
    return (
      <section
        className="rfi-register-page"
        aria-busy="true"
        aria-label="Loading RFIs"
      >
        <PageHeader title="RFIs" asHeading={false} />
        <Skeleton lines={4} />
      </section>
    );
  }

  if (rfisState.status === "missing") {
    return (
      <section className="rfi-register-page">
        <PageHeader title="RFIs" asHeading={false} />
        <PermissionState description="These RFIs are unavailable or you do not have access." />
      </section>
    );
  }

  if (rfisState.status === "error") {
    return (
      <section className="rfi-register-page">
        <PageHeader title="RFIs" asHeading={false} />
        <ErrorState
          title="Unable to load RFIs"
          description="The RFIs could not be loaded. No changes were made."
          requestId={rfisState.requestId}
          onRetry={rfisState.retry}
        />
      </section>
    );
  }

  const { rfis, responsibleContacts, capabilities } = rfisState.data;
  const filtered = applyFilters(rfis, filters);
  const active = hasActiveFilters(filters);

  function handleSort(key: RfiFilters["sort"]) {
    if (filters.sort === key) {
      updateFilters(
        { sort: key, direction: filters.direction === "asc" ? "desc" : "asc" },
        true,
      );
    } else {
      updateFilters({ sort: key, direction: SORT_KEYS[key].defaultDir }, true);
    }
  }

  const addButton = capabilities.createRfi ? (
    <Button
      variant="primary"
      loading={creating}
      data-create-rfi
      onClick={() => {
        void handleAddRfi();
      }}
    >
      Add RFI
    </Button>
  ) : null;

  return (
    <section className="rfi-register-page">
      <PageHeader
        title="RFIs"
        asHeading={false}
        supporting={`${String(rfis.length)} RFI${rfis.length === 1 ? "" : "s"}`}
        primaryAction={addButton}
      />
      <p className="base-sr-only" id="rfi-register-hint">
        Click a draft RFI&rsquo;s subject to edit its fields inline. Click a
        column header to sort.
      </p>
      {rfis.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No RFIs yet"
          description="Create the first working draft."
          action={
            capabilities.createRfi ? (
              <Button
                variant="secondary"
                loading={creating}
                onClick={() => {
                  void handleAddRfi();
                }}
              >
                Add RFI
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <RegisterToolbar
            searchValue={filters.q}
            onSearchChange={(value) => {
              updateFilters({ q: value }, false);
            }}
            searchLabel="Search RFIs"
            searchPlaceholder="Search RFIs…"
            filters={
              <>
                <Field label="Status" hideLabel controlId="rfi-status">
                  <Select
                    size="compact"
                    value={filters.status}
                    onChange={(event) => {
                      updateFilters({ status: event.target.value }, true);
                    }}
                  >
                    <option value="all">All statuses</option>
                    {statusOptions(rfis).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Party" hideLabel controlId="rfi-responsible">
                  <Select
                    size="compact"
                    value={filters.responsible}
                    onChange={(event) => {
                      updateFilters({ responsible: event.target.value }, true);
                    }}
                  >
                    <option value="all">All parties</option>
                    {responsibleOptions(rfis, responsibleContacts).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Due" hideLabel controlId="rfi-due">
                  <Select
                    size="compact"
                    value={filters.due}
                    onChange={(event) => {
                      updateFilters(
                        { due: event.target.value as DueFilter },
                        true,
                      );
                    }}
                  >
                    <option value="all">Any due status</option>
                    {DUE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            }
            chips={
              active ? (
                <Button
                  variant="ghost"
                  size="compact"
                  data-clear-filters
                  onClick={() => {
                    const { sort, direction } = filters;
                    updateFilters(
                      { ...defaultFilters(), sort, direction },
                      true,
                    );
                  }}
                >
                  Clear all
                </Button>
              ) : null
            }
            resultCount={
              active
                ? `${String(filtered.length)} of ${String(rfis.length)} RFIs`
                : undefined
            }
          />
          {filtered.length === 0 ? (
            <EmptyState
              variant="filtered"
              title="No RFIs match these filters."
              action={
                <Button
                  variant="secondary"
                  data-clear-filters
                  onClick={() => {
                    const { sort, direction } = filters;
                    updateFilters(
                      { ...defaultFilters(), sort, direction },
                      true,
                    );
                  }}
                >
                  Clear all
                </Button>
              }
            />
          ) : (
            <>
              <RfiTable
                projectId={projectId}
                rfis={filtered}
                contacts={responsibleContacts}
                filters={filters}
                onSort={handleSort}
                editorOpenId={editorOpenId}
                onToggleEditor={toggleEditor}
                fieldStatesFor={(id) => fieldStates[id] ?? {}}
                onCommitField={(id, field, value) => {
                  void commitField(id, field, value);
                }}
                onDoneEditing={closeEditor}
                editorResetSignal={editorResetSignal}
              />
              <RfiCards projectId={projectId} rfis={filtered} />
            </>
          )}
        </>
      )}
    </section>
  );
}
