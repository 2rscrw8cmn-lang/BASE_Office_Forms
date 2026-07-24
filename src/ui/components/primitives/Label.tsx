import type { LabelHTMLAttributes, ReactNode } from "react";
import { cx } from "../util/cx";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: ReactNode;
}

/** Standalone label for controls composed outside a Field. */
export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label className={cx("base-field__label", className)} {...rest}>
      {children}
      {required ? (
        <span className="base-field__required" aria-hidden="true">
          {" *"}
        </span>
      ) : null}
    </label>
  );
}
