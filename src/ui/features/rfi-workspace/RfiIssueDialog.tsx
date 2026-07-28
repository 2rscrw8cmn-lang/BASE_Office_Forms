/*
 * Official RFI issue (Slice 2B).
 *
 * Two deliberate stages — set the routing, then confirm what will become
 * permanent — inside the shared `FormDialog`, so focus trapping, Escape, the
 * mobile sheet, buttons, fields, and the error summary all stay owned by the
 * component library.
 *
 * The invariants this component exists to protect:
 *
 *  - one deliberate attempt carries exactly one idempotency key, reused across
 *    every retry of the same canonical payload (see `issueAttempt.ts`);
 *  - a failed request is never treated as proof that nothing committed: every
 *    failure first re-reads the authoritative workspace, and a present
 *    `officialIssue` means the issue succeeded;
 *  - the official number, status, and evidence are only ever read back from the
 *    server -- never predicted, never optimistically patched;
 *  - `record_only` is stated plainly rather than implied by disabled controls
 *    for delivery features that do not exist.
 */

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  DateInput,
  Field,
  FormDialog,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { issueRfi, RfiWorkspaceApiError } from "./api";
import { invalidateRfiLifecycleCaches } from "./cache";
import { formatBytes, rfiAttachmentRoleLabel } from "./format";
import {
  attemptLocksPayload,
  canonicalIssuePayload,
  classifyIssueFailure,
  discardUnusedAttempt,
  resolveAttemptKey,
  type IssueAttempt,
} from "./issueAttempt";
import { refetchRfiWorkspace } from "./useRfiWorkspace";
import type {
  RfiIssueRequestInput,
  RfiWorkspaceAttachment,
  RfiWorkspaceModel,
} from "./types";

const ROLE_ORDER: RfiWorkspaceAttachment["role"][] = [
  "supporting_attachment",
  "reference_drawing",
];

const ROLE_GROUP_TITLES: Record<RfiWorkspaceAttachment["role"], string> = {
  supporting_attachment: "Supporting attachments",
  reference_drawing: "Reference drawings",
};

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Keeps a selection in the eligible list's order, so a retry payload is byte-identical. */
function toggleIn(selected: string[], id: string, order: string[]): string[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return order.filter((candidate) => next.has(candidate));
}

function contactLabel(contact: {
  name: string;
  companyName: string | null;
}): string {
  return contact.companyName
    ? `${contact.name} — ${contact.companyName}`
    : contact.name;
}

