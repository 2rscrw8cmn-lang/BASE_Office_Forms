/*
 * Compact desktop RFI register. It remains a native semantic table, while
 * editable drafts open in the shared Drawer owned by RfiRegisterFeature.
 */

import type { KeyboardEvent, MouseEvent } from "react";
import { AppLink } from "../../app/AppLink";
import { useShell } from "../../app/ShellContext";
import {
  Badge,
  DropdownMenu,
  IconButton,
  RfiStatusBadge,
} from "../../components";
import {
  formatDate,
  formatRelativeUpdated,
  formatShortDate,
  rfiDueUrgencyText,
} from "./format";
import { SORT_KEYS, type RfiFilters } from "./urlState";
import type { ResponsibleContactOption, RfiListItem } from "./types";

function truncate(value: string | null | undefined, max = 140): string {
  const text = (value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function rfiWorkspaceHref(projectId: string, rfiId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}`;
}

export interface RfiTableProps {
  projectId: string;
  rfis: RfiListItem[];
  contacts: ResponsibleContactOption[];
  filters: RfiFilters;
  onSort: (key: RfiFilters["sort"]) => void;
  editorOpenId: string | null;
  onOpenEditor: (id: string, trigger?: HTMLElement) => void;
}

function SortHeader({
  sortKey,
  label,
  filters,
  onSort,
}: {
  sortKey: RfiFilters["sort"];
  label: string;
  filters: RfiFilters;
  onSort: (key: RfiFilters["sort"]) => void;
}) {
  const active = filters.sort === sortKey;
  const ariaSort: "none" | "ascending" | "descending" = active
    ? filters.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const nextDirectionLabel = active
    ? filters.direction === "asc"
      ? "descending"
      : "ascending"
    : SORT_KEYS[sortKey].defaultDir === "asc"
      ? "ascending"
      : "descending";

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button
        type="button"
        className={`rfi-register-sort-header${active ? " is-active" : ""}`}
        data-sort-header={sortKey}
        aria-label={`Sort by ${label}, ${nextDirectionLabel}`}
        onClick={() => {
          onSort(sortKey);
        }}
      >
        {label}
        {active ? (
          <span className="rfi-register-sort-arrow" aria-hidden="true">
            {filters.direction === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function IdentityCell({ rfi, href }: { rfi: RfiListItem; href: string }) {
  const legacyIncomplete =
    rfi.issuanceReconciliationState === "legacy_incomplete";

  if (!rfi.rfiNumber) {
    return (
      <span className="rfi-register-identity">
        <Badge tone="neutral">Draft</Badge>
        {rfi.legacyReference ? (
          <span className="rfi-register-id-legacy">
            Legacy {rfi.legacyReference}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="rfi-register-identity">
      <AppLink
        className="rfi-register-id-link"
        href={href}
        aria-label={`Open RFI ${rfi.rfiNumber}`}
      >
        {legacyIncomplete ? `Reserved ${rfi.rfiNumber}` : rfi.rfiNumber}
      </AppLink>
      {rfi.legacyReference ? (
        <span className="rfi-register-id-legacy">
          Legacy {rfi.legacyReference}
        </span>
      ) : null}
    </span>
  );
}

function SubjectCell({
  rfi,
  href,
  open,
  onOpenEditor,
}: {
  rfi: RfiListItem;
  href: string;
  open: boolean;
  onOpenEditor: (id: string, trigger?: HTMLElement) => void;
}) {
  const subject = rfi.subject || "Untitled RFI";
  const questionPreview = truncate(rfi.question, 100);
  return (
    <td className="rfi-register-cell-subject">
      {rfi.capabilities.updateDraft ? (
        <button
          type="button"
          className="rfi-register-subject-open"
          data-subject-edit
          data-editor-trigger
          data-id={rfi.id}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`rfi-editor-${rfi.id}`}
          onClick={(event) => {
            onOpenEditor(rfi.id, event.currentTarget);
          }}
        >
          <span className="rfi-register-subject-open-text">{subject}</span>
        </button>
      ) : (
        <AppLink
          className="rfi-register-subject-link"
          href={href}
          title={subject}
        >
          {subject}
        </AppLink>
      )}
      {questionPreview ? (
        <span className="rfi-register-subject-secondary">
          {questionPreview}
        </span>
      ) : null}
    </td>
  );
}

function StatusCell({ rfi }: { rfi: RfiListItem }) {
  return (
    <td className="rfi-register-cell-status">
      {rfi.issuanceReconciliationState === "legacy_incomplete" ? (
        <Badge tone="warning">Needs issue repair</Badge>
      ) : (
        <RfiStatusBadge status={rfi.status} />
      )}
    </td>
  );
}

function ResponsibleCell({
  rfi,
  contacts,
}: {
  rfi: RfiListItem;
  contacts: ResponsibleContactOption[];
}) {
  if (rfi.responsiblePartyLegacyText) {
    return (
      <td className="rfi-register-cell-responsible">
        <span className="rfi-register-cell-text">
          {rfi.responsiblePartyLegacyText}
          <span className="rfi-register-responsible-legacy">(unresolved)</span>
        </span>
      </td>
    );
  }
  if (!rfi.responsibleParty) {
    return (
      <td className="rfi-register-cell-responsible">
        <span className="rfi-register-cell-text rfi-register-responsible-empty">
          Unassigned
        </span>
      </td>
    );
  }
  const contact = contacts.find((item) => item.id === rfi.responsiblePartyId);
  return (
    <td className="rfi-register-cell-responsible">
      <span className="rfi-register-cell-text">{rfi.responsibleParty}</span>
      {contact?.companyName ? (
        <span className="rfi-register-responsible-company">
          {contact.companyName}
        </span>
      ) : null}
    </td>
  );
}

function DueCell({ rfi }: { rfi: RfiListItem }) {
  const hasDate = Boolean(rfi.requestedResponseDate);
  const dateText = hasDate
    ? formatShortDate(rfi.requestedResponseDate)
    : "No due date";
  const urgency = hasDate
    ? rfiDueUrgencyText(rfi.requestedResponseDate, rfi.isOverdue)
    : "";
  const tone = rfi.isOverdue
    ? " is-overdue"
    : rfi.dueSoon
      ? " is-due-soon"
      : "";
  return (
    <td className="rfi-register-cell-due">
      <span className="rfi-register-cell-text rfi-register-due-date">
        {dateText}
      </span>
      {urgency ? (
        <span className={`rfi-register-due-urgency${tone}`}>{urgency}</span>
      ) : null}
    </td>
  );
}

function fullUpdatedLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isNestedInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("a, button, input, select, textarea") !== null
  );
}

export function RfiTable({
  projectId,
  rfis,
  contacts,
  filters,
  onSort,
  editorOpenId,
  onOpenEditor,
}: RfiTableProps) {
  const shell = useShell();

  function activateRow(
    rfi: RfiListItem,
    row: HTMLElement,
    event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
  ) {
    if (isNestedInteractive(event.target)) return;
    if (rfi.capabilities.updateDraft) {
      onOpenEditor(rfi.id, row);
    } else {
      shell.navigate(rfiWorkspaceHref(projectId, rfi.id));
    }
  }

  return (
    <div
      className="rfi-register-table-wrap"
      role="region"
      aria-label="Project RFI register"
      tabIndex={0}
    >
      <table
        className="rfi-register-table"
        aria-describedby="rfi-register-hint"
      >
        <caption className="base-sr-only">Project RFI register</caption>
        <thead>
          <tr>
            <SortHeader
              sortKey="number"
              label="RFI"
              filters={filters}
              onSort={onSort}
            />
            <SortHeader
              sortKey="subject"
              label="Subject"
              filters={filters}
              onSort={onSort}
            />
            <th scope="col">Status</th>
            <SortHeader
              sortKey="responsible"
              label="Assigned to"
              filters={filters}
              onSort={onSort}
            />
            <SortHeader
              sortKey="due"
              label="Due"
              filters={filters}
              onSort={onSort}
            />
            <SortHeader
              sortKey="updated"
              label="Updated"
              filters={filters}
              onSort={onSort}
            />
            <th scope="col">
              <span className="base-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rfis.map((rfi) => {
            const href = rfiWorkspaceHref(projectId, rfi.id);
            const open = editorOpenId === rfi.id;
            const subject = rfi.subject || "Untitled RFI";
            return (
              <tr
                key={rfi.id}
                className={`rfi-register-row${open ? " is-selected" : ""}`}
                data-rfi-row={rfi.id}
                tabIndex={0}
                aria-label={`${rfi.capabilities.updateDraft ? "Edit" : "Open"} ${subject}`}
                onClick={(event) => {
                  activateRow(rfi, event.currentTarget, event);
                }}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    activateRow(rfi, event.currentTarget, event);
                  }
                }}
              >
                <th scope="row" className="rfi-register-cell-id">
                  <IdentityCell rfi={rfi} href={href} />
                </th>
                <SubjectCell
                  rfi={rfi}
                  href={href}
                  open={open}
                  onOpenEditor={onOpenEditor}
                />
                <StatusCell rfi={rfi} />
                <ResponsibleCell rfi={rfi} contacts={contacts} />
                <DueCell rfi={rfi} />
                <td className="rfi-register-cell-updated">
                  <span
                    className="rfi-register-updated-text"
                    title={fullUpdatedLabel(rfi.updatedAt)}
                    aria-label={`Updated ${fullUpdatedLabel(rfi.updatedAt)}`}
                  >
                    {formatRelativeUpdated(rfi.updatedAt) ||
                      formatDate(rfi.updatedAt) ||
                      "—"}
                  </span>
                </td>
                <td className="rfi-register-cell-actions">
                  <DropdownMenu
                    trigger={
                      <IconButton
                        icon="more"
                        label={`Actions for ${subject}`}
                        size="compact"
                        data-rfi-actions={rfi.id}
                      />
                    }
                    items={
                      rfi.capabilities.updateDraft
                        ? [
                            {
                              id: "edit",
                              label: "Edit details",
                              icon: "pencil",
                              onSelect: () => {
                                onOpenEditor(rfi.id);
                              },
                            },
                            {
                              id: "open",
                              label: "Open RFI",
                              icon: "file-text",
                              onSelect: () => {
                                shell.navigate(href);
                              },
                            },
                          ]
                        : [
                            {
                              id: "open",
                              label: "Open RFI",
                              icon: "file-text",
                              onSelect: () => {
                                shell.navigate(href);
                              },
                            },
                          ]
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
