import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { testDatabase } from "../helpers/d1";

const MIGRATION_TABLE = "d1_migrations_revisions_test";

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

describe("revisions migration 0008", () => {
  it("rebuilds records from schema version 6 without losing data or leaving foreign-key violations", async () => {
    const database = testDatabase();
    const migrations = env.TEST_MIGRATIONS;
    expect(migrations.length).toBeGreaterThanOrEqual(8);

    await resetToEmptyDatabase();

    // Apply only migrations 0001-0007, landing on schema version 6.
    await applyD1Migrations(database, migrations.slice(0, 7), MIGRATION_TABLE);
    const versionBefore = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionBefore?.schema_version).toBe(6);

    // Seed a pre-existing record under the schema-version-6 shape.
    const now = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-mig', 'Migration Org', 'migration-org', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-mig', 'identity|mig', 'mig@example.test', 'Migration User', 'active', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-mig', 'org-mig', 'user-mig', 'org_admin', 'active', ?)",
        )
        .bind(now),
      database
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-mig', 'org-mig', 'P-MIG', 'Migration Project', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, description, status, discipline, source, created_by, created_at, updated_at) VALUES ('record-mig', 'org-mig', 'project-mig', 'document', 'LEGACY-1', 'Pre-existing Record', 'Existed before 0008', 'active', 'Structural', 'Field', 'user-mig', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-mig-other', 'org-mig', 'project-mig', 'document', 'Other Record', 'active', 'user-mig', ?, ?)",
        )
        .bind(now, now),
    ]);

    // Apply migration 0008 alone.
    await applyD1Migrations(database, migrations.slice(7, 8), MIGRATION_TABLE);

    const versionAfter = await database
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(versionAfter?.schema_version).toBe(7);

    // The pre-existing record survives the rebuild intact.
    const record = await database
      .prepare(
        "SELECT record_type, record_number, title, description, status, discipline, source, created_by, current_revision_id FROM records WHERE id = 'record-mig'",
      )
      .first<{
        record_type: string;
        record_number: string;
        title: string;
        description: string;
        status: string;
        discipline: string;
        source: string;
        created_by: string;
        current_revision_id: string | null;
      }>();
    expect(record).toEqual({
      record_type: "document",
      record_number: "LEGACY-1",
      title: "Pre-existing Record",
      description: "Existed before 0008",
      status: "active",
      discipline: "Structural",
      source: "Field",
      created_by: "user-mig",
      current_revision_id: null,
    });

    // The new revision tables exist.
    const newTables = await database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('record_revisions', 'record_revision_sequences') ORDER BY name",
      )
      .all<{ name: string }>();
    expect(newTables.results.map((row) => row.name)).toEqual([
      "record_revision_sequences",
      "record_revisions",
    ]);

    // records.current_revision_id enforces same-record, same-organization integrity.
    await database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-mig', 'org-mig', 'project-mig', 'record-mig', 1, 'Pre-existing Record', 'Initial issue', 'draft', 'user-mig', ?)",
      )
      .bind(now)
      .run();

    await expect(
      database
        .prepare(
          "UPDATE records SET current_revision_id = 'revision-mig' WHERE id = 'record-mig'",
        )
        .run(),
    ).resolves.toBeDefined();

    await expect(
      database
        .prepare(
          "UPDATE records SET current_revision_id = 'does-not-exist' WHERE id = 'record-mig'",
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare(
          "UPDATE records SET current_revision_id = 'revision-mig' WHERE id = 'record-mig-other'",
        )
        .run(),
    ).rejects.toThrow();

    await database
      .prepare(
        "UPDATE records SET current_revision_id = NULL WHERE id = 'record-mig'",
      )
      .run();

    // No unresolved foreign-key violations remain anywhere in the rebuilt database.
    const violations = await database.prepare("PRAGMA foreign_key_check").all();
    expect(violations.results).toEqual([]);
  });
});
