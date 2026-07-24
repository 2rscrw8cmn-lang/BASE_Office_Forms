import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";
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
  /**
   * Element to focus when the panel opens. Without it Radix focuses the first
   * tabbable node (the close button), which is right for navigation but wrong
   * for a detail workflow whose first field or choice should receive focus.
   * Matches the `FormDialog` contract.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible name for the close control; defaults to the navigation wording. */
  closeLabel?: string;
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
  initialFocusRef,
  closeLabel = "Close menu",
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
          onOpenAutoFocus={
            initialFocusRef
              ? (event) => {
                  event.preventDefault();
                  initialFocusRef.current?.focus();
                }
              : undefined
          }
        >
          <header className="base-drawer__header">
            <RadixDialog.Title className="base-drawer__title">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton icon="x" label={closeLabel} />
            </RadixDialog.Close>
          </header>
          <div className="base-drawer__body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
