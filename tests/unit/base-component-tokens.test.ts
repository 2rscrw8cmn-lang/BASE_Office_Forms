import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_TOKENS, BRAND_TOKENS } from "../../src/ui/theme/tokens";

const tokensCss = readFileSync("src/ui/theme/tokens.css", "utf8");
const componentsCss = readFileSync(
  "src/ui/components/base-components.css",
  "utf8",
);
const labCss = readFileSync("src/ui/lab/lab.css", "utf8");

/** Recursively collect files under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL_COLOR = /\b(?:rgb|rgba|hsl|hsla)\(/;

describe("token enforcement — no raw colours in component CSS", () => {
  it("uses no hex or functional colour literals in base-components.css", () => {
    expect(HEX.test(componentsCss)).toBe(false);
    expect(FUNCTIONAL_COLOR.test(componentsCss)).toBe(false);
  });

  it("uses no raw colour literals in the UI Lab chrome CSS", () => {
    expect(HEX.test(labCss)).toBe(false);
    expect(FUNCTIONAL_COLOR.test(labCss)).toBe(false);
  });
});

describe("token enforcement — every referenced token is registered", () => {
  function referencedAppTokens(css: string): string[] {
    return [...css.matchAll(/var\((--app-[a-z0-9-]+)/g)].map((m) => m[1]);
  }

  it("references only registered --app-* tokens in base-components.css", () => {
    const registry = new Set<string>(APP_TOKENS);
    const unknown = referencedAppTokens(componentsCss).filter(
      (token) => !registry.has(token),
    );
    expect(unknown).toEqual([]);
  });

  it("references only registered --app-* tokens in the UI Lab chrome CSS", () => {
    const registry = new Set<string>(APP_TOKENS);
    const unknown = referencedAppTokens(labCss).filter(
      (token) => !registry.has(token),
    );
    expect(unknown).toEqual([]);
  });

  it("declares every registered token in tokens.css", () => {
    for (const token of APP_TOKENS) {
      expect(tokensCss).toContain(`${token}:`);
    }
  });

  it("declares no --app-* token that is missing from the registry", () => {
    const declared = [...tokensCss.matchAll(/(--app-[a-z0-9-]+):/g)].map(
      (m) => m[1],
    );
    const registry = new Set<string>(APP_TOKENS);
    const undeclared = declared.filter((token) => !registry.has(token));
    expect(undeclared).toEqual([]);
  });

  it("only reads brand tokens through documented fallbacks", () => {
    const referencedBrand = [...tokensCss.matchAll(/var\((--[a-z0-9-]+)/g)]
      .map((m) => m[1])
      .filter((token) => !token.startsWith("--app-"));
    const brandRegistry = new Set<string>(BRAND_TOKENS);
    const unknownBrand = referencedBrand.filter(
      (token) => !brandRegistry.has(token),
    );
    expect(unknownBrand).toEqual([]);
  });
});

describe("token enforcement - overlay layering", () => {
  function numericToken(name: string): number {
    const match = new RegExp(`${name}:\\s*(\\d+)`).exec(tokensCss);
    return Number(match?.[1]);
  }

  it("layers shared drawers above overlays and application shell chrome", () => {
    expect(numericToken("--app-z-overlay")).toBeGreaterThan(200);
    expect(numericToken("--app-z-drawer")).toBeGreaterThan(
      numericToken("--app-z-overlay"),
    );
    expect(numericToken("--app-z-toast")).toBeGreaterThan(
      numericToken("--app-z-drawer"),
    );
  });
});

describe("token enforcement — single-source icon and behavior imports", () => {
  const uiFiles = walk("src/ui").filter(
    (file) => file.endsWith(".ts") || file.endsWith(".tsx"),
  );

  it("imports lucide-react only through the single Icon component", () => {
    const offenders = uiFiles.filter(
      (file) =>
        /from "lucide-react"/.test(readFileSync(file, "utf8")) &&
        !file.endsWith(join("icons", "Icon.tsx")),
    );
    expect(offenders).toEqual([]);
  });

  it("imports radix-ui only inside the component library", () => {
    const offenders = uiFiles.filter(
      (file) =>
        /from "radix-ui"/.test(readFileSync(file, "utf8")) &&
        !file.includes(join("ui", "components")),
    );
    expect(offenders).toEqual([]);
  });
});
