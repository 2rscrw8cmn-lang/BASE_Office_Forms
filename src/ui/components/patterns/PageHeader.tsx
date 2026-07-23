import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface PageHeaderProps {
  title: ReactNode;
  /** Compact supporting context under the title (counts, identity, dates). */
  supporting?: ReactNode;
  /** Optional eyebrow/context line above the title. */
  eyebrow?: ReactNode;
  /** One primary action, rendered when authorized. */
  primaryAction?: ReactNode;
  /** Overflow/secondary actions. */
  secondaryActions?: ReactNode;
  /** Renders the h1; set false when a parent already owns the page heading. */
  asHeading?: boolean;
  className?: string;
}

/**
 * The single page header for register and workspace patterns. Provides one
 * meaningful page heading, compact supporting context, and one primary action
 * slot so features never build bespoke headers.
 */
export function PageHeader({
  title,
  supporting,
  eyebrow,
  primaryAction,
  secondaryActions,
  asHeading = true,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("base-page-header", className)}>
      <div className="base-page-header__text">
        {eyebrow != null ? (
          <p className="base-page-header__eyebrow">{eyebrow}</p>
        ) : null}
        {asHeading ? (
          <h1 className="base-page-header__title">{title}</h1>
        ) : (
          <p className="base-page-header__title">{title}</p>
        )}
        {supporting != null ? (
          <p className="base-page-header__supporting">{supporting}</p>
        ) : null}
      </div>
      {primaryAction != null || secondaryActions != null ? (
        <div className="base-page-header__actions">
          {secondaryActions}
          {primaryAction}
        </div>
      ) : null}
    </header>
  );
}
