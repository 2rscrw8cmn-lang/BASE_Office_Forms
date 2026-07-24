import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { cx } from "../util/cx";
import { Icon, type IconName } from "../icons/Icon";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: IconName;
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyLabel?: string;
  /** Accessible name for the search input. */
  label?: string;
}

function matches(item: CommandItem, query: string): boolean {
  const haystack = [item.label, item.hint ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Command palette on the Radix Dialog primitive (focus trap, Escape, restore)
 * with a filterable, arrow-navigable list. Selection runs the item's action
 * and closes the palette. A single keyboard-first entry point for global
 * actions.
 *
 * IDs are derived from `useId()` so multiple instances can mount at once
 * without colliding. The active index is re-derived from the current filtered
 * length on every render rather than trusted from state alone, so it can
 * never point past the end of a shrunk or emptied list.
 */
export function CommandMenu({
  open,
  onOpenChange,
  items,
  placeholder = "Type a command or search…",
  emptyLabel = "No matching commands",
  label = "Search commands",
}: CommandMenuProps) {
  const instanceId = useId();
  const listId = `${instanceId}-list`;
  const optionId = (id: string) => `${instanceId}-option-${id}`;

  const [query, setQuery] = useState("");
  const [rawActiveIndex, setRawActiveIndex] = useState(0);

  const filtered = useMemo(
    () => (query ? items.filter((item) => matches(item, query)) : items),
    [items, query],
  );

  // Reset to the top whenever the filtered collection changes shape — typing,
  // items shrinking/growing, or an item disappearing under a capability
  // change — so a stale index is never carried across a re-filter.
  useEffect(() => {
    setRawActiveIndex(0);
  }, [filtered]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Clamp against the *current* filtered length on every render instead of
  // trusting state alone: -1 for an empty collection, otherwise in range.
  // This keeps aria-activedescendant and the highlighted row correct even in
  // the single render before the effect above catches up.
  const activeIndex =
    filtered.length === 0
      ? -1
      : Math.min(Math.max(rawActiveIndex, 0), filtered.length - 1);
  const activeItem: CommandItem | undefined =
    activeIndex >= 0 ? filtered[activeIndex] : undefined;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setRawActiveIndex((index) =>
        Math.min(Math.max(index, 0) + 1, filtered.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setRawActiveIndex((index) =>
        Math.max(Math.min(index, filtered.length - 1) - 1, 0),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeItem) {
        activeItem.onSelect();
        onOpenChange(false);
      }
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="base-overlay" />
        <RadixDialog.Content className="base-command" aria-label="Command menu">
          <RadixDialog.Title className="base-sr-only">
            Command menu
          </RadixDialog.Title>
          <div className="base-command__search">
            <Icon name="search" size={16} />
            <input
              className="base-command__input"
              placeholder={placeholder}
              aria-label={label}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls={filtered.length > 0 ? listId : undefined}
              aria-activedescendant={
                activeItem ? optionId(activeItem.id) : undefined
              }
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <p className="base-command__empty">{emptyLabel}</p>
          ) : (
            <ul id={listId} className="base-command__list" role="listbox">
              {filtered.map((item, index) => (
                <li
                  key={item.id}
                  id={optionId(item.id)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cx(
                    "base-command__item",
                    index === activeIndex && "base-command__item--active",
                  )}
                  onMouseEnter={() => {
                    setRawActiveIndex(index);
                  }}
                  onClick={() => {
                    item.onSelect();
                    onOpenChange(false);
                  }}
                >
                  {item.icon ? <Icon name={item.icon} size={15} /> : null}
                  <span className="base-command__label">{item.label}</span>
                  {item.hint ? (
                    <span className="base-command__hint">{item.hint}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
