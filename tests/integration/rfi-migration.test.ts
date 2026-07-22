import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

// Guards the schema that migration 0013 must produce, so a future edit that
// drops a column, forgets a status, or omits rfi_attachments fails loudly here
// rather than only surfacing as an opaque preview dashboard failure.
describe("RFI schema after migration 0013", () => {
  async function rfiRecordsSql(): Promise<string> {
    const row = await testDatabase()
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rfi_records'",
      )
      .first<{ sql: string }>();
    return row?.sql ?? "";
  }

  it("reports schema version 11", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(11);
  });

  it("has the new RFI Slice 1 columns", async () => {
    const columns = await testDatabase()
      .prepare("SELECT name FROM pragma_table_info('rfi_records')")
      .all<{ name: string }>();
    const names = columns.results.map((c) => c.name);
    for (const required of [
      "subject",
      "contractor_suggestion",
      "requested_response_date",
      "template_version_id",
      "lock_version",
      "issued_number_sequence",
      "project_snapshot_json",
      "drawing_references",
      "specification_references",
      "legacy_reference",
      "response_received_at",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("no longer exposes the legacy RFI columns", async () => {
    const columns = await testDatabase()
      .prepare("SELECT name FROM pragma_table_info('rfi_records')")
      .all<{ name: string }>();
    const names = columns.results.map((c) => c.name);
    for (const legacy of [
      "title",
      "due_date",
      "assigned_to",
      "suggested_resolution",
      "answered_at",
    ]) {
      expect(names).not.toContain(legacy);
    }
  });

  it("constrains status to the binding workflow states", async () => {
    const sql = await rfiRecordsSql();
    for (const status of [
      "draft",
      "ready_to_issue",
      "open",
      "response_received",
      "closed",
      "returned_for_clarification",
      "void",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    // The legacy statuses must not appear in the CHECK constraint.
    expect(sql).not.toMatch(/'issued'/);
    expect(sql).not.toMatch(/'answered'/);
  });

  it("creates the rfi_attachments table", async () => {
    const row = await testDatabase()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rfi_attachments'",
      )
      .first<{ name: string }>();
    expect(row?.name).toBe("rfi_attachments");
  });
});
