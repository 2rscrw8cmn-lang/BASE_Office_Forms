import { Collapsible as RadixCollapsible } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface CollapsibleProps {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional supporting text on the trigger row. */
  meta?: ReactNode;
  className?: string;
}

/**
 * Progressive-disclosure section on Radix behaviour. Correct
 * aria-expanded/controls wiring and keyboard toggling are provided; BASE owns
 * the trigger row and chevron.
 */
export function Collapsible({
  title,
  children,
  open,
  defaultOpen,
  onOpenChange,
  meta,
  className,
}: CollapsibleProps) {
  return (
    <RadixCollapsible.Root
      className={cx("base-collapsible", className)}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <RadixCollapsible.Trigger className="base-collapsible__trigger">
        <Icon
          name="chevron-right"
          size={16}
          className="base-collapsible__chevron"
        />
        <span className="base-collapsible__title">{title}</span>
        {meta != null ? (
          <span className="base-collapsible__meta">{meta}</span>
        ) : null}
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className="base-collapsible__content">
        {children}
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  );
}
