import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";
import { Button } from "../primitives/Button";

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Optional request/trace ID surfaced for support without leaking internals. */
  requestId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Request-failure state with retry. Conveys failure through text and icon (not
 * colour alone) and optionally surfaces a request ID for support.
 */
export function ErrorState({
  title = "Unable to load",
  description = "Something went wrong. Try again.",
  requestId,
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cx("base-state", "base-state--error", className)}
      role="alert"
    >
      <Icon name="circle-alert" size={22} className="base-state__icon" />
      <p className="base-state__title">{title}</p>
      {description != null ? (
        <p className="base-state__description">{description}</p>
      ) : null}
      {requestId ? (
        <p className="base-state__meta">
          Reference <span className="base-mono">{requestId}</span>
        </p>
      ) : null}
      {onRetry ? (
        <div className="base-state__action">
          <Button variant="secondary" iconStart="arrow-right" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
