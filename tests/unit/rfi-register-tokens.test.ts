import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TOKENS } from "../../src/ui/theme/tokens";

const css = readFileSync("src/ui/features/rfis/rfis.css", "utf8");

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
