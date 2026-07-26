/*
 * In-app navigation anchor. Renders a real <a> (so middle-click, cmd/ctrl-click,
 * and "open in new tab" behave normally) but intercepts a plain left click and
 * routes it through the shell's navigate bridge, which also closes the mobile
 * drawer. This mirrors the legacy shell's `data-app-link` handling.
 */

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useShell } from "./ShellContext";
import { cx } from "../components/util/cx";
import { isPlainLeftClick } from "../components/util/isPlainLeftClick";

export function AppLink({
  href,
  onClick,
  children,
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useShell();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cx("base-link", className)}
      {...rest}
    >
      {children}
    </a>
  );
}
