import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagesConfig = readFileSync("wrangler.jsonc", "utf8");
const previewFixture = readFileSync("scripts/rfi-preview-fixture.mjs", "utf8");
const rehearsal = readFileSync("scripts/rfi-0014-rehearsal.mjs", "utf8");
const rehearsalConfig = readFileSync("wrangler.rfi-rehearsal.jsonc", "utf8");

describe("RFI preview reconciliation tooling", () => {
  it("binds Pages preview to the isolated combined RFI database only", () => {
    expect(pagesConfig).toContain(
      '"preview_database_id": "5169cd7c-60d8-4dbd-a66c-75155f745216"',
    );
    expect(pagesConfig).toContain(
      '"database_name": "base-office-forms-rfi-preview"',
    );
    expect(pagesConfig).not.toContain('"ui2"');
  });

  it("guards the combined Access fixture and keeps identities out of source", () => {
    expect(previewFixture).toContain(
      'const previewDatabase = "base-office-forms-rfi-preview"',
    );
    expect(previewFixture).toContain("RFI_PREVIEW_FIXTURE_EMAIL");
    expect(previewFixture).toContain("function assertPreviewTarget()");
    expect(previewFixture).toContain("function cleanup()");
    expect(previewFixture).not.toContain("@basecm.com");
  });

  it("uses a separately guarded populated-data rehearsal through migration 0014", () => {
    expect(rehearsalConfig).toContain(
      '"database_id": "e88f15e9-b648-49d1-bded-bed1996bdbd9"',
    );
    expect(rehearsal).toContain("rfi-0014-legacy-fixture.sql");
    expect(rehearsal).toContain("0014_rfi_document_control_alignment.sql");
    expect(rehearsal).toContain("dashboard_rfi_model");
    expect(rehearsal).toContain("overview_rfi_model");
    expect(rehearsal).toContain("function cleanup()");
  });
});
