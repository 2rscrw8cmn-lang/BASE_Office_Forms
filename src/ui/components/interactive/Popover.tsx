import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Non-modal overlay panel on Radix behaviour: focus management, outside-click
 * and Escape dismissal, and positioning. Used for compact filters and lightweight
 * detail popouts.
 */
export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  className,
}: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className={cx("base-popover", className)}
          align={align}
          side={side}
          sideOffset={6}
        >
          {children}
          <RadixPopover.Arrow className="base-popover__arrow" />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
