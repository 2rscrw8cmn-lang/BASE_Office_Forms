import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface ProjectHeaderProps {
  projectName: string;
  /** Short project number/code, shown as an identifier. */
  projectNumber?: string;
  /** Compact status/location facts. */
  facts?: ReactNode;
  /** Project-level actions. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Compact project identity bar shown above project-scoped routes so project
 * context (name, number, status) stays visible where it affects decisions.
 */
export function ProjectHeader({
  projectName,
  projectNumber,
  facts,
  actions,
  className,
}: ProjectHeaderProps) {
  return (
    <div className={cx("base-project-header", className)}>
      <div className="base-project-header__identity">
        {projectNumber ? (
          <span className="base-project-header__number">{projectNumber}</span>
        ) : null}
        <span className="base-project-header__name">{projectName}</span>
      </div>
      {facts != null ? (
        <div className="base-project-header__facts">{facts}</div>
      ) : null}
      {actions != null ? (
        <div className="base-project-header__actions">{actions}</div>
      ) : null}
    </div>
  );
}
