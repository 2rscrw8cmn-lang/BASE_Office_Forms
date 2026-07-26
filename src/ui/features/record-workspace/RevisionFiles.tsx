/*
 * File presentation for a revision, shared by the Record and Revision
 * workspaces so one revision's files look and behave identically wherever they
 * appear.
 *
 * Files render through the shared `FileRow` pattern rather than a second
 * feature-owned table: name, readable media type, size, upload time, and one
 * labelled action. `UX_PRODUCT_SPEC` §7.5 described a bespoke desktop file
 * table before the UI-3 component library existed; the shared row carries the
 * same facts, reflows on mobile without a separate card system, and adds no
 * selection affordance because issuance selection is not enabled.
 *
 * Downloads go through the authenticated content endpoint. No storage key,
 * bucket, or R2 URL is ever exposed.
 */

import type { ReactNode } from "react";
import { ButtonLink, EmptyState, FileRow } from "../../components";
import { fileContentHref } from "./api";
import { formatBytes, formatDate, mediaTypeLabel } from "./format";
import type { WorkspaceFile } from "./types";

export function RevisionFiles({
  projectId,
  recordId,
  revisionId,
  files,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  projectId: string;
  recordId: string;
  revisionId: string;
  files: WorkspaceFile[];
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  if (files.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        icon="paperclip"
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className="record-workspace-files-empty"
      />
    );
  }

  return (
    <ul className="record-workspace-files" data-revision-files={revisionId}>
      {files.map((file) => (
        <li key={file.id}>
          <FileRow
            name={file.originalFilename}
            meta={`${mediaTypeLabel(file.mediaType)} · ${formatBytes(
              file.byteSize,
            )} · Uploaded ${formatDate(file.uploadedAt)}`}
            actions={
              <ButtonLink
                size="compact"
                variant="secondary"
                iconStart="download"
                href={fileContentHref(projectId, recordId, revisionId, file.id)}
                target="_blank"
                rel="noopener"
                aria-label={`Download ${file.originalFilename}`}
                data-file-download={file.id}
              >
                Download
              </ButtonLink>
            }
          />
        </li>
      ))}
    </ul>
  );
}
