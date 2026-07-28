/*
 * RFI attachments.
 *
 * Every file carries its explicit role (supporting attachment or reference
 * drawing) and the exact draft revision it belongs to, so a file can never be
 * read as belonging to the RFI in general. Files are listed role-first and the
 * role is visible on each row, not inferred from position.
 *
 * Uploading is capability-gated by the server. A failure refetches the workspace
 * before offering a retry, so a repeat attempt can never quietly attach a second
 * copy of a file the server already stored.
 */

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  FileRow,
  Icon,
  SaveIndicator,
  Select,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import {
  attachmentContentHref,
  RfiWorkspaceApiError,
  uploadRfiAttachment,
} from "./api";
import { formatBytes, formatDate, rfiAttachmentRoleLabel } from "./format";
import { rfiWorkspaceQueryKey } from "./useRfiWorkspace";
import type { RfiWorkspaceAttachment, RfiWorkspaceModel } from "./types";

const ROLE_OPTIONS: [string, string][] = [
  ["supporting_attachment", "Supporting attachment"],
  ["reference_drawing", "Reference drawing"],
];

export function attachmentList(
  data: RfiWorkspaceModel,
): RfiWorkspaceAttachment[] {
  return [
    ...data.attachments.supporting_attachment,
    ...data.attachments.reference_drawing,
  ];
}

export function RfiAttachmentsPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: RfiWorkspaceModel;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState(ROLE_OPTIONS[0][0]);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validation, setValidation] = useState<string | undefined>();
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
    fileName: string;
  } | null>(null);

  const files = attachmentList(data);

  return (
    <>
      {files.length > 0 ? (
        <ul className="rfi-workspace-files">
          {files.map((file) => (
            <li key={file.id}>
              <FileRow
                name={file.originalFilename}
                role={rfiAttachmentRoleLabel(file.role)}
                meta={`${file.revisionLabel} · ${formatBytes(
                  file.byteSize,
                )} · Uploaded ${formatDate(file.uploadedAt) || "—"}`}
                actions={
                  <ButtonLink
                    size="compact"
                    variant="secondary"
                    iconStart="download"
                    href={attachmentContentHref(
                      projectId,
                      data.rfi.id,
                      file.id,
                    )}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Download ${file.originalFilename}`}
                    data-attachment-download={file.id}
                  >
                    Download
                  </ButtonLink>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          variant="first-use"
          icon="paperclip"
          title="No files yet"
          description="Supporting material stays attached to this exact draft revision."
        />
      )}

      {data.capabilities.uploadAttachment ? (
        <form
          className="rfi-workspace-upload"
          noValidate
          aria-busy={uploading || undefined}
          data-attachment-form
          onSubmit={(event) => {
            event.preventDefault();
            if (uploading) return;
            const file = selected;
            if (!file) {
              setValidation("Choose a file to upload.");
              fileRef.current?.focus();
              shell.announce("Choose a file to upload.");
              return;
            }
            setValidation(undefined);
            setUploading(true);
            setFailure(null);
            shell.announce(`Uploading ${file.name}.`);
            void (async () => {
              try {
                await uploadRfiAttachment(projectId, data.rfi.id, role, file);
                await queryClient.invalidateQueries({
                  queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
                });
                setUploading(false);
                setSelected(null);
                if (fileRef.current) fileRef.current.value = "";
                shell.announce(`${file.name} added to this RFI.`);
              } catch (error) {
                // Reconcile with the server before offering a retry, so the
                // list on screen is the truth the operator decides against.
                await queryClient.invalidateQueries({
                  queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
                });
                setUploading(false);
                setFailure({
                  message:
                    error instanceof RfiWorkspaceApiError
                      ? error.message
                      : "The file could not be added.",
                  requestId:
                    error instanceof RfiWorkspaceApiError
                      ? error.requestId
                      : "",
                  fileName: file.name,
                });
                shell.announce("The file could not be added.");
              }
            })();
          }}
        >
          <div className="rfi-workspace-upload__fields">
            <Field label="File role">
              <Select
                value={role}
                data-attachment-role
                disabled={uploading}
                onChange={(event) => {
                  setRole(event.target.value);
                }}
              >
                {ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="File" error={validation}>
              <input
                ref={fileRef}
                type="file"
                className="base-input rfi-workspace-upload__input"
                data-attachment-file
                disabled={uploading}
                onChange={(event) => {
                  setSelected(event.target.files?.[0] ?? null);
                  setValidation(undefined);
                  setFailure(null);
                }}
              />
            </Field>
          </div>

          <div className="rfi-workspace-form__actions">
            <Button
              type="submit"
              variant="secondary"
              iconStart="upload"
              loading={uploading}
              disabled={!selected}
              data-attachment-submit
            >
              {failure ? "Retry upload" : "Add file"}
            </Button>
            {uploading ? <SaveIndicator state="saving" /> : null}
          </div>

          {failure ? (
            <div className="rfi-workspace-error" role="alert">
              <Icon name="circle-alert" size={16} />
              <div>
                <p>{failure.message}</p>
                <p>
                  “{failure.fileName}” was not attached. The list above was
                  refreshed from the server — confirm the file is still missing
                  before retrying.
                </p>
                {failure.requestId ? (
                  <p className="rfi-workspace-request-id">
                    Request ID <code>{failure.requestId}</code>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
