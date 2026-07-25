/*
 * The native Add Document workflow, presented in the shared `Drawer
 * size="detail"` (500-660px on larger screens, full-screen at the shared
 * mobile breakpoint). It keeps the two real entry choices the domain supports
 * -- upload the original document, or reserve an empty document identity --
 * and preserves the existing staged server workflow:
 *
 *   1. create the Record          (document identity)
 *   2. create the initial draft Revision
 *   3. upload the selected File   (upload mode only)
 *   4. navigate, only after every required stage is confirmed
 *
 * Nothing is inserted into the register optimistically, and no Record number is
 * ever supplied by the browser -- the server generates it.
 *
 * Partial success is the important case. Completed stages are remembered in
 * `progress`, so a retry resumes at the failed stage instead of creating a
 * duplicate Record or Revision, and the failure message always says what does
 * already exist and offers a link to open it.
 *
 * Focus trap, Escape, scroll lock, and focus restoration all come from the
 * shared Drawer (Radix Dialog). There is no custom modal or focus trap here.
 */

import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Drawer,
  Field,
  Icon,
  Select,
  TextArea,
  TextInput,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { AppLink } from "../../app/AppLink";
import {
  createRecord,
  createRevision,
  RecordsApiError,
  uploadRevisionFile,
} from "./api";
import { DISCIPLINES, RECORD_TYPE_OPTIONS } from "./format";
import { projectRecordsQueryKey } from "./useProjectRecords";
import type {
  CreatedRecord,
  CreatedRevision,
  CreateRecordInput,
  CreateRevisionInput,
} from "./types";
import type { RecordType } from "../../../domain/records/record";

type Mode = "upload" | "empty";
type Stage = "choice" | "form";
/** Which server stage failed; drives the recovery copy, link, and retry label. */
type FailedStage = "record" | "revision" | "upload";

interface FormValues {
  recordType: RecordType;
  discipline: string;
  title: string;
  description: string;
  revisionLabel: string;
  changeSummary: string;
}

interface FormErrors {
  title?: string;
  changeSummary?: string;
  file?: string;
}

interface Failure {
  stage: FailedStage;
  message: string;
  requestId: string;
  fileName: string;
}

/** Server stages already confirmed; retries resume from here. */
interface Progress {
  record: CreatedRecord | null;
  revision: CreatedRevision | null;
}

const INITIAL_VALUES: FormValues = {
  recordType: "document",
  discipline: "",
  title: "",
  description: "",
  revisionLabel: "",
  changeSummary: "Initial document",
};

const NO_PROGRESS: Progress = { record: null, revision: null };

export function recordDraftRevisionHref(
  projectId: string,
  recordId: string,
  revisionId: string,
): string {
  return `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}`;
}

