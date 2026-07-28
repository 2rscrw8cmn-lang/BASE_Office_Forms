import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "official";
export type ButtonSize = "default" | "compact";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and set aria-busy; the button also becomes non-interactive. */
  loading?: boolean;
  /** Optional leading icon. */
  iconStart?: IconName;
  /** Optional trailing icon. */
  iconEnd?: IconName;
  /** Stretch to the container width. */
  block?: boolean;
  children?: ReactNode;
}

/**
 * The one application button. Variants are explicit (`variant`, `size`) rather
 * than driven by parent feature selectors. `official` is the deliberate,
 * unmistakable treatment for consequential transitions (issue/publish/void).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "default",
      loading = false,
      iconStart,
      iconEnd,
      block = false,
      disabled,
      className,
      children,
      type,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cx(
          "base-btn",
          `base-btn--${variant}`,
          size === "compact" && "base-btn--compact",
          block && "base-btn--block",
          loading && "base-btn--loading",
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-variant={variant}
        {...rest}
      >
        {loading ? (
          <span className="base-btn__spinner" aria-hidden="true">
            <Icon name="loader" size={16} className="base-spin" />
          </span>
        ) : iconStart ? (
          <Icon name={iconStart} size={16} />
        ) : null}
        {children != null ? (
          <span className="base-btn__label">{children}</span>
        ) : null}
        {iconEnd && !loading ? <Icon name={iconEnd} size={16} /> : null}
      </button>
    );
  },
);

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconStart?: IconName;
  iconEnd?: IconName;
  block?: boolean;
  children?: ReactNode;
}

/**
 * A real anchor that wears the Button appearance, for destinations rather than
 * actions — an authenticated file download, or opening a related workspace.
 * Features use this instead of hand-assembling button classes onto an `<a>`, so
 * link semantics (middle-click, copy link, new tab) are never lost to a button
 * that only looks like a link.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "secondary",
      size = "default",
      iconStart,
      iconEnd,
      block = false,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <a
        ref={ref}
        className={cx(
          "base-btn",
          `base-btn--${variant}`,
          size === "compact" && "base-btn--compact",
          block && "base-btn--block",
          className,
        )}
        data-variant={variant}
        {...rest}
      >
        {iconStart ? <Icon name={iconStart} size={16} /> : null}
        {children != null ? (
          <span className="base-btn__label">{children}</span>
        ) : null}
        {iconEnd ? <Icon name={iconEnd} size={16} /> : null}
      </a>
    );
  },
);
