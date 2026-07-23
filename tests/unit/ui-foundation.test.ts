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
const projectsViewSource = readFileSync("public/projects-view.js", "utf8");
const recordsViewSource = readFileSync("public/records-view.js", "utf8");
const engineSource = readFileSync("public/engine.js", "utf8");
const baseCss = readFileSync("public/base.css", "utf8");
const previewFixtureSource = readFileSync(
  "scripts/ui2-preview-fixture.mjs",
  "utf8",
);

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

  it("keeps register captions and filter labels accessible but visually hidden", () => {
    expect(applicationCss).toContain(".app-shell-body .sr-only {");
    expect(applicationCss).toContain("position: absolute;");
    expect(applicationCss).toContain("clip: rect(0, 0, 0, 0);");
    expect(projectsViewSource).toContain(
      '<caption class="sr-only">Projects you can access</caption>',
    );
    expect(projectsViewSource).toContain(
      '<label class="sr-only" for="projects-search">Search projects</label>',
    );
    expect(recordsViewSource).toContain(
      '<caption class="sr-only">Documents you can access in this project</caption>',
    );
    expect(recordsViewSource).toContain(
      '<label class="sr-only" for="records-search">Search records</label>',
    );
    expect(recordsViewSource).toContain(
      '<label class="sr-only" for="records-sort">Sort records</label>',
    );
  });

  it("uses application-owned startup classes", () => {
    expect(applicationHostSource).toContain('className="app-eyebrow"');
    expect(applicationHostSource).not.toContain('className="eyebrow"');
  });

  it("keeps the reviewed renderer source byte-for-byte stable", () => {
    // This baseline includes the intentional current-main PDF-export merge,
    // plus the "Stacked Row Split" tall-field write-in box rework (merge of
    // local main into origin/main). UI-2 changes the application entry
    // boundary only, so a later renderer edit fails loudly until it receives
    // an intentional review.
    expect(createHash("sha256").update(engineSource).digest("hex")).toBe(
      "47dd824988ce82cd412c943607dbcddc740853e014de1d095b0f72fa23841325",
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

  it("keeps the preview smoke fixture isolated and free of committed identities", () => {
    expect(previewFixtureSource).toContain(
      'const previewDatabase = "base-office-forms-ui2-preview";',
    );
    expect(previewFixtureSource).toContain(
      'const previewDatabaseId = "c874725c-78d8-43d5-a1b8-5d4d26e52067";',
    );
    expect(previewFixtureSource).toContain("UI2_FIXTURE_EMAIL");
    expect(previewFixtureSource).toContain("function assertPreviewTarget()");
    expect(previewFixtureSource).toContain("function cleanup()");
    expect(previewFixtureSource).not.toContain("@basecm.com");
  });
});
