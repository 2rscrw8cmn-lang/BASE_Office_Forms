import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createRendererPreviewAdapter } from "../../src/ui/app/renderer-preview";

const indexHtml = readFileSync("public/index.html", "utf8");
const appShellCss = readFileSync("public/app-shell.css", "utf8");
const applicationCss = readFileSync("src/ui/styles/app.css", "utf8");
const applicationHostSource = readFileSync(
  "src/ui/app/LegacyApplicationHost.tsx",
  "utf8",
);
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
    expect(baseCss).toContain('@import url("./brand-tokens.css");');
    expect(appShellCss).not.toMatch(/(^|\n)html\s*\{/);
    expect(appShellCss).not.toMatch(/(^|\n)body\s*\{/);
    expect(appShellCss).toContain(".app-shell-body");
    expect(applicationCss).toContain(".app-shell-body {");
    expect(applicationCss).toContain("margin: 0;");
    expect(applicationCss).toContain("font-family: var(--sans);");
    expect(applicationCss).toContain("color: var(--ink);");
    expect(applicationCss).toContain(".app-shell-body *::before");
    expect(applicationCss).toContain(".app-shell-body p {");
  });

  it("uses application-owned startup classes", () => {
    expect(applicationHostSource).toContain('className="app-eyebrow"');
    expect(applicationHostSource).not.toContain('className="eyebrow"');
  });

  it("keeps the reviewed renderer source byte-for-byte stable", () => {
    // This baseline includes the intentional current-main PDF-export merge.
    // UI-2 changes the application entry boundary only, so a later renderer
    // edit fails loudly until it receives an intentional review.
    expect(createHash("sha256").update(engineSource).digest("hex")).toBe(
      "ee7e27ed3e36305057e7d3ab6bacf069efef00fb5d715e234c90bd00f5e4c128",
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
