import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode, RefObject, SubmitEventHandler } from "react";
import { cx } from "../util/cx";
import { IconButton } from "../primitives/IconButton";
import { Button } from "../primitives/Button";
import { Icon } from "../icons/Icon";

export interface FormDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Grouped fields. */
  children: ReactNode;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Submission in progress: disables the form and shows the primary spinner. */
  loading?: boolean;
  /**
   * Disables the fields without claiming a submission is in flight. Used when an
   * already-submitted request must not be edited until its outcome is known.
   */
  fieldsDisabled?: boolean;
  /** Blocks submission while the form is shown (e.g. an unmet precondition). */
  submitDisabled?: boolean;
  /**
   * Removes the primary action entirely. For states where re-submitting is not
   * a safe offer at all, which is different from a disabled button the user
   * expects to become available again.
   */
  hideSubmit?: boolean;
  /** Extra footer action shown before Cancel, e.g. a multi-step Back. */
  secondaryAction?: ReactNode;
  /** Submission error summary shown above the footer. */
  errorSummary?: ReactNode;
  /** Optional first field for create/edit workflows. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Mobile presentation: centred dialog or bottom sheet. */
  variant?: "modal" | "sheet";
  className?: string;
}

/**
 * Standard create/edit form dialog: title/purpose, grouped fields, an optional
 * submission error summary, an explicit loading state, and a stable footer with
 * secondary and primary actions. Focus trap, Escape, focus restoration, and the
 * mobile sheet layout come from the Radix Dialog primitive. Complex work belongs
 * on a route, not in an oversized modal.
 */
export function FormDialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  loading = false,
  fieldsDisabled = false,
  submitDisabled = false,
  hideSubmit = false,
  secondaryAction,
  errorSummary,
  initialFocusRef,
  variant = "modal",
  className,
}: FormDialogProps) {
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
          onOpenAutoFocus={
            initialFocusRef
              ? (event) => {
                  event.preventDefault();
                  initialFocusRef.current?.focus();
                }
              : undefined
          }
        >
          <form
            className="base-form-dialog"
            onSubmit={onSubmit}
            noValidate
            aria-busy={loading || undefined}
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
                <IconButton icon="x" label="Close dialog" disabled={loading} />
              </RadixDialog.Close>
            </header>
            <div className="base-dialog__body base-form-dialog__body">
              <fieldset
                className="base-form-dialog__fields"
                disabled={loading || fieldsDisabled}
              >
                {children}
              </fieldset>
              {errorSummary != null ? (
                <div className="base-form-dialog__error-summary" role="alert">
                  <Icon name="circle-alert" size={16} />
                  <div>{errorSummary}</div>
                </div>
              ) : null}
            </div>
            <footer className="base-dialog__footer">
              {secondaryAction}
              <RadixDialog.Close asChild>
                <Button variant="secondary" disabled={loading}>
                  {cancelLabel}
                </Button>
              </RadixDialog.Close>
              {hideSubmit ? null : (
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={submitDisabled}
                >
                  {submitLabel}
                </Button>
              )}
            </footer>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
