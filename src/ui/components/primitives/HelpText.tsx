import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../util/cx";

export interface HelpTextProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

/** Muted supporting text for a control used outside a Field. */
export function HelpText({ className, children, ...rest }: HelpTextProps) {
  return (
    <p className={cx("base-field__help", className)} {...rest}>
      {children}
    </p>
  );
}
