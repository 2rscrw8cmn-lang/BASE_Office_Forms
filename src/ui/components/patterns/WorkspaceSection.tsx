import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface WorkspaceSectionProps {
  title: ReactNode;
  /** Marks the section as secondary context (history/activity). */
  secondary?: boolean;
  actions?: ReactNode;
  description?: ReactNode;
  /**
   * Heading level for the section title. Inside a `WorkspacePage` the identity
   * title is already an `h2`, so its sections pass `3` to keep one honest
   * document outline; standalone use keeps the default `h2`.
   */
  headingLevel?: 2 | 3;
  /** Optional id so a section can label or be referenced by other regions. */
  headingId?: string;
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
  headingLevel = 2,
  headingId,
  children,
  className,
}: WorkspaceSectionProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
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
          <Heading id={headingId} className="base-workspace-section__title">
            {title}
          </Heading>
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
