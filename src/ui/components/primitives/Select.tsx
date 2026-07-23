import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";
import { useField } from "./Field";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  size?: "default" | "compact";
  invalid?: boolean;
  children: ReactNode;
}

/**
 * Native single-select. The native control is used deliberately for short
 * option lists and correct mobile behaviour; the chevron is decorative. Rich
 * command-style pickers use CommandMenu/Popover instead.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      size = "default",
      invalid,
      className,
      id,
      required,
      children,
      "aria-describedby": describedBy,
      ...rest
    },
    ref,
  ) {
    const field = useField();
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
      <span
        className={cx(
          "base-select",
          size === "compact" && "base-select--compact",
        )}
      >
        <select
          ref={ref}
          {...rest}
          id={id ?? field?.controlId}
          className={cx("base-input", "base-select__control", className)}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy ?? field?.describedBy}
          required={required ?? field?.required}
        >
          {children}
        </select>
        <Icon name="chevron-down" size={16} className="base-select__chevron" />
      </span>
    );
  },
);
