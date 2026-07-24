/*
 * Static boundary contract for the UI-6B Document Register: prohibited grid
 * technologies, shared-component ownership, token discipline, controlled
 * vocabulary reuse, and retention of the legacy rollback modules.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TOKENS } from "../../src/ui/theme/tokens";
import { RECORD_TYPES } from "../../src/domain/records/record";
import { RECORD_TYPE_OPTIONS } from "../../src/ui/features/records/format";

const featureFiles = [
  "src/ui/features/records/RecordsRegisterFeature.tsx",
  "src/ui/features/records/RecordsTable.tsx",
  "src/ui/features/records/RecordsCards.tsx",
  "src/ui/features/records/AddDocumentDrawer.tsx",
  "src/ui/features/records/api.ts",
  "src/ui/features/records/types.ts",
  "src/ui/features/records/urlState.ts",
  "src/ui/features/records/format.ts",
  "src/ui/features/records/useProjectRecords.ts",
];
const featureSource = featureFiles
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const css = readFileSync("src/ui/features/records/records.css", "utf8");
const table = readFileSync("src/ui/features/records/RecordsTable.tsx", "utf8");
const cards = readFileSync("src/ui/features/records/RecordsCards.tsx", "utf8");
const drawer = readFileSync(
  "src/ui/features/records/AddDocumentDrawer.tsx",
  "utf8",
);

describe("Document Register authority and implementation boundaries", () => {
  it("derives the create capability from the server, never from a role name", () => {
    expect(featureSource).not.toMatch(
      /\borg_admin\b|\bdocument_control_admin\b|\bproject_manager\b|\bmembershipRole\b|\bcanManage\b/,
    );
    expect(featureSource).toMatch(/capabilities\.createRecord/);
  });

  it("uses no Tabulator, BaseDataGrid, spreadsheet grid role, raw SVG, or direct Radix/Lucide import", () => {
    expect(featureSource).not.toMatch(
      /Tabulator|BaseDataGrid|role=["']grid["']|role=["']gridcell["']/,
    );
    expect(featureSource).not.toContain("<svg");
    expect(featureSource).not.toMatch(/from ["'](?:radix-ui|lucide-react)["']/);
  });

  it("declares exactly the six approved columns and no Actions/Open column", () => {
    const headers = [...table.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(
      (match) => match[1],
    );
    expect(headers).toEqual([
      "Document",
      "Type",
      "Discipline",
      "Revision",
      "Files",
      "Updated",
    ]);
    expect(table).not.toMatch(/<th[^>]*>(?:Actions|Open)<\/th>/);
  });

  it("never treats a draft as the authoritative current revision", () => {
    // Every revision presentation reads `currentRevision`; `draftRevisionId`
    // and `hasDraftRevision` only drive the separate draft indication.
    expect(table).toMatch(/record\.currentRevision/);
    expect(table).not.toMatch(/draftRevisionId/);
    expect(cards).not.toMatch(/draftRevisionId/);
    expect(featureSource).not.toMatch(
      /revisions\s*\[\s*0\s*\]|\.sort\(.*revisionNumber/,
    );
  });

  it("keeps the mobile card free of nested interactive controls", () => {
    // A whole-card link is only valid markup without nested controls.
    expect(cards).not.toMatch(/<button|<input|<select|<textarea/);
    expect(cards).toMatch(/AppLink/);
  });

  it("uses the shared mobile filter disclosure at the shared 760px breakpoint", () => {
    expect(featureSource).toMatch(/mobileFilterDisclosure/);
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(css).toMatch(
      /\.records-register-table-wrap\s*\{\s*display:\s*none;/,
    );
    expect(css).toMatch(/\.records-register-cards\s*\{\s*display:\s*flex;/);
    // No feature-specific responsive system beyond the shared breakpoints.
    const breakpoints = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map(
      (match) => match[1],
    );
    expect(new Set(breakpoints)).toEqual(new Set(["760", "460"]));
  });

  it("uses the shared detail Drawer rather than a local modal or focus trap", () => {
    expect(drawer).toMatch(/size="detail"/);
    expect(drawer).toMatch(/from "\.\.\/\.\.\/components"/);
    expect(drawer).not.toMatch(/aria-modal|createPortal|FOCUSABLE|trapFocus/);
    expect(drawer).not.toMatch(/keydown[\s\S]{0,80}Tab/);
  });

  it("does not define feature-specific focus rings or shared control appearance", () => {
    expect(css).not.toMatch(/:focus-visible/);
    expect(css).not.toMatch(/\boutline(?:-offset|-color)?\s*:/);
    expect(css).not.toMatch(/\.base-(?:btn|badge|drawer|dialog|input)\b\s*\{/);
    const sharedCss = readFileSync(
      "src/ui/components/base-components.css",
      "utf8",
    );
    expect(sharedCss).toMatch(/\.base-link:focus-visible/);
    expect(featureSource).toMatch(/AppLink/);
  });

  it("reuses the shared status vocabularies instead of duplicating them", () => {
    expect(featureSource).toMatch(/RecordStatusBadge/);
    expect(featureSource).toMatch(/RevisionStatusBadge/);
    expect(featureSource).toMatch(/REVISION_STATUS_VOCABULARY/);
    // No local copy of the Record/Revision status label sets.
    expect(featureSource).not.toMatch(/superseded:\s*["']Superseded["']/);
    expect(featureSource).not.toMatch(/archived:\s*["']Archived["']/);
  });

  it("draws the discipline vocabulary from the one controlled domain source", () => {
    const format = readFileSync("src/ui/features/records/format.ts", "utf8");
    expect(format).toMatch(/public\/record-options\.js/);
    // The discipline list itself is never restated in the feature.
    expect(featureSource).not.toMatch(/fire_protection|technology_low_voltage/);
  });

  it("labels every controlled record type exactly once", () => {
    expect(RECORD_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      ...RECORD_TYPES,
    ]);
  });

  it("supplies no client-generated Record number", () => {
    expect(drawer).not.toMatch(/recordNumber:/);
    expect(drawer).toMatch(/CreateRecordInput/);
  });

  it("preserves the existing Records URL-state parameter names", () => {
    const urlState = readFileSync(
      "src/ui/features/records/urlState.ts",
      "utf8",
    );
    for (const key of [
      "q",
      "type",
      "discipline",
      "revisionStatus",
      "archived",
      "sort",
      "direction",
    ]) {
      expect(urlState).toContain(`"${key}"`);
    }
  });
});

describe("Document Register token enforcement", () => {
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

describe("Legacy Records rollback modules are retained", () => {
  it("keeps the legacy controllers in the repository", () => {
    expect(readFileSync("public/records-view.js", "utf8")).toContain(
      "createRecordsView",
    );
    expect(readFileSync("public/add-document-form.js", "utf8")).toContain(
      "createAddDocumentForm",
    );
  });

  it("no longer mounts them on the migrated register route", () => {
    const layout = readFileSync("src/ui/app/AppLayout.tsx", "utf8");
    expect(layout).toMatch(/route\.id === "project-records"/);
    expect(layout).toMatch(/RecordsRegisterFeature/);
    // The compatibility bridge still exists for the descendant detail routes.
    expect(layout).toMatch(/LegacyFeatureMount/);
  });
});
