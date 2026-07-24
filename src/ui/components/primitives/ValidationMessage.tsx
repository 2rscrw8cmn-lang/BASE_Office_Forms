import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface ValidationMessageProps {
  children: ReactNode;
  /** `error` (danger) or `warning`; both convey meaning through text + icon. */
  tone?: "error" | "warning";
  id?: string;
  className?: string;
}

/**
 * Field-level validation message for controls composed outside a Field. It is a
 * live alert so screen readers announce it, and it pairs an icon with text so
 * the meaning never depends on colour alone.
 */
export function ValidationMessage({
  children,
  tone = "error",
  id,
  className,
}: ValidationMessageProps) {
  return (
    <p
      id={id}
      role="alert"
      className={cx(
        "base-field__error",
        tone === "warning" && "base-field__error--warning",
        className,
      )}
    >
      <Icon
        name={tone === "warning" ? "alert-triangle" : "circle-alert"}
        size={14}
      />
      <span>{children}</span>
    </p>
  );
}
