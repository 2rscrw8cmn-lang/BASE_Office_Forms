import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readPublic(file: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../public/${file}`, import.meta.url)),
    "utf8",
  );
}

// The preserved legacy screens used to treat index.html as the Document
// Library. index.html is now the application shell, so these screens must not
// route document-library navigation back to it.
const legacyScreens = [
  { file: "builder.html", name: "Studio" },
  { file: "form-generator.html", name: "Fill & Export" },
  { file: "viewer.html", name: "Viewer" },
];

describe("legacy shell navigation", () => {
  for (const { file, name } of legacyScreens) {
    describe(`${name} (${file})`, () => {
      const html = readPublic(file);

      it("no longer links to the repurposed index.html shell", () => {
        expect(html).not.toContain("index.html");
      });

      it("points the Document Library breadcrumb at /library", () => {
        expect(html).toMatch(
          /<nav class="app-crumbs"[^>]*>\s*<a href="\/library">Document Library<\/a>/,
        );
      });

      it("offers the shared Back to app return link instead of the retired user placeholder", () => {
        expect(html).toMatch(
          /<a class="legacy-shell-return" href="\/dashboard">Back to app<\/a>/,
        );
        expect(html).not.toContain("user-placeholder");
      });

      it("targets /library for the search-form fallback action", () => {
        expect(html).toMatch(
          /<form class="global-search" action="\/library" role="search">/,
        );
        expect(html).not.toMatch(/class="global-search" action="index\.html"/);
      });

      it("does not leave a Documents-labeled link pointing at /dashboard", () => {
        expect(html).not.toMatch(/<a href="\/dashboard">Documents<\/a>/);
      });

      it("sends the product brand to a clear shell destination", () => {
        expect(html).toMatch(
          /<a class="app-brand" href="\/(tools\/forms|dashboard)"/,
        );
      });
    });
  }
});
