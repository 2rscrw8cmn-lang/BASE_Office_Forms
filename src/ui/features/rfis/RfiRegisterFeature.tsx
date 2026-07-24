/*
 * Native React RFI register: `/projects/:projectId/rfis`.
 * Drafts share one responsive Drawer for changed-only field commits, while
 * issued RFIs remain read-only links to the compatibility workspace until
 * UI-7. Capability checks and URL-backed query state remain server-aligned.
 */

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Button,
  Drawer,
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
import { RfiEditorPanel, type FieldState } from "./RfiEditorPanel";
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
  const [searchParams] = useSearchParams();
  const filters = filtersFromSearchParams(searchParams);
  const rfisState = useProjectRfis(projectId);
  const queryClient = useQueryClient();
  const shell = useShell();
  const location = useLocation();
  const navigate = useNavigate();

  const [editorOpenId, setEditorOpenId] = useState<string | null>(null);
  const [newDraftId, setNewDraftId] = useState<string | null>(null);
  const [fieldStates, setFieldStates] = useState<FieldStatesByRfi>({});
  const [editorResetSignal, setEditorResetSignal] = useState(0);
  const [creating, setCreating] = useState(false);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);

  const updateFilters = useCallback(
    (patch: Partial<RfiFilters>, push: boolean) => {
      const merged = { ...filters, ...patch };
      const nextSearch = filtersToSearchParams(merged).toString();
      void navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash,
        },
        { replace: !push },
      );
    },
    [filters, navigate, location.pathname, location.hash],
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

  const openEditor = useCallback(
    (id: string, trigger?: HTMLElement) => {
      if (rfisState.status !== "ready") return;
      const rfi = rfisState.data.rfis.find((item) => item.id === id);
      if (!rfi?.capabilities.updateDraft) return;
      drawerReturnFocusRef.current =
        trigger ??
        document.querySelector<HTMLElement>(
          `[data-editor-trigger][data-id="${id}"]`,
        );
      setEditorOpenId(id);
      shell.announce(`Editing ${rfi.subject || "RFI"}.`);
    },
    [rfisState, shell],
  );

  const closeEditor = useCallback(() => {
    if (!editorOpenId) return;
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.closest(`[data-editor-drawer="${editorOpenId}"]`)
    ) {
      activeElement.blur();
    }
    setEditorOpenId(null);
    setNewDraftId(null);
    shell.announce("Editor closed.");
    window.requestAnimationFrame(() => {
      drawerReturnFocusRef.current?.focus();
    });
  }, [editorOpenId, shell]);

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

  const handleAddRfi = useCallback(
    async (trigger?: HTMLElement) => {
      if (
        rfisState.status !== "ready" ||
        !rfisState.data.capabilities.createRfi ||
        creating
      ) {
        return;
      }
      drawerReturnFocusRef.current = trigger ?? null;
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
        setNewDraftId(newItem.id);
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
    },
    [rfisState, creating, projectId, queryClient, updateFilters, shell],
  );

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
  const draftCount = rfis.filter((rfi) => !rfi.rfiNumber).length;
  const activeEditorRfi = editorOpenId
    ? (rfis.find((rfi) => rfi.id === editorOpenId) ?? null)
    : null;

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
      iconStart="plus"
      onClick={(event) => {
        void handleAddRfi(event.currentTarget);
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
        supporting={`${String(rfis.length)} RFI${rfis.length === 1 ? "" : "s"} · ${String(draftCount)} draft${draftCount === 1 ? "" : "s"}`}
        primaryAction={addButton}
      />
      <p className="base-sr-only" id="rfi-register-hint">
        Select an editable draft to open it in the editor drawer. Select an
        issued RFI to open its workspace. Column headers sort the register.
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
                iconStart="plus"
                onClick={(event) => {
                  void handleAddRfi(event.currentTarget);
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
            searchPlaceholder="Search number, subject, or assignee…"
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
                <Field
                  label="Assigned to"
                  hideLabel
                  controlId="rfi-responsible"
                >
                  <Select
                    size="compact"
                    value={filters.responsible}
                    onChange={(event) => {
                      updateFilters({ responsible: event.target.value }, true);
                    }}
                  >
                    <option value="all">All assignees</option>
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
                    <option value="all">Due date</option>
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
                  Clear
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
                  Clear
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
                onOpenEditor={openEditor}
              />
              <RfiCards
                projectId={projectId}
                rfis={filtered}
                editorOpenId={editorOpenId}
                onOpenEditor={openEditor}
              />
            </>
          )}
        </>
      )}
      {activeEditorRfi ? (
        <Drawer
          open
          side="right"
          title={
            newDraftId === activeEditorRfi.id ? "New RFI" : "Edit RFI draft"
          }
          className="rfi-register-drawer"
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
        >
          <RfiEditorPanel
            rfi={activeEditorRfi}
            contacts={responsibleContacts}
            fieldStates={fieldStates[activeEditorRfi.id] ?? {}}
            resetSignal={editorResetSignal}
            onCommit={(field, value) => {
              void commitField(activeEditorRfi.id, field, value);
            }}
            onClose={closeEditor}
          />
        </Drawer>
      ) : null}
    </section>
  );
}
