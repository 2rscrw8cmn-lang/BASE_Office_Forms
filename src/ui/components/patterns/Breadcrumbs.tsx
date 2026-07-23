import { Fragment } from "react";
import { cx } from "../util/cx";
import { Icon } from "../icons/Icon";

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/**
 * Workspace breadcrumb trail. The final item is the current page and is not a
 * link (marked aria-current).
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cx("base-breadcrumbs", className)} aria-label="Breadcrumb">
      <ol className="base-breadcrumbs__list">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${String(index)}`}>
              <li className="base-breadcrumbs__item">
                {last || !item.href ? (
                  <span aria-current={last ? "page" : undefined}>
                    {item.label}
                  </span>
                ) : (
                  <a href={item.href}>{item.label}</a>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="base-breadcrumbs__sep">
                  <Icon name="chevron-right" size={13} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
