import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface SpinnerProps {
  size?: number;
  /** Accessible label; omit to keep the spinner decorative beside visible text. */
  label?: string;
  className?: string;
}

/** Indeterminate loading indicator. Honours reduced-motion via CSS. */
export function Spinner({ size = 20, label, className }: SpinnerProps) {
  if (label) {
    return (
      <span className={cx("base-spinner", className)} role="status">
        <Icon name="loader" size={size} className="base-spin" />
        <span className="base-sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span className={cx("base-spinner", className)} aria-hidden="true">
      <Icon name="loader" size={size} className="base-spin" />
    </span>
  );
}
