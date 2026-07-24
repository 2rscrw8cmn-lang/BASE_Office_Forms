/*
 * The expandable draft editor: Subject, Party, Response due, Question,
 * Contractor suggestion, Drawing references, Specification references. One
 * editor is open at a time (enforced by the parent, which mounts exactly one
 * instance). Controls maintain local, uncommitted values; nothing is sent to
 * the server on every keystroke -- text/date/textarea controls commit on
 * blur, selects commit immediately on selection, Enter commits a non-textarea
 * control (by blurring it), and Enter inside a textarea inserts a newline.
 * Escape commits any pending change through the same blur path and then closes
 * the editor.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Button,
  DateInput,
  Field,
  Select,
  TextArea,
  TextInput,
  ValidationMessage,
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
  onDone: () => void;
}

export function RfiEditorPanel({
  rfi,
  contacts,
  fieldStates,
  resetSignal,
  onCommit,
  onDone,
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
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
      onDone();
    } else if (event.key === "Enter" && !isTextarea && !event.shiftKey) {
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

  return (
    <div
      className="rfi-register-editor"
      role="group"
      aria-label={`Edit ${rfi.subject || "this RFI"}`}
      id={`rfi-editor-${rfi.id}`}
      data-editor-row={rfi.id}
    >
      <div className="rfi-register-editor__grid">
        {PANEL_ORDER.map((field) => {
          const meta = EDITABLE_FIELDS[field];
          const controlId = `rfi-edit-${rfi.id}-${field}`;
          const failure =
            fieldStates[field]?.status === "failed" ||
            fieldStates[field]?.status === "conflict"
              ? fieldStates[field]
              : undefined;
          const commonProps = {
            "data-field-input": true,
            "data-id": rfi.id,
            "data-field": field,
          } as const;
          return (
            <Field
              key={field}
              label={meta.label}
              controlId={controlId}
              required={field === "subject" || field === "question"}
              className={
                meta.wide ? "rfi-register-editor__field--wide" : undefined
              }
            >
              {meta.type === "contact" ? (
                <Select
                  {...commonProps}
                  value={values.responsiblePartyId}
                  onChange={(event) => {
                    setValue("responsiblePartyId", event.target.value);
                    onCommit("responsiblePartyId", event.target.value);
                  }}
                  onKeyDown={(event) => {
                    handleKeyDown(event, false);
                  }}
                >
                  <option value="">Unassigned</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                      {contact.companyName ? ` — ${contact.companyName}` : ""}
                    </option>
                  ))}
                </Select>
              ) : meta.type === "textarea" ? (
                <TextArea
                  {...commonProps}
                  rows={3}
                  value={values[field]}
                  onChange={(event) => {
                    setValue(field, event.target.value);
                  }}
                  onBlur={() => {
                    commit(field);
                  }}
                  onKeyDown={(event) => {
                    handleKeyDown(event, true);
                  }}
                />
              ) : meta.type === "date" ? (
                <DateInput
                  {...commonProps}
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
              ) : (
                <TextInput
                  {...commonProps}
                  ref={field === "subject" ? subjectRef : undefined}
                  value={values[field]}
                  onChange={(event) => {
                    setValue(field, event.target.value);
                  }}
                  onBlur={() => {
                    commit(field);
                  }}
                  onKeyDown={(event) => {
                    handleKeyDown(event, false);
                  }}
                />
              )}
              {field === "responsiblePartyId" &&
              rfi.responsiblePartyLegacyText ? (
                <p className="rfi-register-legacy-note">
                  Legacy value “{rfi.responsiblePartyLegacyText}” remains until
                  a contact is selected.
                </p>
              ) : null}
              <span
                className="rfi-register-field-state"
                data-field-state={`${rfi.id}:${field}`}
              >
                {failure ? (
                  <ValidationMessage>{failure.message}</ValidationMessage>
                ) : (
                  <SaveIndicator state={saveStateFor(field)} />
                )}
              </span>
            </Field>
          );
        })}
      </div>
      <div className="rfi-register-editor__foot">
        <Button
          variant="secondary"
          size="compact"
          type="button"
          data-editor-done
          data-id={rfi.id}
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
