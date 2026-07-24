import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface PermissionStateProps {
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
}

/**
 * Permission-limited state. Authorization is server-derived; this is the
 * generic, safe presentation when a viewer cannot access a resource or action.
 */
export function PermissionState({
  title = "You don't have access",
  description = "Ask a project administrator if you need access to this area.",
  className,
}: PermissionStateProps) {
  return (
    <div className={cx("base-state", "base-state--permission", className)}>
      <Icon name="lock" size={22} className="base-state__icon" />
      <p className="base-state__title">{title}</p>
      {description != null ? (
        <p className="base-state__description">{description}</p>
      ) : null}
    </div>
  );
}
