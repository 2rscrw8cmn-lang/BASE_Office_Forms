import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

async function resetToEmptyDatabase(): Promise<void> {
  const database = testDatabase();
  const tables = await database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>();
  for (const { name } of tables.results) {
    await database.prepare(`DROP TABLE IF EXISTS "${name}"`).run();
  }
}

describe("RFI official issuance migration 0015", () => {
  it("applies to an empty database at schema version 13", async () => {
    await resetToEmptyDatabase();
    await applyD1Migrations(
      testDatabase(),
      env.TEST_MIGRATIONS,
      "d1_migrations_rfi_issue_empty",
    );
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);
    const tables = await testDatabase()
      .prepare(
        `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name IN (
           'rfi_official_issues', 'rfi_issue_recipients',
           'rfi_issue_file_snapshots', 'idempotency_keys',
           'rfi_artifact_orphans'
         ) ORDER BY name`,
      )
      .all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual([
      "idempotency_keys",
      "rfi_artifact_orphans",
      "rfi_issue_file_snapshots",
      "rfi_issue_recipients",
      "rfi_official_issues",
    ]);
  });

  it("preserves a populated post-0014 RFI and its sequence state", async () => {
    const database = testDatabase();
    await resetToEmptyDatabase();
    await applyD1Migrations(
      database,
      env.TEST_MIGRATIONS.slice(0, 14),
      "d1_migrations_rfi_issue_populated",
    );
    const now = "2026-07-25T12:00:00.000Z";
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-rfi-issue-mig', 'RFI Org', 'rfi-org', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-rfi-issue-mig', 'identity|rfi-issue', 'rfi@example.test', 'RFI User', 'active', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-rfi-issue-mig', 'org-rfi-issue-mig', 'user-rfi-issue-mig', 'org_admin', 'active', ?)",
        )
        .bind(now),
      database
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-rfi-issue-mig', 'org-rfi-issue-mig', 'P-RFI', 'RFI Project', 'active', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO templates (id, organization_id, key, name, kind, created_by, created_at, updated_at) VALUES ('template-rfi-issue-mig', 'org-rfi-issue-mig', 'base-rfi', 'BASE RFI', 'form', 'user-rfi-issue-mig', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          `INSERT INTO template_versions
            (id, organization_id, template_id, version_number, definition_json,
             status, created_by, created_at, published_at, published_by)
           VALUES ('template-version-rfi-issue-mig', 'org-rfi-issue-mig',
             'template-rfi-issue-mig', 1, '{"kind":"form","title":"RFI","sections":[]}',
             'published', 'user-rfi-issue-mig', ?, ?, 'user-rfi-issue-mig')`,
        )
        .bind(now, now),
      database
        .prepare(
          `INSERT INTO records
            (id, organization_id, project_id, record_type, record_type_key,
             record_number, title, status, workflow_status, source, created_by,
             current_revision_id, template_version_id, sequence_no,
             lock_version, created_at, updated_at)
           VALUES ('rfi-issue-mig', 'org-rfi-issue-mig',
             'project-rfi-issue-mig', 'other', 'rfi', NULL, 'Existing RFI',
             'active', 'ready_to_issue', 'rfi', 'user-rfi-issue-mig', NULL,
             'template-version-rfi-issue-mig', NULL, 2, ?, ?)`,
        )
        .bind(now, now),
      database.prepare(
        `INSERT INTO rfi_details
            (record_id, organization_id, project_id, question,
             issuance_reconciliation_state)
           VALUES ('rfi-issue-mig', 'org-rfi-issue-mig',
             'project-rfi-issue-mig', 'Existing question?', 'not_issued')`,
      ),
      database
        .prepare(
          `INSERT INTO record_revisions
            (id, organization_id, project_id, record_id, revision_number,
             revision_label, title, description, change_summary, status,
             created_by, created_at)
           VALUES ('rfi-issue-mig:revision', 'org-rfi-issue-mig',
             'project-rfi-issue-mig', 'rfi-issue-mig', 1, 'Draft',
             'Existing RFI', 'Existing question?', 'Initial RFI draft', 'draft',
             'user-rfi-issue-mig', ?)`,
        )
        .bind(now),
      database.prepare(
        "INSERT INTO record_revision_sequences (record_id, organization_id, last_number) VALUES ('rfi-issue-mig', 'org-rfi-issue-mig', 1)",
      ),
      database
        .prepare(
          `INSERT INTO project_record_type_sequences
            (organization_id, project_id, record_type_key, last_number, updated_at)
           VALUES ('org-rfi-issue-mig', 'project-rfi-issue-mig', 'rfi', 7, ?)`,
        )
        .bind(now),
      database.prepare(
        `UPDATE records SET current_revision_id = 'rfi-issue-mig:revision'
           WHERE id = 'rfi-issue-mig'`,
      ),
    ]);

    await applyD1Migrations(
      database,
      env.TEST_MIGRATIONS.slice(14, 15),
      "d1_migrations_rfi_issue_populated",
    );
    const preserved = await database
      .prepare(
        `SELECT record.title, record.workflow_status, record.current_revision_id,
                details.question, sequence.last_number
         FROM records record
         JOIN rfi_details details ON details.record_id = record.id
         JOIN project_record_type_sequences sequence
           ON sequence.organization_id = record.organization_id
          AND sequence.project_id = record.project_id
          AND sequence.record_type_key = 'rfi'
         WHERE record.id = 'rfi-issue-mig'`,
      )
      .first<{
        title: string;
        workflow_status: string;
        current_revision_id: string;
        question: string;
        last_number: number;
      }>();
    expect(preserved).toEqual({
      title: "Existing RFI",
      workflow_status: "ready_to_issue",
      current_revision_id: "rfi-issue-mig:revision",
      question: "Existing question?",
      last_number: 7,
    });
    const issueCount = await database
      .prepare("SELECT COUNT(*) count FROM rfi_official_issues")
      .first<{ count: number }>();
    expect(issueCount?.count).toBe(0);
    expect(
      (await database.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
