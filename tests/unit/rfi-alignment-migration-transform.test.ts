import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface SqliteStatement {
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): unknown;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
type SqliteCtor = new (path: string) => SqliteDatabase;

let sqliteCtor: SqliteCtor | null = null;
try {
  const mod: unknown = createRequire(import.meta.url)("node:sqlite");
  sqliteCtor = (mod as { DatabaseSync: SqliteCtor }).DatabaseSync;
} catch {
  sqliteCtor = null;
}

function migration(number: string): string {
  const names: Record<string, string> = {
    "0001": "0001_shared_library.sql",
    "0002": "0002_schema_marker.sql",
    "0003": "0003_identity_and_organizations.sql",
    "0004": "0004_correct_identity_schema_metadata.sql",
    "0005": "0005_projects_and_project_contacts.sql",
    "0006": "0006_rfi_foundation.sql",
    "0007": "0007_records_foundation.sql",
    "0008": "0008_revisions_foundation.sql",
    "0009": "0009_files_foundation.sql",
    "0010": "0010_issuance_foundation.sql",
    "0011": "0011_templates_foundation.sql",
    "0012": "0012_project_record_sequences.sql",
    "0013": "0013_rfi_slice1_register_workspace.sql",
    "0014": "0014_rfi_document_control_alignment.sql",
  };
  return readFileSync(
    fileURLToPath(
      new URL(`../../migrations/${names[number]}`, import.meta.url),
    ),
    "utf8",
  );
}

function apply(db: SqliteDatabase, number: string): void {
  db.exec("BEGIN");
  db.exec(migration(number));
  db.exec("COMMIT");
}

