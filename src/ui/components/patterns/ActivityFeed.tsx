import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface ActivityItem {
  id: string;
  /** Primary description of the event. */
  summary: ReactNode;
  /** Actor name. */
  actor?: string;
  /** Preformatted timestamp label. */
  timestamp: string;
}

export interface ActivityFeedProps {
  items: ActivityItem[];
  emptyLabel?: string;
  className?: string;
}

/**
 * Chronological activity/history list for secondary workspace context. Renders
 * as an ordered list; the empty label keeps the section honest when there is no
 * history yet.
 */
export function ActivityFeed({
  items,
  emptyLabel = "No activity yet",
  className,
}: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="base-activity__empty">{emptyLabel}</p>;
  }
  return (
    <ol className={cx("base-activity", className)}>
      {items.map((item) => (
        <li key={item.id} className="base-activity__item">
          <span className="base-activity__dot" aria-hidden="true" />
          <div className="base-activity__body">
            <p className="base-activity__summary">{item.summary}</p>
            <p className="base-activity__meta">
              {item.actor ? <span>{item.actor}</span> : null}
              <time className="base-activity__time">{item.timestamp}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
