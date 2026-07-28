/*
 * The RFI's authoritative structured content.
 *
 * A draft the server says this user may edit (`capabilities.updateDraft`)
 * renders the one editing surface for every currently mutable field. Anything
 * else renders the same fields read-only -- once an RFI is issued its question
 * is fixed and the response becomes the only editable surface (RfiResponsePanel).
 *
 * Status is never an editable field here: lifecycle changes go through the
 * explicit transition actions in the identity header. The RFI number and issued
 * date are never typed by hand.
 *
 * Concurrency is the server's: every save carries `lockVersion`, and a
 * `409 RFI_VERSION_CONFLICT` reloads the latest authorized values and asks the
 * author to review and retry rather than silently overwriting someone else.
 */

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DateInput,
  Field,
  Icon,
  SaveIndicator,
  Select,
  TextArea,
  TextInput,
  type SaveState,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { RfiWorkspaceApiError, updateRfi } from "./api";
import { rfiWorkspaceQueryKey } from "./useRfiWorkspace";
import type { RfiWorkspaceModel } from "./types";

interface Values {
  subject: string;
  question: string;
  contractorSuggestion: string;
  drawingReferences: string;
  specificationReferences: string;
  responsiblePartyId: string;
  requestedResponseDate: string;
}

function valuesFrom(data: RfiWorkspaceModel): Values {
  const { rfi } = data;
  return {
    subject: rfi.subject,
    question: rfi.question,
    contractorSuggestion: rfi.contractorSuggestion ?? "",
    drawingReferences: rfi.drawingReferences ?? "",
    specificationReferences: rfi.specificationReferences ?? "",
    responsiblePartyId: rfi.responsiblePartyId ?? "",
    requestedResponseDate: rfi.requestedResponseDate ?? "",
  };
}

function ReadOnlyField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "rfi-workspace-fact is-wide" : "rfi-workspace-fact"}>
      <dt>{label}</dt>
      <dd>
        {value && value.trim() ? (
          value
        ) : (
          <span className="rfi-workspace-empty-value">Not provided</span>
        )}
      </dd>
    </div>
  );
}

