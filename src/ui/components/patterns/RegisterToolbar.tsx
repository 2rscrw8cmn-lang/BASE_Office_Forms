import { useId, useState, type ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";
import { IconButton } from "../primitives/IconButton";

export interface RegisterToolbarProps {
  /** Search value (controlled). */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Compact filter controls (Selects, Popover triggers). */
  filters?: ReactNode;
  /** Reusable mobile disclosure for the same semantic filter controls. */
  mobileFilterDisclosure?: {
    activeCount: number;
    label?: string;
  };
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
  mobileFilterDisclosure,
  sort,
  chips,
  resultCount,
  className,
}: RegisterToolbarProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterPanelId = useId();
  const hasMobileDisclosure = filters != null && mobileFilterDisclosure != null;
  const activeFilterCount = mobileFilterDisclosure?.activeCount ?? 0;
  const filterLabel = mobileFilterDisclosure?.label ?? "Filters";
  const toggleLabel = mobileFiltersOpen
    ? `Hide ${filterLabel.toLowerCase()}`
    : activeFilterCount > 0
      ? `Show ${String(activeFilterCount)} active ${filterLabel.toLowerCase()}`
      : `Show ${filterLabel.toLowerCase()}`;

  return (
    <div
      className={cx(
        "base-toolbar",
        hasMobileDisclosure && "base-toolbar--mobile-filter-disclosure",
        className,
      )}
    >
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
        {hasMobileDisclosure ? (
          <span className="base-toolbar__filter-toggle">
            <IconButton
              icon="filter"
              label={toggleLabel}
              aria-controls={filterPanelId}
              aria-expanded={mobileFiltersOpen}
              onClick={() => {
                setMobileFiltersOpen((open) => !open);
              }}
            />
            {activeFilterCount > 0 ? (
              <span className="base-toolbar__filter-count" aria-hidden="true">
                {activeFilterCount}
              </span>
            ) : null}
          </span>
        ) : null}
        {filters != null ? (
          <div
            id={hasMobileDisclosure ? filterPanelId : undefined}
            className={cx(
              "base-toolbar__filters",
              hasMobileDisclosure && "base-toolbar__filters--mobile-disclosure",
              hasMobileDisclosure && mobileFiltersOpen && "is-open",
            )}
          >
            {filters}
          </div>
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
