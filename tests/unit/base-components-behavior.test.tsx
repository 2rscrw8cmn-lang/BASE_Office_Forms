// @vitest-environment happy-dom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../src/ui/components/primitives/Button";
import { Checkbox } from "../../src/ui/components/primitives/Checkbox";
import { Field } from "../../src/ui/components/primitives/Field";
import { TextInput } from "../../src/ui/components/primitives/TextInput";

describe("Button", () => {
  it("calls onClick and defaults to type=button", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blocks interaction and sets aria-busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Checkbox", () => {
  it("toggles checked state via keyboard", async () => {
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox checked={checked} onCheckedChange={setChecked}>
          Include archived
        </Checkbox>
      );
    }
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Include archived" });
    expect(box).toHaveAttribute("aria-checked", "false");
    box.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => {
      expect(box).toHaveAttribute("aria-checked", "true");
    });
  });
});

describe("Field wiring", () => {
  it("links label, help, and error to the control", () => {
    render(
      <Field label="Subject" help="Keep it short" error="Required" required>
        <TextInput />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Subject" });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // Both help and error ids are referenced.
    expect(describedBy?.split(" ").length).toBe(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});
