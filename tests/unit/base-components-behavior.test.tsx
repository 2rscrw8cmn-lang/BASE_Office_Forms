// @vitest-environment happy-dom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../src/ui/components/primitives/Button";
import { Checkbox } from "../../src/ui/components/primitives/Checkbox";
import { DateInput } from "../../src/ui/components/primitives/DateInput";
import { Field } from "../../src/ui/components/primitives/Field";
import { Select } from "../../src/ui/components/primitives/Select";
import { TextArea } from "../../src/ui/components/primitives/TextArea";
import { TextInput } from "../../src/ui/components/primitives/TextInput";
import { PageHeader } from "../../src/ui/components/patterns/PageHeader";

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

describe("PageHeader route-focus props", () => {
  it("forwards explicit heading id and programmatic tab index to its shared h1", () => {
    render(
      <PageHeader
        title="Projects"
        headingId="page-title"
        headingTabIndex={-1}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Projects" });
    expect(heading).toHaveAttribute("id", "page-title");
    expect(heading).toHaveAttribute("tabindex", "-1");
  });
});

describe("Field control id consistency", () => {
  it("auto-generates a matching id when Field is used without an explicit controlId", () => {
    render(
      <Field label="Subject">
        <TextInput />
      </Field>,
    );
    const input = screen.getByLabelText("Subject");
    expect(screen.getByText("Subject")).toHaveAttribute("for", input.id);
  });

  it("uses Field's controlId as the authoritative id for TextInput", () => {
    render(
      <Field label="Subject" controlId="rfi-subject">
        <TextInput />
      </Field>,
    );
    expect(screen.getByLabelText("Subject").id).toBe("rfi-subject");
  });

  it("keeps the label connected even if the child TextInput also receives an id prop", () => {
    render(
      <Field label="Subject" controlId="rfi-subject">
        <TextInput id="some-other-id" />
      </Field>,
    );
    // Field's controlId wins; the label can never point at a different id
    // than the one actually rendered on the control.
    expect(screen.getByLabelText("Subject").id).toBe("rfi-subject");
  });

  it("honours an id passed directly to TextInput when used standalone", () => {
    render(<TextInput id="standalone-input" />);
    expect(screen.getByRole("textbox").id).toBe("standalone-input");
  });

  it("uses Field's controlId as the authoritative id for TextArea", () => {
    render(
      <Field label="Question" controlId="rfi-question">
        <TextArea />
      </Field>,
    );
    expect(screen.getByLabelText("Question").id).toBe("rfi-question");
  });

  it("honours an id passed directly to TextArea when used standalone", () => {
    render(<TextArea id="standalone-textarea" />);
    expect(screen.getByRole("textbox").id).toBe("standalone-textarea");
  });

  it("uses Field's controlId as the authoritative id for Select", () => {
    render(
      <Field label="Status" controlId="rfi-status">
        <Select>
          <option>Open</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText("Status").id).toBe("rfi-status");
  });

  it("keeps the label connected even if the child Select also receives an id prop", () => {
    render(
      <Field label="Status" controlId="rfi-status">
        <Select id="some-other-id">
          <option>Open</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText("Status").id).toBe("rfi-status");
  });

  it("uses Field's controlId as the authoritative id for DateInput", () => {
    render(
      <Field label="Due date" controlId="rfi-due-date">
        <DateInput />
      </Field>,
    );
    expect(screen.getByLabelText("Due date").id).toBe("rfi-due-date");
  });

  it("honours an id passed directly to DateInput when used standalone", () => {
    render(<DateInput id="standalone-date" aria-label="Due date" />);
    expect(screen.getByLabelText("Due date").id).toBe("standalone-date");
  });
});
