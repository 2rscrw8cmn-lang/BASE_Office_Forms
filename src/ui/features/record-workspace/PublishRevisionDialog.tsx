/*
 * Publish a draft revision.
 *
 * Publication is an official transition, not an ordinary save: it makes the
 * draft the authoritative current version, supersedes the previous one, and is
 * irreversible from this workspace. It therefore always goes through an explicit
 * confirmation with the `official` action treatment, is never triggered by a
 * field blur or an autosave, and is only offered when the server says
 * `revision.capabilities.publishRevision` and the draft actually has a file.
 *
 * Both detail workspaces use this one component so the confirmation wording and
 * the post-publish refresh cannot drift apart.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertDialog } from "../../components";
import { useShell } from "../../app/ShellContext";
import { publishRevision, RecordWorkspaceApiError } from "./api";
import { revisionName } from "./format";
import { projectRecordsQueryKey } from "../records/useProjectRecords";
import {
  recordWorkspaceQueryKey,
  revisionWorkspaceQueryKey,
} from "./useRecordWorkspace";
import type { WorkspaceRevision } from "./types";

export function PublishRevisionDialog({
  projectId,
  recordId,
  revision,
  open,
  onOpenChange,
}: {
  projectId: string;
  recordId: string;
  revision: WorkspaceRevision | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setWorking(false);
      setFailure(null);
    }
  }, [open]);

  if (!revision) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && working) return;
        onOpenChange(next);
      }}
      className="record-workspace-alert"
      title={`Publish ${revisionName(revision)}?`}
      description={
        <>
          Publishing makes this revision the current, read-only version of the
          document and supersedes the previous current version. It cannot be
          undone here.
          {failure ? (
            <span role="alert" className="record-workspace-alert__error">
              {" "}
              {failure.message}
              {failure.requestId ? ` Request ID ${failure.requestId}.` : ""}
            </span>
          ) : null}
        </>
      }
      confirmLabel="Publish revision"
      loading={working}
      onConfirm={() => {
        if (working) return;
        setWorking(true);
        setFailure(null);
        shell.announce("Publishing revision.");
        void (async () => {
          try {
            await publishRevision(projectId, recordId, revision.id);
            // Every surface that shows revision status is refetched from
            // confirmed server data; nothing is marked published optimistically.
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: recordWorkspaceQueryKey(projectId, recordId),
              }),
              queryClient.invalidateQueries({
                queryKey: revisionWorkspaceQueryKey(
                  projectId,
                  recordId,
                  revision.id,
                ),
              }),
              queryClient.invalidateQueries({
                queryKey: projectRecordsQueryKey(projectId),
              }),
            ]);
            shell.announce("Revision published.");
            setWorking(false);
            onOpenChange(false);
          } catch (error) {
            setWorking(false);
            const conflict =
              error instanceof RecordWorkspaceApiError && error.status === 409;
            if (conflict) {
              // Someone else changed this revision first: reload the truth and
              // let the operator decide again rather than retrying blindly.
              await queryClient.invalidateQueries({
                queryKey: recordWorkspaceQueryKey(projectId, recordId),
              });
            }
            setFailure({
              message:
                error instanceof RecordWorkspaceApiError
                  ? conflict
                    ? "This revision changed elsewhere. The latest version was loaded; review it and try again."
                    : error.message
                  : "The revision could not be published.",
              requestId:
                error instanceof RecordWorkspaceApiError ? error.requestId : "",
            });
            shell.announce("The revision could not be published.");
          }
        })();
      }}
    />
  );
}
