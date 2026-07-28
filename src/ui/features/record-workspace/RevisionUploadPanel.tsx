/*
 * File upload for a draft revision.
 *
 * The staged-work rule from UI-6B's Add Document flow applies here too: a
 * failure must never lead to a blind retry that duplicates server state. An
 * upload that fails therefore refetches the revision from the server *first*,
 * so the file list on screen is confirmed truth before the operator decides
 * whether to retry -- if the file actually landed before the connection broke,
 * it is already visible and the retry button is no longer the obvious next step.
 *
 * The selected filename is preserved across a failure (UX_PRODUCT_SPEC §6.4),
 * the control is disabled while the request is in flight, and success is only
 * claimed after the server confirms it.
 */

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Icon, SaveIndicator } from "../../components";
import { useShell } from "../../app/ShellContext";
import { RecordWorkspaceApiError, uploadRevisionFile } from "./api";
import { formatBytes } from "./format";
import { projectRecordsQueryKey } from "../records/useProjectRecords";
import {
  recordWorkspaceQueryKey,
  revisionWorkspaceQueryKey,
} from "./useRecordWorkspace";

interface UploadFailure {
  message: string;
  requestId: string;
  fileName: string;
}

export function RevisionUploadPanel({
  projectId,
  recordId,
  revisionId,
  hasFiles,
}: {
  projectId: string;
  recordId: string;
  revisionId: string;
  hasFiles: boolean;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [validation, setValidation] = useState<string | undefined>();

  const refreshEverything = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: revisionWorkspaceQueryKey(projectId, recordId, revisionId),
      }),
      queryClient.invalidateQueries({
        queryKey: recordWorkspaceQueryKey(projectId, recordId),
      }),
      queryClient.invalidateQueries({
        queryKey: projectRecordsQueryKey(projectId),
      }),
    ]);
  };

  return (
    <form
      className="revision-upload"
      noValidate
      aria-busy={uploading || undefined}
      data-upload-form
      onSubmit={(event) => {
        event.preventDefault();
        if (uploading) return;
        const file = selected;
        if (!file) {
          setValidation("Choose a document file to upload.");
          fileRef.current?.focus();
          shell.announce("Choose a document file to upload.");
          return;
        }
        setValidation(undefined);
        setUploading(true);
        setFailure(null);
        shell.announce(`Uploading ${file.name}.`);
        void (async () => {
          try {
            await uploadRevisionFile(projectId, recordId, revisionId, file);
            await refreshEverything();
            setUploading(false);
            setSelected(null);
            if (fileRef.current) fileRef.current.value = "";
            shell.announce(`${file.name} uploaded to this revision.`);
          } catch (error) {
            // Confirm what the server actually holds before offering a retry,
            // so a repeat attempt cannot silently create a second copy.
            await refreshEverything();
            setUploading(false);
            setFailure({
              message:
                error instanceof RecordWorkspaceApiError
                  ? error.message
                  : "The file could not be uploaded.",
              requestId:
                error instanceof RecordWorkspaceApiError ? error.requestId : "",
              fileName: file.name,
            });
            shell.announce("The file could not be uploaded.");
          }
        })();
      }}
    >
      <Field
        label={hasFiles ? "Add another file" : "Upload document"}
        help="Files are stored privately and stay attached to this exact draft revision."
        error={validation}
      >
        <input
          ref={fileRef}
          type="file"
          className="base-input revision-upload__input"
          data-revision-file
          disabled={uploading}
          onChange={(event) => {
            setSelected(event.target.files?.[0] ?? null);
            setValidation(undefined);
            setFailure(null);
          }}
        />
      </Field>

      {selected ? (
        <p className="revision-upload__selected">
          Selected: {selected.name} · {formatBytes(selected.size)}
        </p>
      ) : null}

      <div className="revision-upload__actions">
        <Button
          type="submit"
          variant="primary"
          iconStart="upload"
          loading={uploading}
          disabled={!selected}
          data-upload-submit
        >
          {failure ? "Retry upload" : "Upload file"}
        </Button>
        {uploading ? <SaveIndicator state="saving" /> : null}
      </div>

      {failure ? (
        <div className="revision-upload__error" role="alert">
          <Icon name="circle-alert" size={16} />
          <div>
            <p>{failure.message}</p>
            <p>
              “{failure.fileName}” was not attached. The version's files above
              were refreshed from the server — confirm the file is still missing
              before retrying.
            </p>
            {failure.requestId ? (
              <p className="record-workspace-request-id">
                Request ID <code>{failure.requestId}</code>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
