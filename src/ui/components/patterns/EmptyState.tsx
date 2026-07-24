import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  /** Primary action (e.g. Create). */
  action?: ReactNode;
  /**
   * `first-use` (nothing exists yet) vs `filtered` (results hidden by filters).
   * The distinction is required by the interaction-state contract.
   */
  variant?: "first-use" | "filtered";
  className?: string;
}

/** Compact empty state. Distinguishes first-use from filtered-empty. */
export function EmptyState({
  title,
  description,
  icon = "file-text",
  action,
  variant = "first-use",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx("base-empty", `base-empty--${variant}`, className)}
      data-variant={variant}
    >
      <Icon
        name={variant === "filtered" ? "filter" : icon}
        size={22}
        className="base-empty__icon"
      />
      <p className="base-empty__title">{title}</p>
      {description != null ? (
        <p className="base-empty__description">{description}</p>
      ) : null}
      {action != null ? (
        <div className="base-empty__action">{action}</div>
      ) : null}
    </div>
  );
}