export function AddDocumentDrawer({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("choice");
  const [mode, setMode] = useState<Mode>("upload");
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  const [failure, setFailure] = useState<Failure | null>(null);

  const reset = () => {
    setStage("choice");
    setMode("upload");
    setValues(INITIAL_VALUES);
    setErrors({});
    setSubmitting(false);
    setProgress(NO_PROGRESS);
    setFailure(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // A submission in flight must not be dismissed out from under the staged
    // server workflow; the user would lose the recovery context.
    if (!nextOpen && submitting) return;
    if (nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const closeAfterSuccess = () => {
    onOpenChange(false);
    reset();
  };

  const update = <Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "title" || key === "changeSummary") {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    setStage("form");
    // The Drawer is already open, so its initial-focus hook has run; move
    // focus to the first field of the newly revealed step.
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!values.title.trim()) next.title = "Document title is required.";
    if (!values.changeSummary.trim()) {
      next.changeSummary = "An initial change summary is required.";
    }
    const file = fileRef.current?.files?.[0];
    if (mode === "upload" && !file && !progress.revision) {
      next.file = "Choose a document file to upload.";
    }
    setErrors(next);
    if (next.title || next.changeSummary || next.file) {
      (next.title
        ? titleRef
        : next.changeSummary
          ? summaryRef
          : fileRef
      ).current?.focus();
      shell.announce("Please correct the highlighted fields.");
      return false;
    }
    return true;
  };

  const describeFailure = (
    error: unknown,
    stageThatFailed: FailedStage,
    fileName: string,
  ): Failure => ({
    stage: stageThatFailed,
    message:
      error instanceof RecordsApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The document could not be created.",
    requestId: error instanceof RecordsApiError ? error.requestId : "",
    fileName,
  });

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    const file = fileRef.current?.files?.[0] ?? null;
    const fileName = file?.name ?? failure?.fileName ?? "";
    setSubmitting(true);
    setFailure(null);
    shell.announce("Creating document.");

    // Each stage is attempted only if it has not already been confirmed, so an
    // ordinary retry never creates a second Record or Revision.
    let record = progress.record;
    if (!record) {
      const input: CreateRecordInput = {
        recordType: values.recordType,
        title: values.title.trim(),
        ...(values.discipline ? { discipline: values.discipline } : {}),
        ...(values.description.trim()
          ? { description: values.description.trim() }
          : {}),
      };
      try {
        record = await createRecord(projectId, input);
        setProgress((current) => ({ ...current, record }));
      } catch (error) {
        setSubmitting(false);
        setFailure(describeFailure(error, "record", fileName));
        shell.announce("The document could not be created.");
        return;
      }
    }

    let revision = progress.revision;
    if (!revision) {
      const input: CreateRevisionInput = {
        changeSummary: values.changeSummary.trim(),
        ...(values.revisionLabel.trim()
          ? { revisionLabel: values.revisionLabel.trim() }
          : {}),
      };
      try {
        revision = await createRevision(projectId, record.id, input);
        setProgress((current) => ({ ...current, revision }));
      } catch (error) {
        setSubmitting(false);
        setFailure(describeFailure(error, "revision", fileName));
        shell.announce(
          "The document was created but its draft revision was not.",
        );
        return;
      }
    }

    if (mode === "upload" && file) {
      try {
        await uploadRevisionFile(projectId, record.id, revision.id, file);
      } catch (error) {
        setSubmitting(false);
        setFailure(describeFailure(error, "upload", fileName));
        shell.announce(
          "The document and draft revision exist but the file was not uploaded.",
        );
        return;
      }
    }

    // Only now is anything shown in the register: refresh from confirmed server
    // data so returning with browser Back cannot omit the new document.
    await queryClient.invalidateQueries({
      queryKey: projectRecordsQueryKey(projectId),
    });
    shell.announce(
      record.recordNumber
        ? `Document ${record.recordNumber} created.`
        : "Document created.",
    );
    setSubmitting(false);
    closeAfterSuccess();
    shell.navigate(recordDraftRevisionHref(projectId, record.id, revision.id));
  };

  const submitLabel = () => {
    if (failure?.stage === "upload") return "Retry upload";
    if (failure?.stage === "revision") return "Retry draft revision";
    return mode === "upload" ? "Create document and upload" : "Create document";
  };

  let recovery: ReactNode;
  if (failure && progress.record) {
    const href =
      progress.revision !== null
        ? recordDraftRevisionHref(
            projectId,
            progress.record.id,
            progress.revision.id,
          )
        : `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(progress.record.id)}`;
    recovery = (
      <div className="add-document-recovery">
        <p>
          {progress.revision !== null
            ? "The document and its draft revision were created and are safe."
            : "The document identity was created and is safe."}
          {progress.record.recordNumber
            ? ` Document ${progress.record.recordNumber} exists.`
            : ""}
          {failure.stage === "upload" && failure.fileName
            ? ` The file “${failure.fileName}” was not attached.`
            : ""}
        </p>
        <AppLink
          href={href}
          data-recovery-link
          onClick={() => {
            closeAfterSuccess();
          }}
        >
          {progress.revision !== null
            ? "Open the draft revision and retry the upload"
            : "Open the document"}
        </AppLink>
      </div>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      side="right"
      size="detail"
      title="Add document"
      closeLabel="Close add document"
      className="add-document-drawer"
      initialFocusRef={stage === "choice" ? firstChoiceRef : titleRef}
    >
      {stage === "choice" ? (
        <div className="add-document-choices">
          <p className="add-document-intro">
            Start with the original document, or reserve an empty document
            identity to upload later.
          </p>
          <button
            type="button"
            ref={firstChoiceRef}
            className="add-document-choice"
            data-mode="upload"
            onClick={() => {
              chooseMode("upload");
            }}
          >
            <Icon name="upload" size={18} />
            <span>
              <strong>Upload a document</strong>
              <span>
                Create the document identity, its original draft revision, and
                attach the file in one flow.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="add-document-choice"
            data-mode="empty"
            onClick={() => {
              chooseMode("empty");
            }}
          >
            <Icon name="file-text" size={18} />
            <span>
              <strong>Reserve a document identity</strong>
              <span>
                Reserve the identity now and begin an empty original draft for a
                later upload.
              </span>
            </span>
          </button>
        </div>
      ) : (
        <form
          className="add-document-form"
          noValidate
          aria-busy={submitting || undefined}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="add-document-form__body">
            <button
              type="button"
              className="add-document-back"
              data-back
              disabled={submitting || progress.record !== null}
              onClick={() => {
                setStage("choice");
                window.requestAnimationFrame(() =>
                  firstChoiceRef.current?.focus(),
                );
              }}
            >
              <Icon name="arrow-left" size={14} />
              Choose another option
            </button>

            <p className="add-document-intro">
              {mode === "upload"
                ? "Add the document details and its original file. An original draft revision is created automatically."
                : "Reserve the identity now. An empty original draft revision will be ready for upload."}
            </p>

            <fieldset className="add-document-fields" disabled={submitting}>
              <legend className="base-sr-only">Document details</legend>
              <div className="add-document-grid add-document-grid--paired">
                <Field label="Document type">
                  <Select
                    value={values.recordType}
                    onChange={(event) => {
                      update("recordType", event.target.value as RecordType);
                    }}
                  >
                    {RECORD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Discipline">
                  <Select
                    value={values.discipline}
                    onChange={(event) => {
                      update("discipline", event.target.value);
                    }}
                  >
                    <option value="">Select discipline</option>
                    {DISCIPLINES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Title" required error={errors.title}>
                <TextInput
                  ref={titleRef}
                  value={values.title}
                  autoComplete="off"
                  onChange={(event) => {
                    update("title", event.target.value);
                  }}
                />
              </Field>

              <Field label="Description">
                <TextArea
                  rows={2}
                  value={values.description}
                  onChange={(event) => {
                    update("description", event.target.value);
                  }}
                />
              </Field>

              <Field
                label="Revision label"
                help="Optional. The revision number is always assigned by the server."
              >
                <TextInput
                  value={values.revisionLabel}
                  autoComplete="off"
                  onChange={(event) => {
                    update("revisionLabel", event.target.value);
                  }}
                />
              </Field>

              <Field
                label="Original change summary"
                required
                error={errors.changeSummary}
              >
                <TextArea
                  ref={summaryRef}
                  rows={2}
                  value={values.changeSummary}
                  onChange={(event) => {
                    update("changeSummary", event.target.value);
                  }}
                />
              </Field>

              {mode === "upload" ? (
                <Field label="Original file" required error={errors.file}>
                  <input
                    ref={fileRef}
                    type="file"
                    className="base-input add-document-file"
                    data-document-file
                    onChange={() => {
                      setErrors((current) => ({ ...current, file: undefined }));
                    }}
                  />
                </Field>
              ) : null}
            </fieldset>

            {failure ? (
              <div className="add-document-error" role="alert">
                <Icon name="circle-alert" size={16} />
                <div>
                  <p>{failure.message}</p>
                  {failure.requestId ? (
                    <p className="add-document-request-id">
                      Request ID <code>{failure.requestId}</code>
                    </p>
                  ) : null}
                  {recovery}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="add-document-form__footer">
            <Button
              variant="secondary"
              type="button"
              disabled={submitting}
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              data-submit-document
            >
              {submitLabel()}
            </Button>
          </footer>
        </form>
      )}
    </Drawer>
  );
}
