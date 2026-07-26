import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

describe("RFI document-control alignment after migration 0014", () => {
  it("reports current schema version 13", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);
  });

  it("stores common RFI state on records and RFI-only state in rfi_details", async () => {
    const recordColumns = await testDatabase()
      .prepare("SELECT name FROM pragma_table_info('records')")
      .all<{ name: string }>();
    const recordNames = recordColumns.results.map((column) => column.name);
    for (const required of [
      "record_type_key",
      "template_version_id",
      "sequence_no",
      "workflow_status",
      "current_responsible_contact_id",
      "responsible_party_legacy_text",
      "due_date",
      "issued_at",
      "closed_at",
      "lock_version",
    ]) {
      expect(recordNames).toContain(required);
    }

    const detailColumns = await testDatabase()
      .prepare("SELECT name FROM pragma_table_info('rfi_details')")
      .all<{ name: string }>();
    const detailNames = detailColumns.results.map((column) => column.name);
    for (const required of [
      "record_id",
      "question",
      "contractor_suggestion",
      "drawing_references",
      "specification_references",
      "response",
      "response_received_at",
      "cost_impact_legacy_text",
      "schedule_impact_legacy_text",
      "issuance_reconciliation_state",
    ]) {
      expect(detailNames).toContain(required);
    }
    expect(detailNames).not.toContain("subject");
    expect(detailNames).not.toContain("workflow_status");
    expect(detailNames).not.toContain("due_date");
  });

  it("retires the standalone RFI tables", async () => {
    const rows = await testDatabase()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('rfi_records', 'rfi_attachments', 'rfi_number_sequences')`,
      )
      .all<{ name: string }>();
    expect(rows.results).toEqual([]);
  });

  it("uses revision_files with explicit roles", async () => {
    const columns = await testDatabase()
      .prepare("SELECT name FROM pragma_table_info('revision_files')")
      .all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain("role");
    const sql = await testDatabase()
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'revision_files'",
      )
      .first<{ sql: string }>();
    for (const role of [
      "primary_document",
      "supporting_attachment",
      "reference_drawing",
      "response_attachment",
      "generated_artifact",
    ]) {
      expect(sql?.sql).toContain(`'${role}'`);
    }
  });

  it("keeps an auditable reconciliation map", async () => {
    const row = await testDatabase()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rfi_0014_reconciliation'",
      )
      .first<{ name: string }>();
    expect(row?.name).toBe("rfi_0014_reconciliation");
  });
});
