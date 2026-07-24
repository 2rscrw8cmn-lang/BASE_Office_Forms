import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { IconButton } from "../primitives/IconButton";

export interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  /** Which edge the panel slides from. */
  side?: "left" | "right";
  /** Navigation stays compact; detail panels use the shared workspace width. */
  size?: "navigation" | "detail";
  className?: string;
}

/**
 * Slide-in panel used for the mobile navigation drawer and side sheets. Built on
 * the Radix Dialog primitive so it inherits the modal focus trap, Escape
 * dismissal, scroll lock, and focus restoration — features must not hand-roll a
 * focus trap (APP_UI_FOUNDATION §11).
 */
export function Drawer({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  children,
  side = "left",
  size = "navigation",
  className,
}: DrawerProps) {
  return (
    <RadixDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {trigger != null ? (
        <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      ) : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="base-overlay" />
        <RadixDialog.Content
          className={cx(
            "base-drawer",
            `base-drawer--${side}`,
            `base-drawer--${size}`,
            className,
          )}
        >
          <header className="base-drawer__header">
            <RadixDialog.Title className="base-drawer__title">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton icon="x" label="Close menu" />
            </RadixDialog.Close>
          </header>
          <div className="base-drawer__body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