describe.skipIf(!sqliteCtor)(
  "migration 0014 populated-data reconciliation",
  () => {
    it("preserves every RFI, response, and attachment on the shared spine", () => {
      const Ctor = sqliteCtor;
      if (!Ctor) return;
      const db = new Ctor(":memory:");
      for (const number of [
        "0001",
        "0002",
        "0003",
        "0004",
        "0005",
        "0006",
        "0007",
        "0008",
        "0009",
        "0010",
        "0011",
        "0012",
        "0013",
      ]) {
        apply(db, number);
      }

      db.exec(`
      INSERT INTO organizations
        (id, name, slug, status, settings_json, created_at, updated_at)
      VALUES ('org1', 'Org', 'org', 'active', '{}', 'c', 'u');
      INSERT INTO users
        (id, identity_subject, email, display_name, status, created_at, updated_at)
      VALUES ('user1', 'subject', 'user@example.test', 'User', 'active', 'c', 'u');
      INSERT INTO organization_memberships
        (id, organization_id, user_id, role, status, created_at)
      VALUES ('member1', 'org1', 'user1', 'org_admin', 'active', 'c');
      INSERT INTO projects
        (id, organization_id, project_number, name, status, timezone, created_at, updated_at)
      VALUES ('project1', 'org1', 'P-1', 'Project', 'active', 'UTC', 'c', 'u');
      INSERT INTO project_contacts
        (id, organization_id, project_id, contact_name, contact_type, created_at, updated_at)
      VALUES ('contact1', 'org1', 'project1', 'Architect', 'architect', 'c', 'u');
      INSERT INTO templates
        (id, organization_id, key, name, kind, created_by, created_at, updated_at)
      VALUES ('template1', 'org1', 'base-rfi', 'BASE RFI', 'form', 'user1', 'c', 'u');
      INSERT INTO template_version_sequences
        (template_id, organization_id, last_number)
      VALUES ('template1', 'org1', 1);
      INSERT INTO template_versions
        (id, organization_id, template_id, version_number, definition_json,
         status, created_by, created_at, published_at, published_by)
      VALUES ('version1', 'org1', 'template1', 1, '{"kind":"form","title":"RFI","sections":[]}',
        'published', 'user1', 'c', 'c', 'user1');
      INSERT INTO rfi_records
        (id, organization_id, project_id, template_version_id, rfi_number,
         legacy_reference, status, subject, question, contractor_suggestion,
         drawing_references, specification_references, responsible_party,
         submitted_by, requested_response_date, cost_impact, schedule_impact,
         issued_number_sequence, project_snapshot_json, issued_at,
         response_received_at, closed_at, lock_version, created_by, created_at,
         updated_at)
      VALUES ('rfi1', 'org1', 'project1', 'version1', 'RFI-007', 'LEG-7',
        'open', 'Existing RFI', 'Existing question', 'Existing suggestion',
        'A-101', '03 30 00', 'Architect', 'Legacy submitter', '2026-08-01',
        'potential', 'two days', 7, NULL, '2026-07-01', NULL, NULL, 3,
        'user1', '2026-06-30', '2026-07-01');
      INSERT INTO rfi_responses
        (id, organization_id, rfi_id, response, responded_by, created_at)
      VALUES ('response1', 'org1', 'rfi1', 'Existing response', 'Architect', '2026-07-02');
      INSERT INTO rfi_number_sequences
        (project_id, organization_id, last_number)
      VALUES ('project1', 'org1', 7);
      INSERT INTO rfi_attachments
        (id, organization_id, project_id, rfi_id, role, storage_key,
         original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
      VALUES ('attachment1', 'org1', 'project1', 'rfi1', 'reference_drawing',
        'organizations/org1/projects/project1/rfis/rfi1/attachments/attachment1',
        'detail.pdf', 'application/pdf', 4,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'user1', '2026-07-01');
    `);

      apply(db, "0014");

      const record = db
        .prepare(
          `SELECT id, record_type_key, record_number, sequence_no, title,
           workflow_status, current_responsible_contact_id,
           responsible_party_legacy_text, due_date, issued_at, lock_version,
           current_revision_id
         FROM records WHERE id = 'rfi1'`,
        )
        .get();
      expect(record).toEqual({
        id: "rfi1",
        record_type_key: "rfi",
        record_number: "RFI-007",
        sequence_no: 7,
        title: "Existing RFI",
        workflow_status: "ready_to_issue",
        current_responsible_contact_id: "contact1",
        responsible_party_legacy_text: null,
        due_date: "2026-08-01",
        issued_at: "2026-07-01",
        lock_version: 3,
        current_revision_id: "rfi1:rfi-draft-v1",
      });

      expect(
        db
          .prepare(
            `SELECT question, contractor_suggestion, drawing_references,
             specification_references, response, legacy_workflow_status,
             issuance_reconciliation_state
           FROM rfi_details WHERE record_id = 'rfi1'`,
          )
          .get(),
      ).toEqual({
        question: "Existing question",
        contractor_suggestion: "Existing suggestion",
        drawing_references: "A-101",
        specification_references: "03 30 00",
        response: "Existing response",
        legacy_workflow_status: "open",
        issuance_reconciliation_state: "legacy_incomplete",
      });

      expect(
        db
          .prepare(
            `SELECT id, record_id, revision_id, role, storage_key,
             original_filename, sha256, uploaded_by, uploaded_at
           FROM revision_files WHERE id = 'attachment1'`,
          )
          .get(),
      ).toEqual({
        id: "attachment1",
        record_id: "rfi1",
        revision_id: "rfi1:rfi-draft-v1",
        role: "reference_drawing",
        storage_key:
          "organizations/org1/projects/project1/rfis/rfi1/attachments/attachment1",
        original_filename: "detail.pdf",
        sha256: "a".repeat(64),
        uploaded_by: "user1",
        uploaded_at: "2026-07-01",
      });
      expect(
        db.prepare("SELECT record_id, response FROM rfi_responses").get(),
      ).toEqual({ record_id: "rfi1", response: "Existing response" });

      const reconciliation = db
        .prepare(
          `SELECT COUNT(*) AS migrated_rfis,
           SUM(CASE WHEN record.id IS NULL THEN 1 ELSE 0 END) AS missing_records,
           SUM(CASE WHEN details.record_id IS NULL THEN 1 ELSE 0 END) AS missing_details,
           SUM(CASE WHEN revision.id IS NULL THEN 1 ELSE 0 END) AS missing_revisions
         FROM rfi_0014_reconciliation map
         LEFT JOIN records record ON record.id = map.record_id
         LEFT JOIN rfi_details details ON details.record_id = map.record_id
         LEFT JOIN record_revisions revision ON revision.id = map.draft_revision_id`,
        )
        .get();
      expect(reconciliation).toEqual({
        migrated_rfis: 1,
        missing_records: 0,
        missing_details: 0,
        missing_revisions: 0,
      });
      expect(
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'
           AND name IN ('rfi_records', 'rfi_attachments', 'rfi_number_sequences')`,
          )
          .get(),
      ).toEqual({ count: 0 });
    });
  },
);
