import { Separator } from "radix-ui";
import { cx } from "../util/cx";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** Decorative by default; set false when the divider separates meaning. */
  decorative?: boolean;
  className?: string;
}

/** Quiet structural divider (borders carry most structure). */
export function Divider({
  orientation = "horizontal",
  decorative = true,
  className,
}: DividerProps) {
  return (
    <Separator.Root
      className={cx("base-divider", `base-divider--${orientation}`, className)}
      orientation={orientation}
      decorative={decorative}
    />
  );
}
