import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createRendererPreviewAdapter } from "../../src/ui/app/renderer-preview";

const indexHtml = readFileSync("public/index.html", "utf8");
const appShellCss = readFileSync("public/app-shell.css", "utf8");
const engineSource = readFileSync("public/engine.js", "utf8");
const baseCss = readFileSync("public/base.css", "utf8");

describe("UI-2 application boundary", () => {
  it("boots the authenticated app from the React/Vite asset and not renderer CSS", () => {
    expect(indexHtml).toContain('href="/brand-tokens.css"');
    expect(indexHtml).toContain('href="/app/app.css"');
    expect(indexHtml).toContain('src="/app/app.js"');
    expect(indexHtml).not.toContain('href="/base.css"');
  });

  it("keeps renderer layout CSS in base.css and app shell CSS scoped to app classes", () => {
    expect(baseCss).toContain(".sheet {");
    expect(baseCss).toContain("@import url('/brand-tokens.css');");
    expect(appShellCss).not.toMatch(/(^|\n)html\s*\{/);
    expect(appShellCss).not.toMatch(/(^|\n)body\s*\{/);
    expect(appShellCss).toContain(".app-shell-body");
  });

  it("keeps the official renderer source byte-for-byte stable", () => {
    // UI-2 changes the application entry boundary only. This guard makes an
    // accidental renderer edit fail loudly until it has an intentional review.
    expect(createHash("sha256").update(engineSource).digest("hex")).toBe(
      "0c8c1567b6e62ad4ef69dcf5db94dd9abfdb812577b7439fb134ceb3a5d57e5b",
    );
  });

  it("delegates preview markup to the controlled renderer runtime", () => {
    const window = new Window();
    const host = window.document.createElement("div");
    const render = vi.fn(() => '<div class="sheet">controlled</div>');
    const adapter = createRendererPreviewAdapter({ render });

    adapter.mount(host as unknown as HTMLElement, {
      kind: "document",
      title: "Preview",
    });

    expect(render).toHaveBeenCalledWith(
      { kind: "document", title: "Preview" },
      { fill: false },
    );
    expect(host.innerHTML).toBe('<div class="sheet">controlled</div>');
  });
});
