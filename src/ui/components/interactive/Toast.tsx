import { Toast as RadixToast } from "radix-ui";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Auto-dismiss duration in ms; Infinity keeps it until dismissed. */
  duration?: number;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  danger: "circle-alert",
};

/**
 * Application toast provider on Radix behaviour: swipe/timeout dismissal, hotkey
 * focus, and an aria-live region. Call `useToast().toast(...)` to raise one. Used
 * for save confirmations, background errors, and recoverable notices.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    setToasts((current) => [
      ...current,
      { ...options, id: Date.now() + current.length },
    ]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => {
          const tone = item.tone ?? "info";
          return (
            <RadixToast.Root
              key={item.id}
              className={cx("base-toast", `base-toast--${tone}`)}
              duration={item.duration ?? 5000}
              onOpenChange={(open) => {
                if (!open) remove(item.id);
              }}
            >
              <Icon
                name={TONE_ICON[tone]}
                size={18}
                className="base-toast__icon"
              />
              <div className="base-toast__content">
                <RadixToast.Title className="base-toast__title">
                  {item.title}
                </RadixToast.Title>
                {item.description != null ? (
                  <RadixToast.Description className="base-toast__description">
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              <RadixToast.Close
                className="base-toast__close"
                aria-label="Dismiss"
              >
                <Icon name="x" size={15} />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="base-toast__viewport" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return ctx;
}
