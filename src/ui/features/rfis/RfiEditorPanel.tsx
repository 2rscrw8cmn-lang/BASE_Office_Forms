/*
 * Drawer content for an editable RFI draft. Controls keep local, uncommitted
 * values; text/date/textarea fields commit on blur, the assignee commits on
 * selection, and unchanged values are discarded by the parent. The surrounding
 * shared Drawer owns modal behavior, Escape dismissal, and focus containment.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Badge,
  Button,
  Collapsible,
  DateInput,
  Field,
  Icon,
  Select,
  TextArea,
  TextInput,
  SaveIndicator,
  type SaveState,
} from "../../components";
import { EDITABLE_FIELDS, PANEL_ORDER } from "./editableFields";
import type {
  ResponsibleContactOption,
  RfiEditableField,
  RfiListItem,
} from "./types";

export interface FieldState {
  status: "saving" | "saved" | "failed" | "conflict";
  message: string;
}

function initialValues(rfi: RfiListItem): Record<RfiEditableField, string> {
  return {
    subject: rfi.subject,
    responsiblePartyId: rfi.responsiblePartyId ?? "",
    requestedResponseDate: rfi.requestedResponseDate ?? "",
    question: rfi.question,
    contractorSuggestion: rfi.contractorSuggestion ?? "",
    drawingReferences: rfi.drawingReferences ?? "",
    specificationReferences: rfi.specificationReferences ?? "",
  };
}

export interface RfiEditorPanelProps {
  rfi: RfiListItem;
  contacts: ResponsibleContactOption[];
  fieldStates: Partial<Record<RfiEditableField, FieldState>>;
  /** Bumped by the parent only when a conflict reload replaces this row's
   * data, so the panel re-derives its displayed values from the server
   * without losing focus or remounting. */
  resetSignal: number;
  onCommit: (field: RfiEditableField, rawValue: string) => void;
  onClose: () => void;
}

