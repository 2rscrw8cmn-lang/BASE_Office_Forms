import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "../util/cx";
import { useField } from "./Field";

export interface DateInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> {
  size?: "default" | "compact";
  invalid?: boolean;
}

/**
 * Native date control. Uses the browser date picker (server remains
 * authoritative for validation) and inherits Field wiring.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(
    {
      size = "default",
      invalid,
      className,
      id,
      required,
      "aria-describedby": describedBy,
      ...rest
    },
    ref,
  ) {
    const field = useField();
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
      <input
        ref={ref}
        {...rest}
        type="date"
        id={id ?? field?.controlId}
        className={cx(
          "base-input",
          "base-input--date",
          size === "compact" && "base-input--compact",
          className,
        )}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy ?? field?.describedBy}
        required={required ?? field?.required}
      />
    );
  },
);
