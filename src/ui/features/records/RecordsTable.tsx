/*
 * The desktop Document Register: a native semantic <table> with exactly six
 * columns -- Document, Type, Discipline, Revision, Files, Updated. No grid
 * role, no spreadsheet selection or keyboard model, no pinned columns, no cell
 * editing, and no redundant Actions/Open column: the Document title is the
 * canonical link and the safe (non-interactive) row area repeats it.
 *
 * Record identity, Revision identity, and Files stay visibly distinct: the
 * title and record number identify the document, the Revision cell shows the
 * one authoritative current version, and the Files count spans every revision.
 */

import type { MouseEvent } from "react";
import { RecordStatusBadge, RevisionStatusBadge } from "../../components";
import { AppLink } from "../../app/AppLink";
import {
  disciplineLabel,
  formatRecordDate,
  isValidTimestamp,
  recordTypeLabel,
  revisionName,
} from "./format";
import type { RecordListItem } from "./types";

export function recordWorkspaceHref(
  projectId: string,
  recordId: string,
): string {
  return `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}`;
}

/**
 * A row click navigates only when it is an ordinary left click on inert row
 * area: modifier clicks, middle clicks, clicks that land on any interactive
 * control, and clicks that end an active text selection are all left to the
 * browser (or to the control) so native link behaviour is preserved.
 */
function isPlainRowClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      "a, button, input, select, textarea, label, [contenteditable='true']",
    )
  ) {
    return false;
  }
  const selection =
    event.currentTarget.ownerDocument.defaultView?.getSelection();
  return !(selection && !selection.isCollapsed && selection.toString());
}

export function RecordRevisionCell({ record }: { record: RecordListItem }) {
  if (!record.currentRevision) {
    return <span className="records-register-no-revision">No revision</span>;
  }
  return (
    <>
      <span className="records-register-revision">
        {revisionName(record.currentRevision)}
      </span>
      <RevisionStatusBadge status={record.currentRevision.status} />
    </>
  );
}

export function RecordsTable({
  projectId,
  records,
  onNavigate,
}: {
  projectId: string;
  records: RecordListItem[];
  onNavigate: (href: string) => void;
}) {
  return (
    <div
      className="records-register-table-wrap"
      role="region"
      aria-label="Document register"
      tabIndex={0}
    >
      <table className="records-register-table">
        <caption className="base-sr-only">
          Documents you can access in this project
        </caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            <th scope="col">Discipline</th>
            <th scope="col">Revision</th>
            <th scope="col">Files</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const href = recordWorkspaceHref(projectId, record.id);
            const recordNumber = record.recordNumber?.trim();
            return (
              <tr
                key={record.id}
                className="records-register-row"
                data-record-row={record.id}
                onClick={(event) => {
                  if (isPlainRowClick(event)) onNavigate(href);
                }}
              >
                <th scope="row">
                  <AppLink
                    className="records-register-title"
                    href={href}
                    aria-label={`Open document ${record.title}${
                      recordNumber ? ` (${recordNumber})` : ""
                    }`}
                  >
                    {record.title}
                  </AppLink>
                  <span className="records-register-identity">
                    {/* A legacy record with no server-generated number says so
                        rather than borrowing an id or inventing one. */}
                    <span className="records-register-number">
                      {recordNumber || "No record number"}
                    </span>
                    {record.status === "archived" ? (
                      <RecordStatusBadge status={record.status} />
                    ) : null}
                    {record.hasDraftRevision ? (
                      <span className="records-register-draft">
                        Draft in progress
                      </span>
                    ) : null}
                  </span>
                </th>
                <td>{recordTypeLabel(record.recordType)}</td>
                <td>{disciplineLabel(record.discipline)}</td>
                <td className="records-register-revision-cell">
                  <RecordRevisionCell record={record} />
                </td>
                <td className="records-register-files">{record.fileCount}</td>
                <td className="records-register-updated">
                  {isValidTimestamp(record.updatedAt) ? (
                    <time dateTime={record.updatedAt}>
                      {formatRecordDate(record.updatedAt)}
                    </time>
                  ) : (
                    formatRecordDate(record.updatedAt)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
