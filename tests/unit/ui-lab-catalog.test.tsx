// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ToastProvider, TooltipProvider } from "../../src/ui/components";
import {
  CATALOG,
  LAB_STATES,
  coveredStates,
  type LabExample,
} from "../../src/ui/lab/catalog";

/**
 * The UI Lab renders the real production components (not demo markup), so these
 * tests double as the shared-pattern visual/markup smoke: every catalog example
 * must mount without throwing, and the catalog must collectively cover every
 * required UI Lab state.
 */

function renderExample(example: LabExample) {
  return render(
    <TooltipProvider>
      <ToastProvider>
        <div className="base-app">{example.render()}</div>
      </ToastProvider>
    </TooltipProvider>,
  );
}

describe("UI Lab catalog", () => {
  it("covers every required UI Lab state across the catalog", () => {
    const covered = coveredStates();
    for (const state of LAB_STATES) {
      expect(covered.has(state)).toBe(true);
    }
  });

  it("includes primitives, interactive components, and application patterns", () => {
    const groups = new Set(CATALOG.map((entry) => entry.group));
    expect(groups.has("primitive")).toBe(true);
    expect(groups.has("interactive")).toBe(true);
    expect(groups.has("pattern")).toBe(true);
  });

  it("gives every catalog entry a default-equivalent example and unique id", () => {
    const ids = new Set<string>();
    for (const entry of CATALOG) {
      expect(entry.examples.length).toBeGreaterThan(0);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
    }
  });

  it("mounts every catalog example without throwing", () => {
    for (const entry of CATALOG) {
      for (const example of entry.examples) {
        const { unmount } = renderExample(example);
        unmount();
      }
    }
  });
});

describe("UI Lab shell", () => {
  it("renders the lab with real components and viewport controls", async () => {
    const { UiLab } = await import("../../src/ui/lab/UiLab");
    const { getByRole, getAllByRole } = render(<UiLab />);
    expect(
      getByRole("heading", { name: "Application component library", level: 1 }),
    ).toBeInTheDocument();
    expect(getByRole("group", { name: "Viewport width" })).toBeInTheDocument();
    // The lab renders real component headings (e.g. the Button entry).
    expect(getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(10);
  });
});
