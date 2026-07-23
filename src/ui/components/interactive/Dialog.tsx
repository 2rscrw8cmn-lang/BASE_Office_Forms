import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { IconButton } from "../primitives/IconButton";

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trigger element; omit when controlling `open` externally. */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions (typically Buttons). */
  footer?: ReactNode;
  /** Mobile presentation: centred modal or bottom sheet. */
  variant?: "modal" | "sheet";
  className?: string;
}

/**
 * Application modal dialog on Radix behaviour: focus trap, Escape to close,
 * scroll lock, focus restoration, and labelling are provided by Radix; BASE owns
 * the surface, header, close affordance, and footer. Complex work belongs on a
 * route, not in an oversized modal.
 */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  variant = "modal",
  className,
}: DialogProps) {
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
          className={cx("base-dialog", `base-dialog--${variant}`, className)}
        >
          <header className="base-dialog__header">
            <div className="base-dialog__heading">
              <RadixDialog.Title className="base-dialog__title">
                {title}
              </RadixDialog.Title>
              {description != null ? (
                <RadixDialog.Description className="base-dialog__description">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <IconButton icon="x" label="Close dialog" />
            </RadixDialog.Close>
          </header>
          {children != null ? (
            <div className="base-dialog__body">{children}</div>
          ) : null}
          {footer != null ? (
            <footer className="base-dialog__footer">{footer}</footer>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
