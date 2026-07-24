import { cx } from "../util/cx";

export interface ProjectTab {
  id: string;
  label: string;
  href: string;
}

export interface ProjectTabsProps {
  tabs: ProjectTab[];
  /** id of the active tab (selected for descendants by the router). */
  activeId: string;
  label?: string;
  className?: string;
}

/**
 * Project navigation tabs. These are links (real navigation), not a Radix
 * tab-panel, so the router owns selection — including for descendant routes.
 */
export function ProjectTabs({
  tabs,
  activeId,
  label = "Project sections",
  className,
}: ProjectTabsProps) {
  return (
    <nav className={cx("base-project-tabs", className)} aria-label={label}>
      <ul className="base-project-tabs__list">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <li key={tab.id} className="base-project-tabs__item">
              <a
                href={tab.href}
                className={cx(
                  "base-project-tabs__link",
                  active && "base-project-tabs__link--active",
                )}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
