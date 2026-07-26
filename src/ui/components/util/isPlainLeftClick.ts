import type { MouseEvent } from "react";

/**
 * True for an unmodified left click: the case where intercepting the
 * anchor's default navigation for client-side routing is safe. False for
 * middle-click, cmd/ctrl/shift/alt-click, or a click another handler already
 * consumed -- those must fall through to the browser's native "open in new
 * tab/window" behaviour, which `preventDefault()` would otherwise break.
 */
export function isPlainLeftClick(
  event: MouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
