// @vitest-environment happy-dom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../../src/ui/components/interactive/Dialog";
import { Drawer } from "../../src/ui/components/interactive/Drawer";
import { Tabs } from "../../src/ui/components/interactive/Tabs";
import { DropdownMenu } from "../../src/ui/components/interactive/DropdownMenu";
import { CommandMenu } from "../../src/ui/components/interactive/CommandMenu";
import { Button } from "../../src/ui/components/primitives/Button";

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
