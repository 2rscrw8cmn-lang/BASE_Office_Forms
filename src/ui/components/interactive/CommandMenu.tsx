import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
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
}

function matches(item: CommandItem, query: string): boolean {
  const haystack = [item.label, item.hint ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Command palette on the Radix Dialog primitive (focus trap, Escape, restore)
 * with a filterable, arrow-navigable list. Selection runs the item's action and
 * closes the palette. A single keyboard-first entry point for global actions.
 */
export function CommandMenu({
  open,
  onOpenChange,
  items,
  placeholder = "Type a command or search…",
  emptyLabel = "No matching commands",
}: CommandMenuProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = "base-command-list";

  const filtered = useMemo(
    () => (query ? items.filter((item) => matches(item, query)) : items),
    [items, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const activeItem: CommandItem | undefined = filtered[activeIndex];
  const listRef = useRef<HTMLUListElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
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
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                filtered.length > 0
                  ? `base-command-${filtered[activeIndex].id}`
                  : undefined
              }
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <p className="base-command__empty">{emptyLabel}</p>
          ) : (
            <ul
              id={listId}
              ref={listRef}
              className="base-command__list"
              role="listbox"
            >
              {filtered.map((item, index) => (
                <li
                  key={item.id}
                  id={`base-command-${item.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cx(
                    "base-command__item",
                    index === activeIndex && "base-command__item--active",
                  )}
                  onMouseEnter={() => {
                    setActiveIndex(index);
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
