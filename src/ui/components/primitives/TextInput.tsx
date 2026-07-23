import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "../util/cx";
import { useField } from "./Field";

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  size?: "default" | "compact";
  /** Force the invalid style when used without a Field. */
  invalid?: boolean;
}

/**
 * Single-line text control. Inside a Field it inherits id, required,
 * aria-invalid, and aria-describedby automatically; standalone it accepts them
 * directly.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    {
      size = "default",
      invalid,
      className,
      id,
      type,
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
        id={id ?? field?.controlId}
        type={type ?? "text"}
        className={cx(
          "base-input",
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
