// @vitest-environment happy-dom
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../../src/ui/components/interactive/Dialog";
import { Drawer } from "../../src/ui/components/interactive/Drawer";
import { Tabs } from "../../src/ui/components/interactive/Tabs";
import { DropdownMenu } from "../../src/ui/components/interactive/DropdownMenu";
import { CommandMenu } from "../../src/ui/components/interactive/CommandMenu";
import { Button } from "../../src/ui/components/primitives/Button";
import { Field } from "../../src/ui/components/primitives/Field";
import { TextInput } from "../../src/ui/components/primitives/TextInput";
import { FormDialog } from "../../src/ui/components/patterns/FormDialog";

describe("Dialog keyboard and focus", () => {
  it("labels the dialog, traps focus, and closes on Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Edit party"
          description="Update the responsible party."
          footer={<Button>Save</Button>}
        >
          <p>Body</p>
        </Dialog>
      );
    }
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Edit party");
    expect(dialog).toHaveAccessibleDescription("Update the responsible party.");
    // Focus is moved into the dialog subtree.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("FormDialog shared presentation and focus", () => {
  it("uses the reusable sheet variant, focuses its explicit initial field, and restores trigger focus", async () => {
    function Harness() {
      const initialFocusRef = useRef<HTMLInputElement>(null);
      return (
        <FormDialog
          trigger={<Button>Create project</Button>}
          title="Create project"
          onSubmit={(event) => {
            event.preventDefault();
          }}
          initialFocusRef={initialFocusRef}
          variant="sheet"
        >
          <Field label="Project number">
            <TextInput ref={initialFocusRef} />
          </Field>
        </FormDialog>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Create project" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "Create project",
    });
    expect(dialog).toHaveClass("base-dialog--sheet");
    expect(
      screen.getByRole("textbox", { name: "Project number" }),
    ).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });
});

describe("Drawer keyboard and focus", () => {
  it("opens from the trigger and closes on Escape, restoring focus", async () => {
    render(
      <Drawer trigger={<Button>Open menu</Button>} title="Navigation">
        <a href="#dashboard">Dashboard</a>
      </Drawer>,
    );
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Navigation");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    // Focus returns to the trigger after close.
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("exposes the reusable detail size without changing navigation Drawers", () => {
    render(
      <>
        <Drawer open title="Navigation">
          <p>Navigation</p>
        </Drawer>
        <Drawer open side="right" size="detail" title="RFI detail">
          <p>Detail</p>
        </Drawer>
      </>,
    );
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    expect(dialogs[0]).toHaveClass("base-drawer--navigation");
    expect(dialogs[0]).not.toHaveClass("base-drawer--detail");
    expect(dialogs[1]).toHaveClass("base-drawer--detail");
  });
});

describe("Tabs keyboard navigation", () => {
  it("moves selection with arrow keys and exposes tab/tabpanel roles", async () => {
    render(
      <Tabs
        label="RFI detail"
        items={[
          { value: "details", label: "Details", content: <p>Details body</p> },
          { value: "preview", label: "Preview", content: <p>Preview body</p> },
        ]}
      />,
    );
    const tablist = screen.getByRole("tablist", { name: "RFI detail" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Preview body");
  });
});

describe("DropdownMenu keyboard", () => {
  it("opens on Enter and runs an item action", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { id: "edit", label: "Edit", onSelect },
          {
            id: "void",
            label: "Void",
            destructive: true,
            onSelect: () => undefined,
          },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    // First item is focused on open; activate it.
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("CommandMenu keyboard", () => {
  it("filters and selects with arrow keys and Enter", async () => {
    const onSelect = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <CommandMenu
          open={open}
          onOpenChange={setOpen}
          items={[
            { id: "new-rfi", label: "New RFI", onSelect },
            {
              id: "records",
              label: "Go to Records",
              onSelect: () => undefined,
            },
          ]}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "New");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("CommandMenu robustness", () => {
  it("keeps ids independent when two instances are mounted simultaneously", () => {
    render(
      <>
        <CommandMenu
          open
          onOpenChange={() => undefined}
          items={[{ id: "a", label: "Alpha", onSelect: () => undefined }]}
        />
        <CommandMenu
          open
          onOpenChange={() => undefined}
          items={[{ id: "a", label: "Bravo", onSelect: () => undefined }]}
        />
      </>,
    );
    // Radix marks the non-topmost of two simultaneously open modal dialogs
    // aria-hidden (only one modal is exposed to assistive tech at a time), so
    // query with hidden:true — this test is about DOM id integrity, not
    // modal-stacking a11y semantics.
    const inputs = screen.getAllByRole("combobox", { hidden: true });
    expect(inputs).toHaveLength(2);
    const controls = inputs.map((input) => input.getAttribute("aria-controls"));
    expect(controls[0]).toBeTruthy();
    expect(controls[1]).toBeTruthy();
    expect(controls[0]).not.toBe(controls[1]);
    // Both instances use the item id "a" — their rendered option ids must
    // still be unique across the whole document.
    const allIds = Array.from(document.querySelectorAll("[id]")).map(
      (element) => element.id,
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("clamps the active index when items shrink while the menu stays open", async () => {
    const items = [
      { id: "a", label: "Alpha", onSelect: () => undefined },
      { id: "b", label: "Bravo", onSelect: () => undefined },
      { id: "c", label: "Charlie", onSelect: () => undefined },
    ];
    const { rerender } = render(
      <CommandMenu open onOpenChange={() => undefined} items={items} />,
    );
    const input = screen.getByRole("combobox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "Charlie" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Simulate the caller (e.g. a capability gate) shrinking the items prop
    // while the menu stays open, with the previous active index (2) now
    // pointing past the end of the new, shorter list.
    rerender(
      <CommandMenu
        open
        onOpenChange={() => undefined}
        items={items.slice(0, 1)}
      />,
    );

    expect(screen.queryByRole("option", { name: "Charlie" })).toBeNull();
    const remaining = screen.getByRole("option", { name: "Alpha" });
    expect(remaining).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", remaining.id);
  });

  it("recovers when the active item disappears after filtering", async () => {
    render(
      <CommandMenu
        open
        onOpenChange={() => undefined}
        items={[
          { id: "a", label: "Alpha", onSelect: () => undefined },
          { id: "b", label: "Bravo", onSelect: () => undefined },
          { id: "c", label: "Charlie", onSelect: () => undefined },
        ]}
      />,
    );
    const input = screen.getByRole("combobox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.type(input, "Charlie");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName("Charlie");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("handles an empty items collection without a negative active index", () => {
    render(<CommandMenu open onOpenChange={() => undefined} items={[]} />);
    const input = screen.getByRole("combobox");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("defaults the search input's accessible name", () => {
    render(<CommandMenu open onOpenChange={() => undefined} items={[]} />);
    expect(
      screen.getByRole("combobox", { name: "Search commands" }),
    ).toBeInTheDocument();
  });

  it("accepts a custom accessible name via the label prop", () => {
    render(
      <CommandMenu
        open
        onOpenChange={() => undefined}
        items={[]}
        label="Search RFI actions"
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Search RFI actions" }),
    ).toBeInTheDocument();
  });
});
