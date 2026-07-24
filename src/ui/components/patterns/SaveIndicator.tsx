import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export interface SaveIndicatorProps {
  state: SaveState;
  /** Recovery action for failed/conflict states. */
  onResolve?: () => void;
  className?: string;
}

const CONFIG: Record<
  Exclude<SaveState, "idle">,
  { label: string; icon: IconName; tone: string; live: "polite" | "assertive" }
> = {
  saving: { label: "Saving…", icon: "loader", tone: "muted", live: "polite" },
  saved: {
    label: "Saved",
    icon: "check-circle",
    tone: "success",
    live: "polite",
  },
  failed: {
    label: "Save failed",
    icon: "circle-alert",
    tone: "danger",
    live: "assertive",
  },
  conflict: {
    label: "Changed elsewhere",
    icon: "alert-triangle",
    tone: "warning",
    live: "assertive",
  },
};

/**
 * Inline per-field/per-row save state used by editable registers and workspaces.
 * Announces changes via aria-live and never relies on colour alone. The server
 * remains authoritative for conflicts; `onResolve` triggers a refresh/recovery.
 */
export function SaveIndicator({
  state,
  onResolve,
  className,
}: SaveIndicatorProps) {
  if (state === "idle") {
    return null;
  }
  const config = CONFIG[state];
  const recoverable = state === "failed" || state === "conflict";
  return (
    <span
      className={cx("base-save", `base-save--${config.tone}`, className)}
      role="status"
      aria-live={config.live}
    >
      <Icon
        name={config.icon}
        size={14}
        className={state === "saving" ? "base-spin" : undefined}
      />
      <span>{config.label}</span>
      {recoverable && onResolve ? (
        <button
          type="button"
          className="base-save__resolve"
          onClick={onResolve}
        >
          {state === "conflict" ? "Refresh" : "Retry"}
        </button>
      ) : null}
    </span>
  );
}
