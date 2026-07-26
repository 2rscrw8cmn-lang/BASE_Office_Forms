import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { MetadataStrip, type MetadataItem } from "./MetadataStrip";
import { Spinner } from "../primitives/Spinner";

export type WorkspaceStatus = "loading" | "ready" | "missing" | "error";

export interface WorkspacePageProps {
  /** Trail back to the owning register. Always rendered, in every state. */
  breadcrumbs: Crumb[];
  status: WorkspaceStatus;
  /** Identity line above the title: official number, type, parent identity. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Status badges rendered beside the title (text, never colour alone). */
  statusSlot?: ReactNode;
  /** One compact supporting line under the title. */
  supporting?: ReactNode;
  /** The single primary current action, when the server authorizes one. */
  primaryAction?: ReactNode;
  /** Secondary/destructive actions, normally one overflow menu. */
  overflowActions?: ReactNode;
  /** Lifecycle/read-only notice, directly under the identity header. */
  notice?: ReactNode;
  /** The workspace's authoritative facts; each fact appears exactly once. */
  metadata?: MetadataItem[];
  /** Current work panel, then files/content/response. */
  children?: ReactNode;
  /** Version history and activity, as secondary context. */
  secondary?: ReactNode;
  loadingLabel?: string;
  /** Rendered for `missing`; a generic, non-disclosing surface. */
  missing?: ReactNode;
  error?: ReactNode;
  className?: string;
}

/**
 * The Record Workspace page pattern (APP_UI_FOUNDATION §5.2), the detail-route
 * counterpart to `RegisterPage`. It owns the required hierarchy exactly once —
 * breadcrumbs, identity header with one primary action plus overflow, an
 * optional lifecycle notice, the metadata strip, the current-work/content body,
 * and secondary history/activity — and renders exactly one of the required
 * interaction states.
 *
 * Features supply data and slots; they do not rebuild the header, the state
 * scaffolding, or the responsive rules, and they never introduce a second
 * location for a fact the metadata strip already carries.
 */
export function WorkspacePage({
  breadcrumbs,
  status,
  eyebrow,
  title,
  statusSlot,
  supporting,
  primaryAction,
  overflowActions,
  notice,
  metadata,
  children,
  secondary,
  loadingLabel = "Loading…",
  missing,
  error,
  className,
}: WorkspacePageProps) {
  return (
    <div className={cx("base-workspace", className)} data-status={status}>
      <Breadcrumbs items={breadcrumbs} />
      {status === "loading" ? (
        <div className="base-workspace__loading" aria-busy="true">
          <Spinner label={loadingLabel} />
        </div>
      ) : null}
      {status === "missing" ? missing : null}
      {status === "error" ? error : null}
      {status === "ready" ? (
        <>
          <header className="base-workspace__identity">
            <div className="base-workspace__identity-text">
              {eyebrow != null ? (
                <p className="base-workspace__eyebrow">{eyebrow}</p>
              ) : null}
              <div className="base-workspace__title-row">
                <h2 className="base-workspace__title">{title}</h2>
                {statusSlot}
              </div>
              {supporting != null ? (
                <p className="base-workspace__supporting">{supporting}</p>
              ) : null}
            </div>
            {primaryAction != null || overflowActions != null ? (
              <div className="base-workspace__actions">
                {primaryAction}
                {overflowActions}
              </div>
            ) : null}
          </header>
          {notice}
          {metadata && metadata.length > 0 ? (
            <MetadataStrip
              items={metadata}
              className="base-workspace__metadata"
            />
          ) : null}
          <div className="base-workspace__body">{children}</div>
          {secondary != null ? (
            <div className="base-workspace__secondary">{secondary}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export interface WorkspaceNoticeProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: "neutral" | "warning";
  className?: string;
}

/**
 * The immutability/lifecycle notice used by archived records, published and
 * superseded revisions, and legacy issuance reconciliation. It states the exact
 * lifecycle reason rather than silently removing actions.
 */
export function WorkspaceNotice({
  title,
  description,
  tone = "neutral",
  className,
}: WorkspaceNoticeProps) {
  return (
    <div
      className={cx(
        "base-workspace-notice",
        `base-workspace-notice--${tone}`,
        className,
      )}
    >
      <strong className="base-workspace-notice__title">{title}</strong>
      {description != null ? (
        <span className="base-workspace-notice__description">
          {description}
        </span>
      ) : null}
    </div>
  );
}
