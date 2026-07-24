/*
 * Structural CSS assertions for the approved compact register + shared Drawer
 * refinement. These prevent a return to the expandable table-row editor or a
 * horizontally squeezed mobile table.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/features/rfis/rfis.css", "utf8");

describe("RFI register CSS — approved responsive behavior", () => {
  it("switches the semantic table to dedicated cards at 760px", () => {
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toMatch(/\.rfi-register-table-wrap\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/\.rfi-register-cards\s*\{\s*display:\s*flex;/);
  });

  it("makes the shared Drawer full-width on mobile and stacks paired fields at 460px", () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.rfi-register-drawer\s*\{[^}]*width:\s*100vw;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 460px\)[\s\S]*\.rfi-register-editor__paired\s*\{[^}]*grid-template-columns:\s*1fr;/,
    );
  });

  it("keeps a bounded 660px desktop Drawer with a safe-area-aware footer", () => {
    expect(css).toMatch(
      /\.rfi-register-drawer\s*\{[^}]*width:\s*min\(660px,\s*calc\(100vw - 56px\)\)/,
    );
    expect(css).toMatch(
      /\.rfi-register-editor__foot\s*\{[^}]*env\(safe-area-inset-bottom\)/,
    );
  });
});

describe("RFI register CSS — compact hierarchy", () => {
  it("uses compact rows and explicit Status, Assigned-to, Due, Updated, and actions widths", () => {
    expect(css).toMatch(
      /\.rfi-register-table tbody th,\s*\n\.rfi-register-table tbody td\s*\{[^}]*height:\s*60px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(3\)\s*\{\s*width:\s*112px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(4\)\s*\{\s*width:\s*154px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(7\)\s*\{\s*width:\s*48px;/,
    );
  });

  it("truncates desktop summaries and clamps mobile questions to two lines", () => {
    expect(css).toMatch(
      /\.rfi-register-subject-open-text,[\s\S]*?text-overflow:\s*ellipsis;/,
    );
    expect(css).toMatch(
      /\.rfi-register-card-question\s*\{[^}]*-webkit-line-clamp:\s*2;/,
    );
  });

  it("styles selected rows/cards and preserves comfortable mobile action targets", () => {
    expect(css).toMatch(
      /\.rfi-register-row:hover,\s*\n\.rfi-register-row\.is-selected/,
    );
    expect(css).toMatch(
      /\.rfi-register-card \.base-icon-btn\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/,
    );
  });

  it("contains no obsolete inline editor-row or reference-summary selectors", () => {
    expect(css).not.toContain("rfi-register-editor-row");
    expect(css).not.toContain("rfi-register-editor__grid");
    expect(css).not.toContain("rfi-register-subject-meta");
    expect(css).not.toContain("rfi-register-id-number--draft");
  });
});
