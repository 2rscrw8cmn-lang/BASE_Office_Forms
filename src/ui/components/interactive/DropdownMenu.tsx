import { DropdownMenu as RadixMenu } from "radix-ui";
import { Fragment, type ReactNode } from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  disabled?: boolean;
  /** Destructive items are visually separated and coloured. */
  destructive?: boolean;
  /** Insert a divider before this item. */
  separatorBefore?: boolean;
}

export interface DropdownMenuProps {
  /** Trigger element (e.g. an IconButton for an overflow menu). */
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: "start" | "end";
  className?: string;
}

/**
 * Overflow/action menu on Radix behaviour: full keyboard navigation (arrows,
 * Home/End, type-ahead), focus management, and Escape close. Used for secondary
 * and destructive actions behind a primary action.
 */
export function DropdownMenu({
  trigger,
  items,
  align = "end",
  className,
}: DropdownMenuProps) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          className={cx("base-menu", className)}
          align={align}
          sideOffset={6}
        >
          {items.map((item) => (
            <Fragment key={item.id}>
              {item.separatorBefore ? (
                <RadixMenu.Separator className="base-menu__separator" />
              ) : null}
              <RadixMenu.Item
                className={cx(
                  "base-menu__item",
                  item.destructive && "base-menu__item--destructive",
                )}
                disabled={item.disabled}
                onSelect={() => item.onSelect?.()}
              >
                {item.icon ? <Icon name={item.icon} size={15} /> : null}
                <span>{item.label}</span>
              </RadixMenu.Item>
            </Fragment>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
