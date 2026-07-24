import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";
import { Badge } from "../primitives/Badge";

export interface FileRowProps {
  name: string;
  /** File role (e.g. "Response", "Supporting"). */
  role?: string;
  /** Human-readable size/type meta. */
  meta?: ReactNode;
  /** Upload/scan state. */
  state?: "ready" | "queued" | "failed" | "quarantined";
  /** Trailing actions (download, remove). */
  actions?: ReactNode;
  className?: string;
}

const STATE_LABEL: Record<
  NonNullable<FileRowProps["state"]>,
  { label: string; tone: "neutral" | "warning" | "danger" | "success" }
> = {
  ready: { label: "Ready", tone: "success" },
  queued: { label: "Queued", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  quarantined: { label: "Quarantined", tone: "warning" },
};

/**
 * A single file entry with role, metadata, and processing state. Readable file
 * roles are surfaced explicitly (supporting/response/clarification).
 */
export function FileRow({
  name,
  role,
  meta,
  state,
  actions,
  className,
}: FileRowProps) {
  const stateInfo = state ? STATE_LABEL[state] : null;
  return (
    <div className={cx("base-file-row", className)}>
      <Icon name="paperclip" size={16} className="base-file-row__icon" />
      <div className="base-file-row__text">
        <span className="base-file-row__name">{name}</span>
        {meta != null ? (
          <span className="base-file-row__meta">{meta}</span>
        ) : null}
      </div>
      {role ? <span className="base-file-row__role">{role}</span> : null}
      {stateInfo ? (
        <Badge tone={stateInfo.tone}>{stateInfo.label}</Badge>
      ) : null}
      {actions != null ? (
        <div className="base-file-row__actions">{actions}</div>
      ) : null}
    </div>
  );
}