export function RfiEditorPanel({
  rfi,
  contacts,
  fieldStates,
  resetSignal,
  onCommit,
  onClose,
}: RfiEditorPanelProps) {
  const [values, setValues] = useState<Record<RfiEditableField, string>>(() =>
    initialValues(rfi),
  );
  const lastResetSignal = useRef(resetSignal);
  if (lastResetSignal.current !== resetSignal) {
    lastResetSignal.current = resetSignal;
    setValues(initialValues(rfi));
  }

  const subjectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // This panel instance is only ever mounted while its editor is open (the
    // parent conditionally renders it), and a conflict reload resets displayed
    // values through `resetSignal` above rather than remounting -- so a mount
    // here always means "the editor just opened," and focusing Subject then is
    // exactly right.
    subjectRef.current?.focus();
  }, []);

  function setValue(field: RfiEditableField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function commit(field: RfiEditableField) {
    onCommit(field, values[field]);
  }

  function handleKeyDown(
    event: KeyboardEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
    isTextarea: boolean,
  ) {
    if (event.key === "Enter" && !isTextarea && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function saveStateFor(field: RfiEditableField): SaveState {
    const state = fieldStates[field];
    if (!state) return "idle";
    if (state.status === "saving" || state.status === "saved")
      return state.status;
    return "idle";
  }

  const saveStates = PANEL_ORDER.map((field) => fieldStates[field]?.status);
  const aggregateSaveState: SaveState = saveStates.includes("conflict")
    ? "conflict"
    : saveStates.includes("failed")
      ? "failed"
      : saveStates.includes("saving")
        ? "saving"
        : saveStates.includes("saved")
          ? "saved"
          : "idle";

  function failureFor(field: RfiEditableField): FieldState | undefined {
    const state = fieldStates[field];
    return state?.status === "failed" || state?.status === "conflict"
      ? state
      : undefined;
  }

  function fieldState(field: RfiEditableField) {
    const failure = failureFor(field);
    return (
      <span
        className="rfi-register-field-state"
        data-field-state={`${rfi.id}:${field}`}
      >
        {failure ? null : <SaveIndicator state={saveStateFor(field)} />}
      </span>
    );
  }

  return (
    <form
      className="rfi-register-editor"
      aria-label={`Edit ${rfi.subject || "this RFI"}`}
      id={`rfi-editor-${rfi.id}`}
      data-editor-drawer={rfi.id}
      onSubmit={(event) => {
        event.preventDefault();
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === "Escape" &&
          event.target instanceof HTMLElement &&
          event.target.matches("input, textarea, select")
        ) {
          event.target.blur();
        }
      }}
    >
      <div className="rfi-register-editor__summary">
        <Badge tone="neutral">Draft</Badge>
        <span aria-hidden="true">·</span>
        {aggregateSaveState === "idle" ? (
          <span className="rfi-register-editor__autosaved">
            <Icon name="check-circle" size={14} />
            Autosaved just now
          </span>
        ) : (
          <SaveIndicator state={aggregateSaveState} />
        )}
      </div>

      <div className="rfi-register-editor__body">
        <Field
          label={EDITABLE_FIELDS.subject.label}
          controlId={`rfi-edit-${rfi.id}-subject`}
          required
          error={failureFor("subject")?.message}
        >
          <TextInput
            ref={subjectRef}
            data-field-input
            data-id={rfi.id}
            data-field="subject"
            placeholder="Brief description of the issue"
            value={values.subject}
            onChange={(event) => {
              setValue("subject", event.target.value);
            }}
            onBlur={() => {
              commit("subject");
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, false);
            }}
          />
          {fieldState("subject")}
        </Field>

        <div className="rfi-register-editor__paired">
          <Field
            label={EDITABLE_FIELDS.responsiblePartyId.label}
            controlId={`rfi-edit-${rfi.id}-responsiblePartyId`}
            error={failureFor("responsiblePartyId")?.message}
          >
            <Select
              data-field-input
              data-id={rfi.id}
              data-field="responsiblePartyId"
              value={values.responsiblePartyId}
              onChange={(event) => {
                setValue("responsiblePartyId", event.target.value);
                onCommit("responsiblePartyId", event.target.value);
              }}
              onKeyDown={(event) => {
                handleKeyDown(event, false);
              }}
            >
              <option value="">Select assignee</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                  {contact.companyName ? ` — ${contact.companyName}` : ""}
                </option>
              ))}
            </Select>
            {rfi.responsiblePartyLegacyText ? (
              <p className="rfi-register-legacy-note">
                Legacy value “{rfi.responsiblePartyLegacyText}” remains until a
                contact is selected.
              </p>
            ) : null}
            {fieldState("responsiblePartyId")}
          </Field>

          <Field
            label={EDITABLE_FIELDS.requestedResponseDate.label}
            controlId={`rfi-edit-${rfi.id}-requestedResponseDate`}
            error={failureFor("requestedResponseDate")?.message}
          >
            <DateInput
              data-field-input
              data-id={rfi.id}
              data-field="requestedResponseDate"
              value={values.requestedResponseDate}
              onChange={(event) => {
                setValue("requestedResponseDate", event.target.value);
              }}
              onBlur={() => {
                commit("requestedResponseDate");
              }}
              onKeyDown={(event) => {
                handleKeyDown(event, false);
              }}
            />
            {fieldState("requestedResponseDate")}
          </Field>
        </div>

        <Field
          label={EDITABLE_FIELDS.question.label}
          controlId={`rfi-edit-${rfi.id}-question`}
          required
          error={failureFor("question")?.message}
        >
          <TextArea
            data-field-input
            data-id={rfi.id}
            data-field="question"
            rows={5}
            placeholder="Clearly describe the issue, location, and decision needed."
            value={values.question}
            onChange={(event) => {
              setValue("question", event.target.value);
            }}
            onBlur={() => {
              commit("question");
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, true);
            }}
          />
          {fieldState("question")}
        </Field>

        <Field
          label={
            <>
              {EDITABLE_FIELDS.contractorSuggestion.label}
              <span className="rfi-register-editor__optional">Optional</span>
            </>
          }
          controlId={`rfi-edit-${rfi.id}-contractorSuggestion`}
          error={failureFor("contractorSuggestion")?.message}
        >
          <TextArea
            data-field-input
            data-id={rfi.id}
            data-field="contractorSuggestion"
            rows={4}
            placeholder="Describe the proposed resolution."
            value={values.contractorSuggestion}
            onChange={(event) => {
              setValue("contractorSuggestion", event.target.value);
            }}
            onBlur={() => {
              commit("contractorSuggestion");
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, true);
            }}
          />
          {fieldState("contractorSuggestion")}
        </Field>

        <Collapsible
          title="Additional information"
          meta="References and other details"
          className="rfi-register-editor__additional"
        >
          <div className="rfi-register-editor__paired">
            <Field
              label={EDITABLE_FIELDS.drawingReferences.label}
              controlId={`rfi-edit-${rfi.id}-drawingReferences`}
              error={failureFor("drawingReferences")?.message}
            >
              <TextInput
                data-field-input
                data-id={rfi.id}
                data-field="drawingReferences"
                placeholder="e.g., A5.2, Detail 3"
                value={values.drawingReferences}
                onChange={(event) => {
                  setValue("drawingReferences", event.target.value);
                }}
                onBlur={() => {
                  commit("drawingReferences");
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, false);
                }}
              />
              {fieldState("drawingReferences")}
            </Field>

            <Field
              label={EDITABLE_FIELDS.specificationReferences.label}
              controlId={`rfi-edit-${rfi.id}-specificationReferences`}
              error={failureFor("specificationReferences")?.message}
            >
              <TextInput
                data-field-input
                data-id={rfi.id}
                data-field="specificationReferences"
                placeholder="e.g., 08 71 00"
                value={values.specificationReferences}
                onChange={(event) => {
                  setValue("specificationReferences", event.target.value);
                }}
                onBlur={() => {
                  commit("specificationReferences");
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, false);
                }}
              />
              {fieldState("specificationReferences")}
            </Field>
          </div>
        </Collapsible>
      </div>

      <footer className="rfi-register-editor__foot">
        <Button
          variant="secondary"
          type="button"
          data-editor-close
          data-id={rfi.id}
          onClick={onClose}
        >
          Close
        </Button>
      </footer>
    </form>
  );
}
