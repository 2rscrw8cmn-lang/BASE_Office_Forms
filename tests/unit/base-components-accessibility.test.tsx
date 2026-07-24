// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IconButton } from "../../src/ui/components/primitives/IconButton";
import { Icon } from "../../src/ui/components/icons/Icon";
import { RadioGroup } from "../../src/ui/components/primitives/RadioGroup";
import { Badge } from "../../src/ui/components/primitives/Badge";
import { RfiStatusBadge } from "../../src/ui/components/patterns/StatusBadge";
import { FilterChip } from "../../src/ui/components/patterns/FilterChip";
import { Breadcrumbs } from "../../src/ui/components/patterns/Breadcrumbs";
import { ErrorState } from "../../src/ui/components/patterns/ErrorState";
import { SaveIndicator } from "../../src/ui/components/patterns/SaveIndicator";

describe("Icon-only controls have accessible names", () => {
  it("names an IconButton from its label", () => {
    render(<IconButton icon="pencil" label="Edit RFI" />);
    expect(
      screen.getByRole("button", { name: "Edit RFI" }),
    ).toBeInTheDocument();
  });

  it("hides a decorative icon and names a meaningful one", () => {
    const { container, rerender } = render(<Icon name="search" />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    rerender(<Icon name="search" title="Search" />);
    expect(screen.getByRole("img", { name: "Search" })).toBeInTheDocument();
  });
});

describe("Status is conveyed through text, not colour alone", () => {
  it("renders a readable status label", () => {
    render(<RfiStatusBadge status="void" />);
    expect(screen.getByText("Void")).toBeInTheDocument();
  });

  it("keeps a badge label available to assistive tech", () => {
    render(<Badge tone="danger">Failed</Badge>);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("Groups and landmarks are labelled", () => {
  it("labels the radio group and associates each option", () => {
    render(
      <RadioGroup
        label="Discipline"
        options={[
          { value: "arch", label: "Architectural" },
          { value: "struct", label: "Structural" },
        ]}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Discipline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Architectural" }),
    ).toBeInTheDocument();
  });

  it("labels breadcrumbs and marks the current page", () => {
    render(
      <Breadcrumbs
        items={[{ label: "OHPA Conway", href: "#" }, { label: "RFI-014" }]}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
    const current = screen.getByText("RFI-014");
    expect(current).toHaveAttribute("aria-current", "page");
  });
});

describe("Filter chip remove control is named with its value", () => {
  it("includes field and value in the accessible name", () => {
    render(
      <FilterChip label="Status" value="Open" onRemove={() => undefined} />,
    );
    expect(
      screen.getByRole("button", { name: "Remove Status filter Open" }),
    ).toBeInTheDocument();
  });
});

describe("Error and save states announce through live regions", () => {
  it("marks the error state as an alert", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("marks save state as a status region with text", () => {
    render(<SaveIndicator state="saving" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saving");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
