/*
 * The three focused Record workflows launched from the workspace overflow menu
 * and current-work panel, on the shared dialog patterns:
 *
 *  - Edit document details  -> `FormDialog` (concise metadata edit)
 *  - Archive document       -> `AlertDialog` (consequential, explicit confirm)
 *  - Create draft revision  -> `FormDialog`, then navigation to the new draft
 *
 * Focus trap, Escape, scroll lock, and focus restoration come from the shared
 * components (Radix); nothing here hand-rolls a modal. The server stays
 * authoritative for validation, lifecycle, and permission -- client validation
 * only prevents obviously invalid submissions.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  Field,
  FormDialog,
  Select,
  TextArea,
  TextInput,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import {
  archiveRecord,
  createRevision,
  RecordWorkspaceApiError,
  revisionHref,
  updateRecord,
} from "./api";
import { DISCIPLINES, recordTypeLabel, revisionName } from "./format";
import { recordWorkspaceQueryKey } from "./useRecordWorkspace";
import type { WorkspaceRecord } from "./types";

function errorText(error: unknown, fallback: string): string {
  if (error instanceof RecordWorkspaceApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function requestIdOf(error: unknown): string {
  return error instanceof RecordWorkspaceApiError ? error.requestId : "";
}

function ErrorSummary({
  message,
  requestId,
}: {
  message: string;
  requestId: string;
}) {
  return (
    <div>
      <p>{message}</p>
      {requestId ? (
        <p className="record-workspace-request-id">
          Request ID <code>{requestId}</code>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A stored discipline that is no longer in the controlled vocabulary stays
 * selectable and visible rather than being silently dropped on the next save.
 */
function disciplineChoices(current: string | null) {
  const value = current ?? "";
  const known = DISCIPLINES.some((option) => option.value === value);
  return { value, legacy: value !== "" && !known };
}

export function EditRecordDialog({
  projectId,
  record,
  open,
  onOpenChange,
}: {
  projectId: string;
  record: WorkspaceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(record.title);
  const [discipline, setDiscipline] = useState(record.discipline ?? "");
  const [description, setDescription] = useState(record.description ?? "");
  const [source, setSource] = useState(record.source ?? "");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed from the authoritative record whenever the dialog is opened, so a
  // cancelled edit never leaves stale values behind for the next open.
  useEffect(() => {
    if (!open) return;
    setTitle(record.title);
    setDiscipline(record.discipline ?? "");
    setDescription(record.description ?? "");
    setSource(record.source ?? "");
    setTitleError(undefined);
    setFailure(null);
    setSaving(false);
  }, [open, record]);

  const legacy = disciplineChoices(record.discipline).legacy;

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
      className="record-workspace-dialog"
      title="Edit document details"
      description={`${
        record.recordNumber ? `Document ${record.recordNumber} · ` : ""
      }${recordTypeLabel(record.recordType)} metadata`}
      submitLabel="Save changes"
      loading={saving}
      initialFocusRef={titleRef}
      errorSummary={
        failure ? (
          <ErrorSummary
            message={failure.message}
            requestId={failure.requestId}
          />
        ) : undefined
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const trimmed = title.trim();
        if (!trimmed) {
          setTitleError("Document title is required.");
          titleRef.current?.focus();
          shell.announce("Please correct the highlighted fields.");
          return;
        }
        setSaving(true);
        setFailure(null);
        void (async () => {
          try {
            await updateRecord(projectId, record.id, {
              title: trimmed,
              description: description.trim() || null,
              discipline: discipline.trim() || null,
              source: source.trim() || null,
            });
            await queryClient.invalidateQueries({
              queryKey: recordWorkspaceQueryKey(projectId, record.id),
            });
            shell.announce("Document details updated.");
            setSaving(false);
            onOpenChange(false);
          } catch (error) {
            setSaving(false);
            setFailure({
              message: errorText(
                error,
                "The document details could not be saved.",
              ),
              requestId: requestIdOf(error),
            });
            shell.announce("The document details could not be saved.");
          }
        })();
      }}
    >
      <Field label="Title" required error={titleError}>
        <TextInput
          ref={titleRef}
          value={title}
          autoComplete="off"
          data-record-title
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(undefined);
          }}
        />
      </Field>
      <Field
        label="Discipline"
        help={
          legacy
            ? "This document carries a legacy discipline value. Choosing a replacement retires it."
            : undefined
        }
      >
        <Select
          value={discipline}
          data-record-discipline
          onChange={(event) => {
            setDiscipline(event.target.value);
          }}
        >
          <option value="">No discipline</option>
          {legacy ? (
            <option value={record.discipline ?? ""}>
              Legacy: {record.discipline} — choose a replacement
            </option>
          ) : null}
          {DISCIPLINES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description">
        <TextArea
          rows={3}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </Field>
      <Field label="Source">
        <TextInput
          value={source}
          autoComplete="off"
          onChange={(event) => {
            setSource(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

export function ArchiveRecordDialog({
  projectId,
  record,
  open,
  onOpenChange,
}: {
  projectId: string;
  record: WorkspaceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWorking(false);
      setFailure(null);
    }
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && working) return;
        onOpenChange(next);
      }}
      className="record-workspace-alert"
      title="Archive document?"
      description={
        <>
          <strong>
            {record.recordNumber || "Unnumbered document"} · {record.title}
          </strong>{" "}
          and its revision history remain available, but the document becomes
          read-only and no new revisions can be created.
          {failure ? <span role="alert"> {failure}</span> : null}
        </>
      }
      confirmLabel="Archive document"
      destructive
      loading={working}
      onConfirm={() => {
        if (working) return;
        setWorking(true);
        setFailure(null);
        void (async () => {
          try {
            await archiveRecord(projectId, record.id);
            await queryClient.invalidateQueries({
              queryKey: recordWorkspaceQueryKey(projectId, record.id),
            });
            shell.announce("Document archived.");
            setWorking(false);
            onOpenChange(false);
          } catch (error) {
            setWorking(false);
            setFailure(errorText(error, "The document could not be archived."));
            shell.announce("The document could not be archived.");
          }
        })();
      }}
    />
  );
}

