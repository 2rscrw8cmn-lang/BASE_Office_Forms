import type { ReactNode } from "react";
import { cx } from "../util/cx";

export interface AppShellNavItem {
  id: string;
  label: string;
  href: string;
  active?: boolean;
}

export interface AppShellProps {
  /** Brand/organization slot in the global header. */
  brand: ReactNode;
  /** Primary global navigation items. */
  nav: AppShellNavItem[];
  /** Header-right slot (search, account, command trigger). */
  headerActions?: ReactNode;
  /** Trigger for the mobile navigation drawer. */
  mobileNavTrigger?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Global application frame: a persistent header with brand and primary
 * navigation, a header-actions slot, and a main content region. The mobile
 * drawer is composed by the caller with the Drawer component. Semantic landmarks
 * (banner/nav/main) are built in.
 */
export function AppShell({
  brand,
  nav,
  headerActions,
  mobileNavTrigger,
  children,
  className,
}: AppShellProps) {
  return (
    <div className={cx("base-shell", className)}>
      <header className="base-shell__header">
        {mobileNavTrigger != null ? (
          <div className="base-shell__mobile-trigger">{mobileNavTrigger}</div>
        ) : null}
        <div className="base-shell__brand">{brand}</div>
        <nav className="base-shell__nav" aria-label="Primary">
          <ul className="base-shell__nav-list">
            {nav.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={cx(
                    "base-shell__nav-link",
                    item.active && "base-shell__nav-link--active",
                  )}
                  aria-current={item.active ? "page" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {headerActions != null ? (
          <div className="base-shell__header-actions">{headerActions}</div>
        ) : null}
      </header>
      <main id="main-content" className="base-shell__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
