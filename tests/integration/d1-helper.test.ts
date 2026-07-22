import { describe, expect, it } from "vitest";

import {
  applyTestMigrations,
  seedLegacyDocument,
  testDatabase,
} from "../helpers/d1";

describe("D1 repository test helpers", () => {
  it("applies migrations repeatably and exposes an isolated database", async () => {
    await applyTestMigrations();
    const db = testDatabase();
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('documents', 'folders', 'app_meta', 'projects', 'project_memberships', 'project_contacts') ORDER BY name",
      )
      .all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual([
      "app_meta",
      "documents",
      "folders",
      "project_contacts",
      "project_memberships",
      "projects",
    ]);

    const schemaVersion = await db
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(schemaVersion?.schema_version).toBe(11);
  });

  it("seeds definitions for future D1-backed repository tests", async () => {
    const id = await seedLegacyDocument({
      kind: "document",
      title: "Repository fixture",
      blocks: [],
    });
    const row = await testDatabase()
      .prepare("SELECT title FROM documents WHERE id = ?")
      .bind(id)
      .first<{ title: string }>();

    expect(row?.title).toBe("Repository fixture");
  });
});
