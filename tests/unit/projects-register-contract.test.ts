import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TOKENS } from "../../src/ui/theme/tokens";

const featureFiles = [
  "src/ui/features/projects/ProjectsRegisterFeature.tsx",
  "src/ui/features/projects/ProjectsTable.tsx",
  "src/ui/features/projects/ProjectsCards.tsx",
  "src/ui/features/projects/CreateProjectDialog.tsx",
  "src/ui/features/projects/api.ts",
  "src/ui/features/projects/types.ts",
  "src/ui/features/projects/urlState.ts",
  "src/ui/features/projects/format.ts",
  "src/ui/features/projects/useProjects.ts",
];
const featureSource = featureFiles
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const css = readFileSync("src/ui/features/projects/projects.css", "utf8");
const table = readFileSync(
  "src/ui/features/projects/ProjectsTable.tsx",
  "utf8",
);
const toolbar = readFileSync(
  "src/ui/components/patterns/RegisterToolbar.tsx",
  "utf8",
);

describe("Projects register authority and implementation boundaries", () => {
  it("contains no client-side role-name authorization inference", () => {
    expect(featureSource).not.toMatch(
      /\borg_admin\b|\bdocument_control_admin\b|\bmembershipRole\b|\bcanCreateProjects\b/,
    );
    expect(featureSource).toMatch(/capabilities\.createProject/);
  });

  it("uses no Tabulator, BaseDataGrid, spreadsheet grid role, or local icon family", () => {
    expect(featureSource).not.toMatch(
      /Tabulator|BaseDataGrid|role=["']grid["']/,
    );
    expect(featureSource).not.toContain("<svg");
    expect(featureSource).not.toMatch(/from ["'](?:radix-ui|lucide-react)["']/);
  });

  it("keeps four table headers and no redundant Actions/Open column", () => {
    expect(table).toMatch(/<th scope="col">Project<\/th>/);
    expect(table).toMatch(/<th scope="col">Status<\/th>/);
    expect(table).toMatch(/<th scope="col">Location<\/th>/);
    expect(table).toMatch(/<th scope="col">Updated<\/th>/);
    expect(table).not.toMatch(/<th[^>]*>(?:Actions|Open)<\/th>/);
  });

  it("uses the shared mobile filter disclosure at the shared 760px breakpoint", () => {
    expect(featureSource).toMatch(/mobileFilterDisclosure/);
    expect(toolbar).toMatch(/aria-expanded/);
    expect(toolbar).toMatch(/aria-controls/);
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toMatch(
      /\.projects-register-table-wrap\s*\{\s*display:\s*none;/,
    );
    expect(css).toMatch(/\.projects-register-cards\s*\{\s*display:\s*flex;/);
  });

  it("does not define feature-specific focus rings", () => {
    expect(css).not.toMatch(/\.projects-[^{:]+:focus-visible/);
    expect(css).not.toMatch(/\boutline(?:-offset|-color)?\s*:/);
    expect(featureSource).toMatch(/AppLink/);
    const appLink = readFileSync("src/ui/app/AppLink.tsx", "utf8");
    const sharedCss = readFileSync(
      "src/ui/components/base-components.css",
      "utf8",
    );
    expect(appLink).toMatch(/base-link/);
    expect(sharedCss).toMatch(/\.base-link:focus-visible/);
  });
});

describe("Projects register token enforcement", () => {
  it("uses no raw color literals", () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(css)).toBe(false);
    expect(/\b(?:rgb|rgba|hsl|hsla)\(/.test(css)).toBe(false);
  });

  it("references only registered application tokens", () => {
    const registry = new Set<string>(APP_TOKENS);
    const referenced = [...css.matchAll(/var\((--app-[a-z0-9-]+)/g)].map(
      (match) => match[1],
    );
    expect(referenced.filter((token) => !registry.has(token))).toEqual([]);
  });
});
