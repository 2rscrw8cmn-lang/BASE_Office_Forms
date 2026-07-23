import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface FilterChipProps {
  /** e.g. "Status" */
  label: string;
  /** e.g. "Open" */
  value: string;
  onRemove?: () => void;
  className?: string;
}

/**
 * Active-filter chip shown in the register toolbar. Removing a chip clears that
 * filter; the accessible name includes both the field and its value.
 */
export function FilterChip({
  label,
  value,
  onRemove,
  className,
}: FilterChipProps) {
  return (
    <span className={cx("base-filter-chip", className)}>
      <span className="base-filter-chip__label">{label}:</span>
      <span className="base-filter-chip__value">{value}</span>
      {onRemove ? (
        <button
          type="button"
          className="base-filter-chip__remove"
          aria-label={`Remove ${label} filter ${value}`}
          onClick={onRemove}
        >
          <Icon name="x" size={13} />
        </button>
      ) : null}
    </span>
  );
}
