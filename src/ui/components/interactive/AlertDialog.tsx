import { AlertDialog as RadixAlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { Button } from "../primitives/Button";

export interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  /** Label for the confirming action. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Marks the confirm action as destructive (danger styling). */
  destructive?: boolean;
  loading?: boolean;
  onConfirm?: () => void;
  className?: string;
}

/**
 * Confirmation dialog for consequential/destructive transitions. Unlike Dialog,
 * it is modal by role, has no dismiss affordance other than explicit
 * cancel/confirm, and returns focus to the trigger. Server remains authoritative
 * for the action itself.
 */
export function AlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  className,
}: AlertDialogProps) {
  return (
    <RadixAlertDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {trigger != null ? (
        <RadixAlertDialog.Trigger asChild>{trigger}</RadixAlertDialog.Trigger>
      ) : null}
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="base-overlay" />
        <RadixAlertDialog.Content
          className={cx("base-dialog", "base-dialog--alert", className)}
        >
          <RadixAlertDialog.Title className="base-dialog__title">
            {title}
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description className="base-dialog__description">
            {description}
          </RadixAlertDialog.Description>
          <footer className="base-dialog__footer">
            <RadixAlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </RadixAlertDialog.Cancel>
            <RadixAlertDialog.Action asChild>
              <Button
                variant={destructive ? "danger" : "official"}
                loading={loading}
                onClick={(event) => {
                  // Keep the dialog open while the server action resolves; the
                  // caller closes it via `open` once the request settles.
                  if (onConfirm) {
                    event.preventDefault();
                    onConfirm();
                  }
                }}
              >
                {confirmLabel}
              </Button>
            </RadixAlertDialog.Action>
          </footer>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
