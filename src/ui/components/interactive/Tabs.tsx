import { Tabs as RadixTabs } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
}

/**
 * Tabbed panels on Radix behaviour: arrow-key roving focus, Home/End, correct
 * tab/tabpanel roles and aria wiring. BASE owns the underline/active treatment.
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: TabsProps) {
  return (
    <RadixTabs.Root
      className={cx("base-tabs", className)}
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
    >
      <RadixTabs.List className="base-tabs__list" aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className="base-tabs__trigger"
            disabled={item.disabled}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className="base-tabs__panel"
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