export function RfiContentPanel({
  projectId,
  data,
}: {
  projectId: string;
  data: RfiWorkspaceModel;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const subjectRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const [values, setValues] = useState<Values>(() => valuesFrom(data));
  const [seededVersion, setSeededVersion] = useState(data.rfi.lockVersion);
  const [errors, setErrors] = useState<{
    subject?: string;
    question?: string;
  }>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
  } | null>(null);

  const editable = data.capabilities.updateDraft;
  const lockVersion = data.rfi.lockVersion;

  /*
   * Re-seed the form when the server's authoritative version changes -- after a
   * conflict reload, or when another surface (the register Drawer) saved the
   * same RFI. React's documented "adjust state during render when a prop
   * changes" pattern, keyed on lockVersion only, so ordinary typing between
   * versions is never overwritten.
   */
  if (seededVersion !== lockVersion) {
    setSeededVersion(lockVersion);
    setValues(valuesFrom(data));
  }

  if (!editable) {
    return (
      <dl className="rfi-workspace-facts">
        <ReadOnlyField label="Question" value={data.rfi.question} wide />
        <ReadOnlyField
          label="Contractor suggestion"
          value={data.rfi.contractorSuggestion}
          wide
        />
        <ReadOnlyField
          label="Drawing references"
          value={data.rfi.drawingReferences}
        />
        <ReadOnlyField
          label="Specification references"
          value={data.rfi.specificationReferences}
        />
      </dl>
    );
  }

  const update = <Key extends keyof Values>(key: Key, value: Values[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "subject" || key === "question") {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
    setSaveState("idle");
  };

  return (
    <form
      className="rfi-workspace-form"
      noValidate
      aria-busy={saveState === "saving" || undefined}
      data-rfi-content-form
      onSubmit={(event) => {
        event.preventDefault();
        if (saveState === "saving") return;
        const subject = values.subject.trim();
        const question = values.question.trim();
        const next: { subject?: string; question?: string } = {};
        if (!subject) next.subject = "A subject is required.";
        if (!question) next.question = "A question is required.";
        if (next.subject || next.question) {
          setErrors(next);
          (next.subject ? subjectRef : questionRef).current?.focus();
          shell.announce("Please correct the highlighted fields.");
          return;
        }
        setErrors({});
        setFailure(null);
        setSaveState("saving");
        void (async () => {
          try {
            await updateRfi(projectId, data.rfi.id, {
              subject,
              question,
              contractorSuggestion: values.contractorSuggestion.trim() || null,
              drawingReferences: values.drawingReferences.trim() || null,
              specificationReferences:
                values.specificationReferences.trim() || null,
              responsiblePartyId: values.responsiblePartyId || null,
              requestedResponseDate: values.requestedResponseDate || null,
              lockVersion,
            });
            await queryClient.invalidateQueries({
              queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
            });
            setSaveState("saved");
            shell.announce("RFI draft saved.");
          } catch (error) {
            const status =
              error instanceof RfiWorkspaceApiError ? error.status : 0;
            if (status === 409) {
              // The server wins. Reload the authoritative values (the effect
              // above re-seeds the form) and ask for a deliberate retry.
              await queryClient.invalidateQueries({
                queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
              });
              setSaveState("conflict");
              shell.announce(
                "This RFI changed elsewhere. The latest values were loaded; review and retry.",
              );
              return;
            }
            setSaveState("failed");
            setFailure({
              message:
                status === 403
                  ? "You no longer have permission to edit this draft."
                  : error instanceof RfiWorkspaceApiError
                    ? error.message
                    : "The draft could not be saved.",
              requestId:
                error instanceof RfiWorkspaceApiError ? error.requestId : "",
            });
            shell.announce("The draft could not be saved.");
          }
        })();
      }}
    >
      <fieldset
        className="rfi-workspace-fieldset"
        disabled={saveState === "saving"}
      >
        <legend className="base-sr-only">RFI content</legend>

        <Field label="Subject" required error={errors.subject}>
          <TextInput
            ref={subjectRef}
            value={values.subject}
            autoComplete="off"
            data-rfi-field="subject"
            onChange={(event) => {
              update("subject", event.target.value);
            }}
          />
        </Field>

        <Field label="Question" required error={errors.question}>
          <TextArea
            ref={questionRef}
            rows={5}
            value={values.question}
            data-rfi-field="question"
            onChange={(event) => {
              update("question", event.target.value);
            }}
          />
        </Field>

        <Field label="Contractor suggestion">
          <TextArea
            rows={3}
            value={values.contractorSuggestion}
            data-rfi-field="contractorSuggestion"
            onChange={(event) => {
              update("contractorSuggestion", event.target.value);
            }}
          />
        </Field>

        <div className="rfi-workspace-field-row">
          <Field label="Drawing references">
            <TextInput
              value={values.drawingReferences}
              autoComplete="off"
              data-rfi-field="drawingReferences"
              onChange={(event) => {
                update("drawingReferences", event.target.value);
              }}
            />
          </Field>
          <Field label="Specification references">
            <TextInput
              value={values.specificationReferences}
              autoComplete="off"
              data-rfi-field="specificationReferences"
              onChange={(event) => {
                update("specificationReferences", event.target.value);
              }}
            />
          </Field>
        </div>

        <div className="rfi-workspace-field-row">
          <Field
            label="Assigned to"
            help={
              data.rfi.responsiblePartyLegacyText
                ? `Legacy value “${data.rfi.responsiblePartyLegacyText}” stays preserved until a project contact is selected.`
                : undefined
            }
          >
            <Select
              value={values.responsiblePartyId}
              data-rfi-field="responsiblePartyId"
              onChange={(event) => {
                update("responsiblePartyId", event.target.value);
              }}
            >
              <option value="">Unassigned</option>
              {data.responsibleContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                  {contact.companyName ? ` — ${contact.companyName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Response due">
            <DateInput
              value={values.requestedResponseDate}
              data-rfi-field="requestedResponseDate"
              onChange={(event) => {
                update("requestedResponseDate", event.target.value);
              }}
            />
          </Field>
        </div>
      </fieldset>

      <div className="rfi-workspace-form__actions">
        <Button
          type="submit"
          variant="primary"
          loading={saveState === "saving"}
          data-save-draft
        >
          Save draft
        </Button>
        <SaveIndicator state={saveState} />
      </div>

      {failure ? (
        <div className="rfi-workspace-error" role="alert">
          <Icon name="circle-alert" size={16} />
          <div>
            <p>{failure.message}</p>
            <p>No changes were saved.</p>
            {failure.requestId ? (
              <p className="rfi-workspace-request-id">
                Request ID <code>{failure.requestId}</code>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
