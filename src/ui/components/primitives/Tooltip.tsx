import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface TooltipProps {
  /** The trigger element; must be focusable for keyboard access. */
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Delay before showing, ms. */
  delayDuration?: number;
  className?: string;
}

/**
 * Hover/focus tooltip on Radix behaviour. Tooltips supplement — never replace —
 * accessible names on their triggers. Wrap the app once in TooltipProvider.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  delayDuration = 300,
  className,
}: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className={cx("base-tooltip", className)}
          side={side}
          sideOffset={6}
        >
          {content}
          <RadixTooltip.Arrow className="base-tooltip__arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;
