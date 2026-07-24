/*
 * Asserts the native register's feature-local CSS lines up with the
 * approved desktop/mobile behavior on `main` (`public/app-shell.css`'s
 * `.rfi-*` rules) rather than diverging into a reinterpreted layout: the
 * table/cards breakpoint, the editor's two-column collapse, the Subject
 * column's default ink color with accent-on-hover/expand, single-line
 * truncation for Subject/Question, ellipsis truncation for references, and
 * the plain (non-italic, non-monospace) "Unnumbered" draft treatment.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/features/rfis/rfis.css", "utf8");

describe("RFI register CSS — approved responsive breakpoints", () => {
  it("switches the table to cards at 760px, matching current main", () => {
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).not.toMatch(/@media \(max-width: 640px\)/);
  });

  it("collapses the editor to one column at 900px, matching current main", () => {
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{\s*\.rfi-register-editor__grid\s*\{\s*grid-template-columns:\s*1fr;/,
    );
  });
});

describe("RFI register CSS — table visual hierarchy", () => {
  it("keeps Subject ink-colored by default and accented only on hover/expand", () => {
    expect(css).toMatch(
      /\.rfi-register-subject-open\s*\{[^}]*color:\s*var\(--app-text-primary\)/,
    );
    expect(css).toMatch(
      /\.rfi-register-subject-open:hover,\s*\n\s*\.rfi-register-subject-open\[aria-expanded="true"\],\s*\n\s*\.rfi-register-subject-link:hover\s*\{[^}]*color:\s*var\(--app-accent\)/,
    );
  });

  it("clamps Subject and Question summary to a single line", () => {
    expect(css).toMatch(
      /\.rfi-register-subject-open-text,\s*\n\s*\.rfi-register-subject-link\s*\{[^}]*-webkit-line-clamp:\s*1/,
    );
    expect(css).toMatch(
      /\.rfi-register-subject-secondary\s*\{[^}]*-webkit-line-clamp:\s*1/,
    );
  });

  it("truncates drawing/spec references with an ellipsis", () => {
    expect(css).toMatch(
      /\.rfi-register-subject-meta\s*\{[^}]*text-overflow:\s*ellipsis/,
    );
  });

  it("uses established compact widths for Party, Due, and Updated", () => {
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(3\)\s*\{\s*width:\s*168px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(4\)\s*\{\s*width:\s*118px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-table thead th:nth-child\(5\)\s*\{\s*width:\s*90px;/,
    );
    expect(css).toMatch(
      /\.rfi-register-cell-responsible\s*\{\s*width:\s*168px;/,
    );
    expect(css).toMatch(/\.rfi-register-cell-due\s*\{\s*width:\s*118px;/);
    expect(css).toMatch(/\.rfi-register-cell-updated\s*\{\s*width:\s*90px;/);
  });

  it("renders the Unnumbered draft label in the quieter sans-serif treatment, not italic mono", () => {
    const match = /\.rfi-register-id-number--draft\s*\{([^}]*)\}/.exec(css);
    expect(match).not.toBeNull();
    const body = match?.[1] ?? "";
    expect(body).toMatch(/font-family:\s*var\(--app-font-sans\)/);
    expect(body).not.toMatch(/italic/);
  });
});