export function RfiIssueDialog({
  projectId,
  data,
  open,
  onDismiss,
  onIssued,
}: {
  projectId: string;
  data: RfiWorkspaceModel;
  open: boolean;
  /** Ordinary dismissal; the caller restores focus to the Issue RFI trigger. */
  onDismiss: () => void;
  /** Confirmed success, after the workspace and registers were reloaded. */
  onIssued: (officialDisplayNumber: string) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const firstRecipientRef = useRef<HTMLButtonElement>(null);

  const contacts = data.responsibleContacts;
  const contactOrder = useMemo(
    () => contacts.map((contact) => contact.id),
    [contacts],
  );

  // Only the current authoritative draft revision's attachments may be included;
  // the server rejects anything else, so the browser never offers it.
  const eligibleFiles = useMemo(
    () =>
      ROLE_ORDER.flatMap((role) =>
        data.attachments[role].filter(
          (file) => file.revisionId === data.currentVersion.id,
        ),
      ),
    [data.attachments, data.currentVersion.id],
  );
  const fileOrder = useMemo(
    () => eligibleFiles.map((file) => file.id),
    [eligibleFiles],
  );

  const [stage, setStage] = useState<"details" | "review">("details");
  const [to, setTo] = useState<string[]>(() =>
    contactOrder.filter((id) => id === data.rfi.responsiblePartyId),
  );
  const [cc, setCc] = useState<string[]>([]);
  const [responseDueDate, setResponseDueDate] = useState(
    data.rfi.requestedResponseDate ?? "",
  );
  const [includedFileIds, setIncludedFileIds] = useState<string[]>(
    () => fileOrder,
  );
  const [errors, setErrors] = useState<{ to?: string; due?: string }>({});
  const [attempt, setAttempt] = useState<IssueAttempt | null>(null);

  const payload: RfiIssueRequestInput = {
    recipientProjectContactIds: to,
    ccProjectContactIds: cc,
    responseDueDate,
    includedFileIds,
    deliveryMode: "record_only",
  };
  const canonical = canonicalIssuePayload(payload);

  const locked = attemptLocksPayload(attempt);
  const pending = attempt?.status === "pending";
  const reconcile = attempt?.status === "reconcile";

  /** Any payload edit spends an unused key rather than risking a mismatched replay. */
  const edit = (change: () => void) => {
    if (locked) return;
    change();
    setAttempt((current) => discardUnusedAttempt(current));
  };

  const validateDetails = (): boolean => {
    const next: { to?: string; due?: string } = {};
    if (to.length === 0) {
      next.to = "Select at least one recipient.";
    }
    if (!isCalendarDate(responseDueDate)) {
      next.due = "Enter a response due date as YYYY-MM-DD.";
    }
    setErrors(next);
    if (next.to || next.due) {
      shell.announce("Please correct the highlighted fields.");
      return false;
    }
    return true;
  };

  const submitIssue = async () => {
    const key = resolveAttemptKey(attempt, canonical);
    setAttempt({
      status: "pending",
      key,
      payload: canonical,
      requestId: "",
      message: "",
      code: "",
    });
    try {
      const { result } = await issueRfi(projectId, data.rfi.id, key, payload);
      await invalidateRfiLifecycleCaches(queryClient, projectId, data.rfi.id);
      setAttempt(null);
      onIssued(result.officialDisplayNumber);
      return;
    } catch (error) {
      /*
       * A failure is never taken at face value. The server is asked what it now
       * holds for this RFI first: an `officialIssue` means the attempt did
       * commit, whatever the response said, and telling the operator to try
       * again would risk a duplicate.
       */
      const refreshed = await refetchRfiWorkspace(
        queryClient,
        projectId,
        data.rfi.id,
      );
      if (refreshed?.officialIssue) {
        await invalidateRfiLifecycleCaches(queryClient, projectId, data.rfi.id);
        setAttempt(null);
        onIssued(refreshed.officialIssue.officialDisplayNumber);
        return;
      }
      const apiError =
        error instanceof RfiWorkspaceApiError
          ? error
          : new RfiWorkspaceApiError({});
      setAttempt({
        status: classifyIssueFailure(error),
        key,
        payload: canonical,
        requestId: apiError.requestId,
        message: apiError.message,
        code: apiError.code,
      });
      shell.announce("The RFI was not confirmed as issued.");
    }
  };

  const selectedFiles = eligibleFiles.filter((file) =>
    includedFileIds.includes(file.id),
  );
  const selectedTo = contacts.filter((contact) => to.includes(contact.id));
  const selectedCc = contacts.filter((contact) => cc.includes(contact.id));

  const failureSummary =
    attempt && attempt.status !== "pending" ? (
      <div className="rfi-issue-failure">
        <p>
          {attempt.status === "reconcile"
            ? "This issue attempt could not be confirmed and needs support reconciliation. Do not try to issue this RFI again — the official record may already exist."
            : attempt.status === "uncertain"
              ? "The result of this issue attempt is unknown. The RFI was reloaded from the server and still shows no official issue. Check again before doing anything else; the same attempt is preserved."
              : attempt.message}
        </p>
        {attempt.status === "retryable" ? (
          <p>
            Nothing was issued. Retrying sends the same request as the same
            attempt, so it cannot create a second official RFI.
          </p>
        ) : null}
        {attempt.requestId ? (
          <p className="rfi-workspace-request-id">
            Request ID <code>{attempt.requestId}</code>
          </p>
        ) : null}
      </div>
    ) : null;

  const submitLabel =
    stage === "details"
      ? "Continue to review"
      : attempt?.status === "retryable"
        ? "Retry issue"
        : attempt?.status === "uncertain"
          ? "Check issue status"
          : "Issue official RFI";

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        // Dismissal is refused only while a request is genuinely in flight;
        // closing then would leave the operator with no idea what happened.
        if (next || pending) return;
        onDismiss();
      }}
      className="rfi-issue-dialog"
      title="Issue this RFI officially"
      description={
        stage === "details"
          ? "Choose who this RFI is issued to, confirm the response due date, and choose which files are included."
          : "Review the official issue. The server assigns the RFI number, and the issued version and its PDF become immutable."
      }
      initialFocusRef={contacts.length > 0 ? firstRecipientRef : undefined}
      loading={pending}
      fieldsDisabled={locked}
      hideSubmit={reconcile}
      submitLabel={submitLabel}
      cancelLabel={reconcile ? "Close" : "Cancel"}
      secondaryAction={
        stage === "review" && !reconcile ? (
          <Button
            variant="ghost"
            iconStart="arrow-left"
            disabled={locked}
            data-issue-back
            onClick={() => {
              setStage("details");
            }}
          >
            Back
          </Button>
        ) : null
      }
      errorSummary={failureSummary}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (stage === "details") {
          if (!validateDetails()) return;
          setStage("review");
          return;
        }
        if (attempt?.status === "uncertain") {
          // Checking is a read, never a second POST and never a second key.
          void (async () => {
            const refreshed = await refetchRfiWorkspace(
              queryClient,
              projectId,
              data.rfi.id,
            );
            if (refreshed?.officialIssue) {
              await invalidateRfiLifecycleCaches(
                queryClient,
                projectId,
                data.rfi.id,
              );
              setAttempt(null);
              onIssued(refreshed.officialIssue.officialDisplayNumber);
              return;
            }
            shell.announce("This RFI still shows no official issue.");
          })();
          return;
        }
        void submitIssue();
      }}
    >
      {stage === "details" ? (
        <>
          <fieldset className="rfi-issue-group" data-issue-recipients>
            <legend className="rfi-issue-group__legend">To</legend>
            <p className="rfi-issue-group__help">
              At least one project contact. The responsible contact is selected
              by default.
            </p>
            {contacts.length === 0 ? (
              <p className="rfi-workspace-empty-value">
                This project has no active contacts to issue to.
              </p>
            ) : (
              <ul className="rfi-issue-options">
                {contacts.map((contact, index) => (
                  <li key={contact.id}>
                    <Checkbox
                      ref={index === 0 ? firstRecipientRef : undefined}
                      checked={to.includes(contact.id)}
                      disabled={locked}
                      value={contact.id}
                      onCheckedChange={() => {
                        edit(() => {
                          setTo((current) =>
                            toggleIn(current, contact.id, contactOrder),
                          );
                          // A contact can never be both To and CC.
                          setCc((current) =>
                            current.filter((id) => id !== contact.id),
                          );
                          setErrors((current) => ({
                            ...current,
                            to: undefined,
                          }));
                        });
                      }}
                    >
                      {contactLabel(contact)}
                    </Checkbox>
                  </li>
                ))}
              </ul>
            )}
            {errors.to ? (
              <p className="base-field__error" role="alert">
                {errors.to}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="rfi-issue-group" data-issue-cc>
            <legend className="rfi-issue-group__legend">CC (optional)</legend>
            <p className="rfi-issue-group__help">
              Contacts already selected under To cannot also be copied.
            </p>
            <ul className="rfi-issue-options">
              {contacts.map((contact) => {
                const alreadyTo = to.includes(contact.id);
                return (
                  <li key={contact.id}>
                    <Checkbox
                      checked={cc.includes(contact.id)}
                      disabled={locked || alreadyTo}
                      value={contact.id}
                      onCheckedChange={() => {
                        edit(() => {
                          setCc((current) =>
                            toggleIn(current, contact.id, contactOrder),
                          );
                        });
                      }}
                    >
                      {contactLabel(contact)}
                      {alreadyTo ? (
                        <span className="rfi-issue-option__note">
                          {" "}
                          Already a recipient
                        </span>
                      ) : null}
                    </Checkbox>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <Field
            label="Response due"
            required
            error={errors.due}
            help="Confirm or adjust the date this RFI is officially due back."
          >
            <DateInput
              value={responseDueDate}
              disabled={locked}
              data-issue-due
              onChange={(event) => {
                const next = event.target.value;
                edit(() => {
                  setResponseDueDate(next);
                  setErrors((current) => ({ ...current, due: undefined }));
                });
              }}
            />
          </Field>

          <fieldset className="rfi-issue-group" data-issue-files>
            <legend className="rfi-issue-group__legend">Included files</legend>
            <p className="rfi-issue-group__help">
              The official RFI PDF is generated by the server and is not one of
              these files.
            </p>
            {eligibleFiles.length === 0 ? (
              <p className="rfi-workspace-empty-value">
                No files are attached to this RFI.
              </p>
            ) : (
              ROLE_ORDER.map((role) => {
                const group = eligibleFiles.filter(
                  (file) => file.role === role,
                );
                if (group.length === 0) return null;
                return (
                  <div key={role} className="rfi-issue-file-group">
                    <p className="rfi-issue-file-group__title">
                      {ROLE_GROUP_TITLES[role]}
                    </p>
                    <ul className="rfi-issue-options">
                      {group.map((file) => (
                        <li key={file.id}>
                          <Checkbox
                            checked={includedFileIds.includes(file.id)}
                            disabled={locked}
                            value={file.id}
                            onCheckedChange={() => {
                              edit(() => {
                                setIncludedFileIds((current) =>
                                  toggleIn(current, file.id, fileOrder),
                                );
                              });
                            }}
                          >
                            {file.originalFilename}
                            <span className="rfi-issue-option__note">
                              {" "}
                              {rfiAttachmentRoleLabel(file.role)} ·{" "}
                              {formatBytes(file.byteSize)} ·{" "}
                              {file.revisionLabel}
                            </span>
                          </Checkbox>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </fieldset>

          <div className="rfi-issue-delivery" data-issue-delivery>
            <p className="rfi-issue-delivery__mode">
              <Badge tone="neutral">Record only</Badge>
            </p>
            <p>
              This creates and records the official RFI and PDF. It does not
              send an email or external notification.
            </p>
          </div>
        </>
      ) : (
        <dl className="rfi-issue-review" data-issue-review>
          <div className="rfi-issue-review__row">
            <dt>Subject</dt>
            <dd>{data.rfi.subject}</dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>Template</dt>
            <dd>
              {data.template
                ? `${data.template.name} (version ${String(data.template.versionNumber)})`
                : "The organization's published RFI template"}
            </dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>Assigned to</dt>
            <dd>{data.rfi.responsibleParty ?? "Unassigned"}</dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>To</dt>
            <dd>
              {selectedTo.length > 0
                ? selectedTo.map(contactLabel).join("; ")
                : "None"}
            </dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>CC</dt>
            <dd>
              {selectedCc.length > 0
                ? selectedCc.map(contactLabel).join("; ")
                : "None"}
            </dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>Response due</dt>
            <dd>{responseDueDate}</dd>
          </div>
          <div className="rfi-issue-review__row is-wide">
            <dt>Included files</dt>
            <dd>
              {selectedFiles.length > 0 ? (
                <ul className="rfi-issue-review__files">
                  {selectedFiles.map((file) => (
                    <li key={file.id}>
                      {file.originalFilename} —{" "}
                      {rfiAttachmentRoleLabel(file.role)}
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )}
            </dd>
          </div>
          <div className="rfi-issue-review__row">
            <dt>Delivery</dt>
            <dd>Record only — no email or external notification is sent.</dd>
          </div>
          <div className="rfi-issue-review__row is-wide">
            <dt>Before you issue</dt>
            <dd>
              The server assigns the official RFI number. The issued version and
              its generated PDF become immutable evidence and cannot be edited
              or withdrawn here.
            </dd>
          </div>
        </dl>
      )}

      {pending ? (
        <p className="rfi-issue-pending" role="status" data-issue-pending>
          Issuing RFI…
        </p>
      ) : null}
    </FormDialog>
  );
}
