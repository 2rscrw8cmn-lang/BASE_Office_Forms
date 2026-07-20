import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

const MIGRATION_TABLE = "d1_migrations_files_test";

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

describe("files migration 0009", () => {
  it("adds revision_files at schema version 8 without disturbing existing data or leaving foreign-key violations", async () => {
    const database = testDatabase();
    const migrations = env.TEST_MIGRATIONS;
    expect(migrations.length).toBeGreaterThanOrEqual(9);

    await resetToEmptyDatabase();

    // Apply only migrations 0001-0008, landing on schema version 7.
    await applyD1Migrations(database, migrations.slice(0, 8), MIGRATION_TABLE);
    const versionBefore = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionBefore?.schema_version).toBe(7);

    const now = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-files-mig', 'Files Migration Org', 'files-migration-org', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-files-mig', 'identity|files-mig', 'files-mig@example.test', 'Files Migration User', 'active', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-files-mig', 'org-files-mig', 'user-files-mig', 'org_admin', 'active', ?)",
        )
        .bind(now),
      database
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-files-mig', 'org-files-mig', 'P-FILES-MIG', 'Files Migration Project', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-files-mig', 'org-files-mig', 'project-files-mig', 'document', 'Pre-existing Record', 'active', 'user-files-mig', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-files-mig', 'org-files-mig', 'project-files-mig', 'record-files-mig', 1, 'Pre-existing Record', 'Initial issue', 'draft', 'user-files-mig', ?)",
        )
        .bind(now),
    ]);

    // Apply migration 0009 alone.
    await applyD1Migrations(database, migrations.slice(8, 9), MIGRATION_TABLE);

    const versionAfter = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionAfter?.schema_version).toBe(8);

    const newTables = await database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'revision_files'",
      )
      .all<{ name: string }>();
    expect(newTables.results.map((row) => row.name)).toEqual([
      "revision_files",
    ]);

    // Pre-existing data survives untouched.
    const revision = await database
      .prepare(
        "SELECT title, status FROM record_revisions WHERE id = 'revision-files-mig'",
      )
      .first<{ title: string; status: string }>();
    expect(revision).toEqual({ title: "Pre-existing Record", status: "draft" });

    // A valid file row referencing the real hierarchy succeeds.
    await expect(
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-valid', 'org-files-mig', 'project-files-mig', 'record-files-mig',
             'revision-files-mig', 'organizations/org-files-mig/projects/project-files-mig/records/record-files-mig/revisions/revision-files-mig/files/file-valid',
             'plan.pdf', 'application/pdf', 1024,
             '${"a".repeat(64)}', 'user-files-mig', ?)`,
        )
        .bind(now)
        .run(),
    ).resolves.toBeDefined();

    // storage_key is globally unique.
    await expect(
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-dup-key', 'org-files-mig', 'project-files-mig', 'record-files-mig',
             'revision-files-mig', 'organizations/org-files-mig/projects/project-files-mig/records/record-files-mig/revisions/revision-files-mig/files/file-valid',
             'plan2.pdf', 'application/pdf', 2048,
             '${"b".repeat(64)}', 'user-files-mig', ?)`,
        )
        .bind(now)
        .run(),
    ).rejects.toThrow();

    // A revision that does not belong to the same record is rejected.
    await expect(
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-wrong-revision', 'org-files-mig', 'project-files-mig', 'record-files-mig',
             'does-not-exist', 'organizations/org-files-mig/projects/project-files-mig/records/record-files-mig/revisions/does-not-exist/files/file-wrong-revision',
             'plan.pdf', 'application/pdf', 1024,
             '${"c".repeat(64)}', 'user-files-mig', ?)`,
        )
        .bind(now)
        .run(),
    ).rejects.toThrow();

    // A creator who is not a member of the organization is rejected.
    await expect(
      database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES ('file-bad-uploader', 'org-files-mig', 'project-files-mig', 'record-files-mig',
             'revision-files-mig', 'organizations/org-files-mig/projects/project-files-mig/records/record-files-mig/revisions/revision-files-mig/files/file-bad-uploader',
             'plan.pdf', 'application/pdf', 1024,
             '${"d".repeat(64)}', 'missing-user', ?)`,
        )
        .bind(now)
        .run(),
    ).rejects.toThrow();

    // No unresolved foreign-key violations remain anywhere in the database.
    const violations = await database.prepare("PRAGMA foreign_key_check").all();
    expect(violations.results).toEqual([]);
  });
});
