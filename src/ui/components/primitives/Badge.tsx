import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export type BadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Optional leading icon; the label still carries the meaning. */
  icon?: IconName;
  /** Render as a monospace identifier (numbers, codes). */
  mono?: boolean;
  className?: string;
}

/**
 * Compact status/label chip. Tone maps to the semantic status palette but the
 * text always carries the meaning — status is never colour-only.
 */
export function Badge({
  children,
  tone = "neutral",
  icon,
  mono,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "base-badge",
        `base-badge--${tone}`,
        mono && "base-badge--mono",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      <span>{children}</span>
    </span>
  );
}
