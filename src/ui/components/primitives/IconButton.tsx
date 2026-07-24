import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  icon: IconName;
  /** Required accessible name — icon-only controls must be named. */
  label: string;
  variant?: "ghost" | "secondary" | "danger";
  size?: "default" | "compact";
  loading?: boolean;
}

/**
 * Square icon-only control. `label` is mandatory and becomes the accessible
 * name plus the tooltip text, so an icon-only action is never unnamed.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = "ghost",
      size = "default",
      loading = false,
      disabled,
      className,
      type,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cx(
          "base-icon-btn",
          `base-icon-btn--${variant}`,
          size === "compact" && "base-icon-btn--compact",
          className,
        )}
        aria-label={label}
        title={label}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        <Icon
          name={loading ? "loader" : icon}
          className={loading ? "base-spin" : undefined}
        />
      </button>
    );
  },
);
