import { createContext, useContext, useId, type ReactNode } from "react";
import { cx } from "../util/cx";

interface FieldContextValue {
  controlId: string;
  labelId: string;
  helpId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  /** aria-describedby value for the control, or undefined if nothing to point at. */
  describedBy: string | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Reads the surrounding Field so a control (TextInput, Select, …) can wire its
 * id, required, aria-invalid, and aria-describedby automatically. Returns null
 * when a control is used outside a Field.
 */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  /** Supporting description rendered before the control. */
  help?: ReactNode;
  /** Validation message; presence marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label while keeping it accessible. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Groups a label, optional help text, a control, and a validation message, and
 * wires their relationships (`htmlFor`, `aria-describedby`, `aria-invalid`,
 * `required`) so features never reassemble this by hand. Error messages are
 * linked to the field and announced.
 */
export function Field({
  label,
  help,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const labelId = `${base}-label`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const invalid = error != null && error !== false && error !== "";

  const describedBy =
    [help != null && help !== false ? helpId : null, invalid ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const value: FieldContextValue = {
    controlId,
    labelId,
    helpId,
    errorId,
    invalid,
    required,
    describedBy,
  };

  return (
    <FieldContext.Provider value={value}>
      <div
        className={cx(
          "base-field",
          invalid && "base-field--invalid",
          className,
        )}
      >
        <label
          id={labelId}
          htmlFor={controlId}
          className={cx("base-field__label", hideLabel && "base-sr-only")}
        >
          {label}
          {required ? (
            <span className="base-field__required" aria-hidden="true">
              {" *"}
            </span>
          ) : null}
        </label>
        {help != null && help !== false ? (
          <p id={helpId} className="base-field__help">
            {help}
          </p>
        ) : null}
        {children}
        {invalid ? (
          <p id={errorId} className="base-field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
