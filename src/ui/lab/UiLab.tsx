/*
 * Development-only UI Lab. Renders the real production components (via
 * ./catalog) across their required states inside selectable desktop and mobile
 * frames. It is never part of the production application bundle — it is built
 * only through vite.lab.config.ts / `npm run lab`. It adds no global visual CSS;
 * its own chrome uses the same application tokens.
 */

import { useMemo, useState } from "react";
import { ToastProvider, TooltipProvider } from "../components";
import { CATALOG, LAB_STATES, type LabGroup, type LabEntry } from "./catalog";
import "./lab.css";

type Viewport = "desktop" | "mobile";

const GROUP_LABEL: Record<LabGroup, string> = {
  primitive: "Primitives",
  interactive: "Interactive",
  pattern: "Application patterns",
};

const GROUP_ORDER: LabGroup[] = ["primitive", "interactive", "pattern"];

function EntryCard({ entry }: { entry: LabEntry }) {
  return (
    <section
      className="lab-entry"
      id={`entry-${entry.id}`}
      aria-labelledby={`h-${entry.id}`}
    >
      <header className="lab-entry__header">
        <h3 id={`h-${entry.id}`} className="lab-entry__name">
          {entry.name}
        </h3>
        <p className="lab-entry__desc">{entry.description}</p>
      </header>
      <div className="lab-entry__examples">
        {entry.examples.map((example, index) => (
          <div
            className="lab-example"
            key={`${entry.id}-${example.state}-${String(index)}`}
          >
            <span className="lab-example__state">{example.state}</span>
            <div className="lab-example__canvas">{example.render()}</div>
            {example.note ? (
              <p className="lab-example__note">{example.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function UiLab() {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [group, setGroup] = useState<LabGroup | "all">("all");

  const entries = useMemo(
    () =>
      group === "all"
        ? CATALOG
        : CATALOG.filter((entry) => entry.group === group),
    [group],
  );

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((groupKey) => ({
      group: groupKey,
      entries: entries.filter((entry) => entry.group === groupKey),
    })).filter((section) => section.entries.length > 0);
  }, [entries]);

  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="base-app lab-root">
          <header className="lab-header">
            <div>
              <p className="lab-header__eyebrow">BASE UI Lab</p>
              <h1 className="lab-header__title">
                Application component library
              </h1>
              <p className="lab-header__sub">
                Development-only. Renders the production components in{" "}
                {LAB_STATES.join(", ")}, plus desktop and mobile widths.
              </p>
            </div>
            <div className="lab-controls">
              <div
                className="lab-segmented"
                role="group"
                aria-label="Viewport width"
              >
                {(["desktop", "mobile"] as Viewport[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      value === viewport
                        ? "lab-segmented__btn lab-segmented__btn--active"
                        : "lab-segmented__btn"
                    }
                    aria-pressed={value === viewport}
                    onClick={() => {
                      setViewport(value);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div
                className="lab-segmented"
                role="group"
                aria-label="Component group"
              >
                {(["all", ...GROUP_ORDER] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      value === group
                        ? "lab-segmented__btn lab-segmented__btn--active"
                        : "lab-segmented__btn"
                    }
                    aria-pressed={value === group}
                    onClick={() => {
                      setGroup(value);
                    }}
                  >
                    {value === "all" ? "All" : GROUP_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <main
            className={`lab-frame lab-frame--${viewport}`}
            data-viewport={viewport}
          >
            {grouped.map((section) => (
              <div key={section.group} className="lab-group">
                <h2 className="lab-group__title">
                  {GROUP_LABEL[section.group]}
                </h2>
                <div className="lab-group__entries">
                  {section.entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </main>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
