import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface WorkspaceSectionProps {
  title: ReactNode;
  /** Marks the section as secondary context (history/activity). */
  secondary?: boolean;
  actions?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A titled section within a Record Workspace. Primary sections carry the
 * current work; secondary sections carry history/activity context.
 */
export function WorkspaceSection({
  title,
  secondary = false,
  actions,
  description,
  children,
  className,
}: WorkspaceSectionProps) {
  return (
    <section
      className={cx(
        "base-workspace-section",
        secondary && "base-workspace-section--secondary",
        className,
      )}
    >
      <header className="base-workspace-section__header">
        <div>
          <h2 className="base-workspace-section__title">{title}</h2>
          {description != null ? (
            <p className="base-workspace-section__description">{description}</p>
          ) : null}
        </div>
        {actions != null ? (
          <div className="base-workspace-section__actions">{actions}</div>
        ) : null}
      </header>
      <div className="base-workspace-section__body">{children}</div>
    </section>
  );
}
