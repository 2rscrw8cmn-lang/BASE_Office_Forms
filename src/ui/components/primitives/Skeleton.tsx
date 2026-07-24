import type { CSSProperties } from "react";
import { cx } from "../util/cx";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: "sm" | "md" | "pill";
  className?: string;
  /** Number of stacked lines; renders a text-block placeholder. */
  lines?: number;
}

/** Content placeholder for loading states. Decorative (aria-hidden). */
export function Skeleton({
  width,
  height,
  radius = "sm",
  className,
  lines,
}: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span className={cx("base-skeleton-block", className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            className="base-skeleton"
            style={{ width: index === lines - 1 ? "60%" : "100%" }}
          />
        ))}
      </span>
    );
  }
  const style: CSSProperties = {
    width: typeof width === "number" ? `${String(width)}px` : width,
    height: typeof height === "number" ? `${String(height)}px` : height,
  };
  return (
    <span
      className={cx("base-skeleton", `base-skeleton--${radius}`, className)}
      style={style}
      aria-hidden="true"
    />
  );
}
