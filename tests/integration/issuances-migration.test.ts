import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

const MIGRATION_TABLE = "d1_migrations_issuance_test";

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

describe("issuance migration 0010", () => {
  it("adds immutable issuance tables at schema version 9 with hierarchy integrity", async () => {
    const database = testDatabase();
    const migrations = env.TEST_MIGRATIONS;
    expect(migrations.length).toBeGreaterThanOrEqual(10);
    await resetToEmptyDatabase();
    await applyD1Migrations(database, migrations.slice(0, 9), MIGRATION_TABLE);

    const versionBefore = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionBefore?.schema_version).toBe(8);

    const now = "2026-07-20T12:00:00.000Z";
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-issue-mig', 'Issuance Org', 'issuance-org', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-issue-mig', 'identity|issue-mig', 'issue@example.test', 'Issue User', 'active', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-issue-mig', 'org-issue-mig', 'user-issue-mig', 'org_admin', 'active', ?)",
        )
        .bind(now),
      database
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-issue-a', 'org-issue-mig', 'P-ISSUE-A', 'Project A', 'active', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-issue-b', 'org-issue-mig', 'P-ISSUE-B', 'Project B', 'active', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-issue-a', 'org-issue-mig', 'project-issue-a', 'drawing', 'Existing Record', 'active', 'user-issue-mig', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-issue-b', 'org-issue-mig', 'project-issue-a', 'drawing', 'Other Record', 'active', 'user-issue-mig', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-issue-a', 'org-issue-mig', 'project-issue-a', 'record-issue-a', 1, 'Existing Record', 'Initial', 'published', 'user-issue-mig', ?)",
        )
        .bind(now),
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-issue-b', 'org-issue-mig', 'project-issue-a', 'record-issue-b', 1, 'Other Record', 'Initial', 'published', 'user-issue-mig', ?)",
        )
        .bind(now),
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-issue-a', 'org-issue-mig', 'project-issue-a', 'record-issue-a',
             'revision-issue-a', 'private/file-issue-a', 'a.pdf', 'application/pdf',
             10, '${"a".repeat(64)}', 'user-issue-mig', ?)`,
        )
        .bind(now),
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-issue-b', 'org-issue-mig', 'project-issue-a', 'record-issue-b',
             'revision-issue-b', 'private/file-issue-b', 'b.pdf', 'application/pdf',
             20, '${"b".repeat(64)}', 'user-issue-mig', ?)`,
        )
        .bind(now),
    ]);

    await applyD1Migrations(database, migrations.slice(9, 10), MIGRATION_TABLE);

    const versionAfter = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionAfter?.schema_version).toBe(9);
    const tables = await database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('issuances', 'issuance_files', 'project_issuance_sequences') ORDER BY name",
      )
      .all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual([
      "issuance_files",
      "issuances",
      "project_issuance_sequences",
    ]);

    const preserved = await database
      .prepare("SELECT title FROM records WHERE id = 'record-issue-a'")
      .first<{ title: string }>();
    expect(preserved?.title).toBe("Existing Record");

    const snapshot = JSON.stringify({ id: "revision-issue-a" });
    await database
      .prepare(
        `INSERT INTO issuances
          (id, organization_id, project_id, record_id, revision_id, issue_number,
           issue_sequence, purpose, notes, revision_snapshot_json, issued_by,
           issued_at, correlation_id)
         VALUES ('issuance-valid', 'org-issue-mig', 'project-issue-a', 'record-issue-a',
           'revision-issue-a', 'ISS-001', 1, 'for_construction', NULL, ?,
           'user-issue-mig', ?, 'request-1')`,
      )
      .bind(snapshot, now)
      .run();
    await database
      .prepare(
        `INSERT INTO issuance_files
          (issuance_id, organization_id, project_id, record_id, revision_id, file_id,
           original_filename, media_type, byte_size, sha256, storage_key, display_order)
         VALUES ('issuance-valid', 'org-issue-mig', 'project-issue-a', 'record-issue-a',
           'revision-issue-a', 'file-issue-a', 'a.pdf', 'application/pdf', 10,
           '${"a".repeat(64)}', 'private/file-issue-a', 0)`,
      )
      .run();

    await expect(
      database
        .prepare(
          `INSERT INTO issuances
            (id, organization_id, project_id, record_id, revision_id, issue_number,
             issue_sequence, purpose, revision_snapshot_json, issued_by, issued_at, correlation_id)
           VALUES ('issuance-wrong-project', 'org-issue-mig', 'project-issue-b',
             'record-issue-a', 'revision-issue-a', 'ISS-001', 1, 'for_review', ?,
             'user-issue-mig', ?, 'request-2')`,
        )
        .bind(snapshot, now)
        .run(),
    ).rejects.toThrow();
    await expect(
      database
        .prepare(
          `INSERT INTO issuances
            (id, organization_id, project_id, record_id, revision_id, issue_number,
             issue_sequence, purpose, revision_snapshot_json, issued_by, issued_at, correlation_id)
           VALUES ('issuance-wrong-revision', 'org-issue-mig', 'project-issue-a',
             'record-issue-a', 'revision-issue-b', 'ISS-002', 2, 'for_review', ?,
             'user-issue-mig', ?, 'request-3')`,
        )
        .bind(snapshot, now)
        .run(),
    ).rejects.toThrow();
    await expect(
      database
        .prepare(
          `INSERT INTO issuances
            (id, organization_id, project_id, record_id, revision_id, issue_number,
             issue_sequence, purpose, revision_snapshot_json, issued_by, issued_at, correlation_id)
           VALUES ('issuance-bad-issuer', 'org-issue-mig', 'project-issue-a',
             'record-issue-a', 'revision-issue-a', 'ISS-002', 2, 'for_review', ?,
             'missing-user', ?, 'request-4')`,
        )
        .bind(snapshot, now)
        .run(),
    ).rejects.toThrow();
    await expect(
      database
        .prepare(
          `INSERT INTO issuance_files
            (issuance_id, organization_id, project_id, record_id, revision_id, file_id,
             original_filename, media_type, byte_size, sha256, storage_key, display_order)
           VALUES ('issuance-valid', 'org-issue-mig', 'project-issue-a', 'record-issue-a',
             'revision-issue-a', 'file-issue-b', 'b.pdf', 'application/pdf', 20,
             '${"b".repeat(64)}', 'private/file-issue-b', 1)`,
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare(
          "UPDATE issuances SET purpose = 'for_review' WHERE id = 'issuance-valid'",
        )
        .run(),
    ).rejects.toThrow(/immutable/);
    await expect(
      database
        .prepare(
          "DELETE FROM issuance_files WHERE issuance_id = 'issuance-valid'",
        )
        .run(),
    ).rejects.toThrow(/immutable/);

    const violations = await database.prepare("PRAGMA foreign_key_check").all();
    expect(violations.results).toEqual([]);
  });
});
