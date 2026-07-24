import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TOKENS } from "../../src/ui/theme/tokens";

const css = readFileSync("src/ui/features/rfis/rfis.css", "utf8");
const register = readFileSync(
  "src/ui/features/rfis/RfiRegisterFeature.tsx",
  "utf8",
);
const editor = readFileSync("src/ui/features/rfis/RfiEditorPanel.tsx", "utf8");
const table = readFileSync("src/ui/features/rfis/RfiTable.tsx", "utf8");
const cards = readFileSync("src/ui/features/rfis/RfiCards.tsx", "utf8");
const drawer = readFileSync("src/ui/components/interactive/Drawer.tsx", "utf8");
const toolbar = readFileSync(
  "src/ui/components/patterns/RegisterToolbar.tsx",
  "utf8",
);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL_COLOR = /\b(?:rgb|rgba|hsl|hsla)\(/;

describe("token enforcement — RFI register feature CSS", () => {
  it("uses no raw colour literals", () => {
    expect(HEX.test(css)).toBe(false);
    expect(FUNCTIONAL_COLOR.test(css)).toBe(false);
  });

  it("references only registered --app-* tokens", () => {
    const registry = new Set<string>(APP_TOKENS);
    const referenced = [...css.matchAll(/var\((--app-[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    const unknown = referenced.filter((token) => !registry.has(token));
    expect(unknown).toEqual([]);
  });
});

describe("RFI register shared-component boundary", () => {
  it("uses the shared Drawer and Collapsible with no inline editor row", () => {
    expect(register).toMatch(/\bDrawer\b/);
    expect(editor).toMatch(/\bCollapsible\b/);
    expect(table).not.toMatch(/RfiEditorPanel|editor-row|data-editor-row/);
    expect(register).toMatch(/<RfiEditorPanel/);
    expect(register).toMatch(/size="detail"/);
    expect(drawer).toMatch(/size\?: "navigation" \| "detail"/);
  });

  it("uses the shared toolbar disclosure rather than an RFI-only mobile filter control", () => {
    expect(register).toMatch(/mobileFilterDisclosure/);
    expect(toolbar).toMatch(/base-toolbar__filter-toggle/);
    expect(toolbar).toMatch(/aria-expanded/);
    expect(toolbar).toMatch(/aria-controls/);
  });

  it("does not import Radix or Lucide directly from the feature", () => {
    const featureSource = [register, editor, table, cards].join("\n");
    expect(featureSource).not.toMatch(/from ["'](?:radix-ui|lucide-react)["']/);
    expect(featureSource).not.toContain("<svg");
  });
});
