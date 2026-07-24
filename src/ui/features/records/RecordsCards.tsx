/*
 * Dedicated mobile Document cards -- not a compressed desktop table. Each card
 * is a single canonical link to the Record workspace, which is valid,
 * accessible markup precisely because it contains no nested interactive
 * controls: the status treatments inside are badges and text, never buttons.
 *
 * The card carries the same authorized facts as the desktop row, in the
 * priority the register calls for: title, record number, record status, type,
 * discipline, authoritative current revision, draft-in-progress, file count,
 * and updated date.
 */

import { RecordStatusBadge, RevisionStatusBadge } from "../../components";
import { AppLink } from "../../app/AppLink";
import {
  disciplineLabel,
  fileCountLabel,
  formatRecordDate,
  isValidTimestamp,
  recordTypeLabel,
  revisionName,
} from "./format";
import { recordWorkspaceHref } from "./RecordsTable";
import type { RecordListItem } from "./types";

export function RecordsCards({
  projectId,
  records,
}: {
  projectId: string;
  records: RecordListItem[];
}) {
  return (
    <ul className="records-register-cards" aria-label="Document register">
      {records.map((record) => {
        const recordNumber = record.recordNumber?.trim();
        return (
          <li key={record.id}>
            <AppLink
              className="records-register-card"
              href={recordWorkspaceHref(projectId, record.id)}
              aria-label={`Open document ${record.title}${
                recordNumber ? ` (${recordNumber})` : ""
              }`}
              data-record-card={record.id}
            >
              <span className="records-register-card__top">
                <span className="records-register-card__identity">
                  <strong>{record.title}</strong>
                  <span className="records-register-number">
                    {recordNumber || "No record number"}
                  </span>
                </span>
                <RecordStatusBadge status={record.status} />
              </span>

              <span className="records-register-card__meta">
                <span>{recordTypeLabel(record.recordType)}</span>
                <span>{disciplineLabel(record.discipline)}</span>
              </span>

              <span className="records-register-card__revision">
                {record.currentRevision ? (
                  <>
                    <span className="records-register-revision">
                      {revisionName(record.currentRevision)}
                    </span>
                    <RevisionStatusBadge
                      status={record.currentRevision.status}
                    />
                  </>
                ) : (
                  <span className="records-register-no-revision">
                    No revision
                  </span>
                )}
                {record.hasDraftRevision ? (
                  <span className="records-register-draft">
                    Draft in progress
                  </span>
                ) : null}
              </span>

              <span className="records-register-card__foot">
                <span>{fileCountLabel(record.fileCount)}</span>
                <span>
                  Updated{" "}
                  {isValidTimestamp(record.updatedAt) ? (
                    <time dateTime={record.updatedAt}>
                      {formatRecordDate(record.updatedAt)}
                    </time>
                  ) : (
                    formatRecordDate(record.updatedAt)
                  )}
                </span>
              </span>
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}
