import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface MetadataItem {
  label: string;
  value: ReactNode;
  /** Render the value in monospace (IDs, numbers, dates). */
  mono?: boolean;
}

export interface MetadataStripProps {
  items: MetadataItem[];
  className?: string;
}

/**
 * Horizontal label/value strip for a workspace's authoritative facts. Each fact
 * appears once; the strip is a definition list for correct semantics.
 */
export function MetadataStrip({ items, className }: MetadataStripProps) {
  return (
    <dl className={cx("base-metadata", className)}>
      {items.map((item) => (
        <div key={item.label} className="base-metadata__item">
          <dt className="base-metadata__label">{item.label}</dt>
          <dd className={cx("base-metadata__value", item.mono && "base-mono")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