export function CreateRevisionDialog({
  projectId,
  record,
  open,
  onOpenChange,
}: {
  projectId: string;
  record: WorkspaceRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState<string | undefined>();
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
  } | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setSummary("");
    setSummaryError(undefined);
    setFailure(null);
    setWorking(false);
  }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && working) return;
        onOpenChange(next);
      }}
      className="record-workspace-dialog"
      title="Create draft revision"
      description={`Begin a new draft for ${record.title}. The revision number is assigned by the server.`}
      submitLabel="Create draft"
      loading={working}
      initialFocusRef={summaryRef}
      errorSummary={
        failure ? (
          <ErrorSummary
            message={failure.message}
            requestId={failure.requestId}
          />
        ) : undefined
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (working) return;
        const trimmed = summary.trim();
        if (!trimmed) {
          setSummaryError("A change summary is required.");
          summaryRef.current?.focus();
          shell.announce("Please correct the highlighted fields.");
          return;
        }
        setWorking(true);
        setFailure(null);
        void (async () => {
          try {
            const created = await createRevision(projectId, record.id, {
              changeSummary: trimmed,
              ...(label.trim() ? { revisionLabel: label.trim() } : {}),
            });
            await queryClient.invalidateQueries({
              queryKey: recordWorkspaceQueryKey(projectId, record.id),
            });
            shell.announce(
              `Draft ${revisionName(created)} created.`.replace("  ", " "),
            );
            setWorking(false);
            onOpenChange(false);
            shell.navigate(revisionHref(projectId, record.id, created.id));
          } catch (error) {
            setWorking(false);
            setFailure({
              message: errorText(
                error,
                "The draft revision could not be created.",
              ),
              requestId: requestIdOf(error),
            });
            shell.announce("The draft revision could not be created.");
          }
        })();
      }}
    >
      <Field
        label="Revision label"
        help="Optional. The revision number is always assigned by the server."
      >
        <TextInput
          value={label}
          autoComplete="off"
          data-revision-label
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
      </Field>
      <Field label="Change summary" required error={summaryError}>
        <TextArea
          ref={summaryRef}
          rows={3}
          value={summary}
          data-revision-summary
          onChange={(event) => {
            setSummary(event.target.value);
            setSummaryError(undefined);
          }}
        />
      </Field>
    </FormDialog>
  );
}
