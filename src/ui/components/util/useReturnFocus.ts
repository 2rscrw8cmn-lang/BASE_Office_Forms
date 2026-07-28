import { useRef } from "react";

/**
 * Explicit focus restoration for overlays that are opened programmatically
 * rather than through a single Radix `Trigger` — a dialog launched from an
 * overflow menu item, or one of several controls that can open the same
 * confirmation.
 *
 * Radix restores focus to its own trigger, which does not exist in those cases,
 * so the opener is captured before the overlay mounts and refocused after it
 * unmounts. The refocus is deferred one frame so it lands after the overlay's
 * own close-focus handling rather than fighting it.
 *
 * Features use this instead of hand-rolling focus tracking; the focus trap,
 * Escape handling, and scroll lock still come from the shared overlay
 * components (APP_UI_FOUNDATION §11).
 */
export function useReturnFocus() {
  const originRef = useRef<HTMLElement | null>(null);

  const capture = (element?: HTMLElement | null) => {
    if (element) {
      originRef.current = element;
      return;
    }
    const active = document.activeElement;
    originRef.current = active instanceof HTMLElement ? active : null;
  };

  const restore = () => {
    const target = originRef.current;
    originRef.current = null;
    if (!target?.isConnected) return;
    window.requestAnimationFrame(() => {
      target.focus();
    });
  };

  return { capture, restore };
}
