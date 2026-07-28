/*
 * The Slice 2B surfaces stay inside the application component and token
 * boundary: no feature-local modal, button, focus, or colour system, and a
 * responsive contract that holds at 390px. Layout that only a real browser can
 * measure is proven by `npm run evidence:rfi2b`; what a static check can prove
 * -- that the rules exist and the shared components are the ones used -- is
 * proven here.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TOKENS } from "../../src/ui/theme/tokens";

const css = readFileSync(
  "src/ui/features/rfi-workspace/rfi-workspace.css",
  "utf8",
);
const dialog = readFileSync(
  "src/ui/features/rfi-workspace/RfiIssueDialog.tsx",
  "utf8",
);
const feature = readFileSync(
  "src/ui/features/rfi-workspace/RfiWorkspaceFeature.tsx",
  "utf8",
);
const contentPanel = readFileSync(
  "src/ui/features/rfi-workspace/RfiContentPanel.tsx",
  "utf8",
);
const formDialog = readFileSync(
  "src/ui/components/patterns/FormDialog.tsx",
  "utf8",
);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL_COLOR = /\b(?:rgb|rgba|hsl|hsla)\(/;

describe("token enforcement — RFI workspace and issue CSS", () => {
  it("uses no raw colour literals", () => {
    expect(HEX.test(css)).toBe(false);
    expect(FUNCTIONAL_COLOR.test(css)).toBe(false);
  });

  it("references only registered --app-* tokens", () => {
    const registry = new Set<string>(APP_TOKENS);
    const referenced = [...css.matchAll(/var\((--app-[a-z0-9-]+)/g)].map(
      (match) => match[1],
    );
    expect(referenced.filter((token) => !registry.has(token))).toEqual([]);
  });
});

describe("responsive contract for the issue workflow and issued evidence", () => {
  it("collapses the review grid to a single column on narrow viewports", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobile).toContain(".rfi-issue-review");
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("gives the official PDF action a full-width touch target on mobile", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobile).toContain(".rfi-workspace-artifact .base-btn");
    expect(mobile).toContain("var(--app-touch-target)");
  });

  it("lets long filenames, companies, and recipient lists wrap rather than overflow", () => {
    for (const rule of [
      ".rfi-workspace-artifact__title",
      ".rfi-workspace-included__name",
      ".rfi-issue-review__row dd",
      ".rfi-issue-options .base-checkbox__label",
    ]) {
      const start = css.indexOf(rule);
      expect(start).toBeGreaterThan(-1);
      expect(css.slice(start, css.indexOf("}", start))).toContain(
        "overflow-wrap: anywhere",
      );
    }
    // Nothing in the issue surfaces may pin a minimum width wider than 390px.
    expect(css).not.toMatch(/min-width:\s*(?:[4-9]\d\d|\d{4,})px/);
  });

  it("keeps every grid track able to shrink below its content", () => {
    const tracks = [...css.matchAll(/grid-template-columns:([^;]+);/g)].map(
      (match) => match[1],
    );
    for (const track of tracks) {
      expect(track).toContain("minmax(0,");
    }
  });
});

describe("shared-component boundary for the issue workflow", () => {
  it("builds the workflow from the shared dialog, fields, and buttons", () => {
    expect(dialog).toMatch(/\bFormDialog\b/);
    expect(dialog).toMatch(/\bCheckbox\b/);
    expect(dialog).toMatch(/\bDateInput\b/);
    expect(dialog).toMatch(/\bField\b/);
    expect(feature).toMatch(/\bAlertDialog\b/);
  });

  it("adds no feature-local modal, overlay, focus trap, or button system", () => {
    const source = [dialog, feature, contentPanel].join("\n");
    expect(source).not.toMatch(/from ["'](?:radix-ui|lucide-react)["']/);
    expect(source).not.toContain("<svg");
    expect(source).not.toMatch(/createPortal|focus-trap|tabIndex={-1}/);
    expect(css).not.toContain("position: fixed");
    expect(css).not.toContain("z-index");
    expect(css).not.toContain(":focus-visible");
  });

  it("keeps the shared FormDialog's Radix focus trap, Escape, and labelling", () => {
    expect(formDialog).toMatch(/RadixDialog\.Content/);
    expect(formDialog).toMatch(/RadixDialog\.Title/);
    expect(formDialog).toMatch(/RadixDialog\.Description/);
    expect(formDialog).toMatch(/initialFocusRef/);
  });

  it("never renders the idempotency key, a storage key, or a predicted number", () => {
    const source = [dialog, feature].join("\n");
    expect(source).not.toMatch(/\{\s*attempt\.key\s*\}/);
    expect(source).not.toMatch(/idempotencyKey\s*\}/);
    expect(source).not.toContain("storageKey");
    expect(source).not.toMatch(/`RFI-\$\{/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("keeps the constrained main column and context rail from UI-7", () => {
    expect(feature).toMatch(/layout="rail"/);
  });
});
