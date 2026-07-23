import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "../util/cx";
import { useField } from "./Field";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line text control with the same Field wiring as TextInput. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    {
      invalid,
      className,
      id,
      required,
      rows = 4,
      "aria-describedby": describedBy,
      ...rest
    },
    ref,
  ) {
    const field = useField();
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
      <textarea
        ref={ref}
        {...rest}
        rows={rows}
        id={id ?? field?.controlId}
        className={cx("base-input", "base-textarea", className)}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy ?? field?.describedBy}
        required={required ?? field?.required}
      />
    );
  },
);
