import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface RegisterToolbarProps {
  /** Search value (controlled). */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Compact filter controls (Selects, Popover triggers). */
  filters?: ReactNode;
  /** Sort control. */
  sort?: ReactNode;
  /** Active filter chips row. */
  chips?: ReactNode;
  /** Result count; announced politely. */
  resultCount?: ReactNode;
  className?: string;
}

/**
 * The single register toolbar: search, compact filters, optional sort, active
 * filter chips, and a live result count. Projects, Records, and RFIs share this
 * so toolbars never diverge per feature.
 */
export function RegisterToolbar({
  searchValue,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder = "Search…",
  filters,
  sort,
  chips,
  resultCount,
  className,
}: RegisterToolbarProps) {
  return (
    <div className={cx("base-toolbar", className)}>
      <div className="base-toolbar__row">
        {onSearchChange ? (
          <div className="base-toolbar__search">
            <Icon
              name="search"
              size={16}
              className="base-toolbar__search-icon"
            />
            <input
              type="search"
              className="base-input base-toolbar__search-input"
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
            />
          </div>
        ) : null}
        {filters != null ? (
          <div className="base-toolbar__filters">{filters}</div>
        ) : null}
        {sort != null ? <div className="base-toolbar__sort">{sort}</div> : null}
      </div>
      {chips != null || resultCount != null ? (
        <div className="base-toolbar__meta">
          <div className="base-toolbar__chips">{chips}</div>
          {resultCount != null ? (
            <p className="base-toolbar__count" aria-live="polite">
              {resultCount}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
