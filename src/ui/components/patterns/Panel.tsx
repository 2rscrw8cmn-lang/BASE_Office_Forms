import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface PanelProps {
  children: ReactNode;
  title?: ReactNode;
  /** Actions rendered in the panel header. */
  actions?: ReactNode;
  /** Reduce internal padding for dense contexts. */
  compact?: boolean;
  /** Remove body padding (e.g. to host a register surface flush). */
  flush?: boolean;
  className?: string;
}

/**
 * Surface container for grouped content (cards, current-work panels, register
 * surfaces). Borders carry structure; the shadow is minimal.
 */
export function Panel({
  children,
  title,
  actions,
  compact,
  flush,
  className,
}: PanelProps) {
  return (
    <section
      className={cx("base-panel", compact && "base-panel--compact", className)}
    >
      {title != null || actions != null ? (
        <header className="base-panel__header">
          {title != null ? (
            <h2 className="base-panel__title">{title}</h2>
          ) : (
            <span />
          )}
          {actions != null ? (
            <div className="base-panel__actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div
        className={cx("base-panel__body", flush && "base-panel__body--flush")}
      >
        {children}
      </div>
    </section>
  );
}
