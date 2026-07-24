/*
 * The desktop RFI register: a native semantic <table> with the five preserved
 * columns (RFI, Subject, Party, Due, Updated). No Action column, no whole-row
 * navigation, no grid/cell-selection semantics -- per Spike 0 and the UI-5
 * binding decision, this is a controlled table, not a data grid. Only the RFI
 * identity link and (for locked rows) the Subject link navigate; an editable
 * draft's Subject is a button that opens the row's expandable editor instead.
 */

import { Fragment } from "react";
import { AppLink } from "../../app/AppLink";
import {
  formatDate,
  formatRelativeUpdated,
  formatShortDate,
  rfiDueUrgencyText,
  rfiStatusLabel,
} from "./format";
import { SORT_HEADERS, SORT_KEYS, type RfiFilters } from "./urlState";
import type { FieldState } from "./RfiEditorPanel";
import { RfiEditorPanel } from "./RfiEditorPanel";
import type {
  ResponsibleContactOption,
  RfiEditableField,
  RfiListItem,
} from "./types";

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
  onToggleEditor: (id: string) => void;
  fieldStatesFor: (id: string) => Partial<Record<RfiEditableField, FieldState>>;
  onCommitField: (
    id: string,
    field: RfiEditableField,
    rawValue: string,
  ) => void;
  onDoneEditing: () => void;
  editorResetSignal: number;
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
  const arrow = filters.direction === "asc" ? "↑" : "↓";
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
          <>
            {" "}
            <span className="rfi-register-sort-arrow" aria-hidden="true">
              {arrow}
            </span>
          </>
        ) : null}
      </button>
    </th>
  );
}

function IdentityCell({ rfi }: { rfi: RfiListItem }) {
  const isLegacyIncomplete =
    rfi.issuanceReconciliationState === "legacy_incomplete";
  const numberText = rfi.rfiNumber || "Unnumbered";
  const statusText = isLegacyIncomplete
    ? "Needs issue repair"
    : rfiStatusLabel(rfi.status);
  return (
    <>
      <span
        className={`rfi-register-id-number${rfi.rfiNumber ? "" : " rfi-register-id-number--draft"}`}
      >
        {numberText}
      </span>
      <span
        className={`rfi-register-id-status${isLegacyIncomplete ? " is-attention" : ""}`}
      >
        {statusText}
      </span>
      {rfi.legacyReference ? (
        <span className="rfi-register-id-legacy">
          Legacy {rfi.legacyReference}
        </span>
      ) : null}
    </>
  );
}

function SubjectCell({
  rfi,
  href,
  editorOpenId,
  onToggleEditor,
}: {
  rfi: RfiListItem;
  href: string;
  editorOpenId: string | null;
  onToggleEditor: (id: string) => void;
}) {
  const editable = rfi.capabilities.updateDraft;
  const questionPreview = truncate(rfi.question, 90);
  const refs = [rfi.drawingReferences, rfi.specificationReferences]
    .filter(Boolean)
    .join(" · ");
  return (
    <td
      className="rfi-register-cell-subject"
      data-subject-cell
      data-id={rfi.id}
    >
      {editable ? (
        <button
          type="button"
          className="rfi-register-subject-open"
          data-subject-edit
          data-id={rfi.id}
          aria-expanded={editorOpenId === rfi.id}
          aria-controls={`rfi-editor-${rfi.id}`}
          onClick={() => {
            onToggleEditor(rfi.id);
          }}
        >
          <span className="rfi-register-subject-open-text">
            {rfi.subject || "Untitled RFI"}
          </span>
        </button>
      ) : (
        <AppLink
          className="rfi-register-subject-link"
          href={href}
          title={rfi.subject || ""}
        >
          {rfi.subject || "Untitled RFI"}
        </AppLink>
      )}
      {questionPreview ? (
        <span className="rfi-register-subject-secondary">
          {questionPreview}
        </span>
      ) : null}
      {refs ? <span className="rfi-register-subject-meta">{refs}</span> : null}
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
          {rfi.responsiblePartyLegacyText}{" "}
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
  const dateText = formatShortDate(rfi.requestedResponseDate) || "—";
  const urgency = rfiDueUrgencyText(rfi.requestedResponseDate, rfi.isOverdue);
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

export function RfiTable({
  projectId,
  rfis,
  contacts,
  filters,
  onSort,
  editorOpenId,
  onToggleEditor,
  fieldStatesFor,
  onCommitField,
  onDoneEditing,
  editorResetSignal,
}: RfiTableProps) {
  return (
    <div
      className="rfi-register-table-wrap"
      role="region"
      aria-label="Project RFI working register"
      tabIndex={0}
    >
      <table
        className="rfi-register-table"
        aria-describedby="rfi-register-hint"
      >
        <caption className="base-sr-only">
          Editable project RFI register
        </caption>
        <thead>
          <tr>
            {SORT_HEADERS.map(([key, label]) => (
              <SortHeader
                key={key}
                sortKey={key}
                label={label}
                filters={filters}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rfis.map((rfi) => {
            const editable = rfi.capabilities.updateDraft;
            const href = rfiWorkspaceHref(projectId, rfi.id);
            const open = editorOpenId === rfi.id;
            return (
              <Fragment key={rfi.id}>
                <tr
                  className={`rfi-register-row${editable ? "" : " is-locked"}`}
                  data-rfi-row={rfi.id}
                >
                  <th scope="row" className="rfi-register-cell-id">
                    <AppLink
                      className="rfi-register-id-link"
                      href={href}
                      aria-label={`Open RFI ${rfi.rfiNumber || "Unnumbered"}`}
                    >
                      <IdentityCell rfi={rfi} />
                    </AppLink>
                  </th>
                  <SubjectCell
                    rfi={rfi}
                    href={href}
                    editorOpenId={editorOpenId}
                    onToggleEditor={onToggleEditor}
                  />
                  <ResponsibleCell rfi={rfi} contacts={contacts} />
                  <DueCell rfi={rfi} />
                  <td className="rfi-register-cell-updated">
                    <span
                      className="rfi-register-updated-text"
                      title={formatDate(rfi.updatedAt) || ""}
                    >
                      {formatRelativeUpdated(rfi.updatedAt) || "—"}
                    </span>
                  </td>
                </tr>
                {editable && open ? (
                  <tr className="rfi-register-editor-row">
                    <td colSpan={5}>
                      <RfiEditorPanel
                        rfi={rfi}
                        contacts={contacts}
                        fieldStates={fieldStatesFor(rfi.id)}
                        resetSignal={editorResetSignal}
                        onCommit={(field, value) => {
                          onCommitField(rfi.id, field, value);
                        }}
                        onDone={onDoneEditing}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
