import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The real migration file. Executed against a legacy-seeded database so this
// test proves the 0013 rebuild preserves existing RFI data, maps the legacy
// statuses, and never trips a foreign-key constraint — the failure that left
// the PR preview's database on the old schema.
const MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL(
      "../../migrations/0013_rfi_slice1_register_workspace.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

// Minimal structural type for the slice of node:sqlite we use, so this test
// does not depend on the experimental module's ambient type definitions.
interface SqliteStatement {
  all(): unknown[];
  get(): unknown;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
type SqliteCtor = new (path: string) => SqliteDatabase;

// node:sqlite is experimental; skip gracefully where it is unavailable (older
// Node, or without --experimental-sqlite) so CI never breaks, while still
// running locally on Node that ships it.
let sqliteCtor: SqliteCtor | null = null;
try {
  const mod: unknown = createRequire(import.meta.url)("node:sqlite");
  sqliteCtor = (mod as { DatabaseSync: SqliteCtor }).DatabaseSync;
} catch {
  sqliteCtor = null;
}

function legacyDatabase(Ctor: SqliteCtor): SqliteDatabase {
  const db = new Ctor(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_meta (id INTEGER PRIMARY KEY, schema_version INTEGER);
    INSERT INTO app_meta (id, schema_version) VALUES (1, 5);
    CREATE TABLE projects (id TEXT, organization_id TEXT, project_number TEXT,
      name TEXT, status TEXT, timezone TEXT, created_at TEXT, updated_at TEXT,
      PRIMARY KEY (id), UNIQUE (id, organization_id));
    CREATE TABLE organization_memberships (id TEXT PRIMARY KEY, organization_id TEXT,
      user_id TEXT, role TEXT, status TEXT, created_at TEXT,
      UNIQUE (organization_id, user_id));
    CREATE TABLE template_versions (id TEXT PRIMARY KEY, organization_id TEXT,
      UNIQUE (id, organization_id));
    CREATE TABLE rfi_records (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
      rfi_number TEXT,
      status TEXT NOT NULL CHECK (status IN ('draft','issued','answered','closed')) DEFAULT 'draft',
      title TEXT NOT NULL, question TEXT NOT NULL, suggested_resolution TEXT,
      submitted_by TEXT, assigned_to TEXT, due_date TEXT, cost_impact TEXT,
      schedule_impact TEXT, issued_at TEXT, answered_at TEXT, closed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
      UNIQUE (id, organization_id), UNIQUE (project_id, rfi_number));
    CREATE TABLE rfi_responses (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, rfi_id TEXT NOT NULL,
      response TEXT NOT NULL, responded_by TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (rfi_id, organization_id) REFERENCES rfi_records(id, organization_id) ON DELETE RESTRICT,
      UNIQUE (rfi_id));
    INSERT INTO projects VALUES ('p1','o1','P-1','Proj','active','UTC','t','t');
    INSERT INTO rfi_records (id,organization_id,project_id,rfi_number,status,title,question,assigned_to,due_date,issued_at,created_at,updated_at)
      VALUES ('rfi1','o1','p1','RFI-001','issued','Old subject','Q?','Architect','2026-08-01','2026-07-10','c1','u1');
    INSERT INTO rfi_records (id,organization_id,project_id,rfi_number,status,title,question,answered_at,created_at,updated_at)
      VALUES ('rfi2','o1','p1','RFI-002','answered','Old subject 2','Q2?','2026-07-11','c2','u2');
    INSERT INTO rfi_records (id,organization_id,project_id,status,title,question,created_at,updated_at)
      VALUES ('rfi3','o1','p1','draft','Draft subject','Q3?','c3','u3');
    INSERT INTO rfi_responses VALUES ('resp1','o1','rfi2','An answer','arch','r1');
  `);
  return db;
}

describe.skipIf(!sqliteCtor)("migration 0013 data transform", () => {
  it("preserves rows, maps legacy statuses, and keeps responses (FK-safe)", () => {
    const Ctor = sqliteCtor;
    if (!Ctor) return;
    const db = legacyDatabase(Ctor);
    // Mirror how D1 runs a migration: inside a transaction (so PRAGMA
    // foreign_keys is a no-op) with foreign-key enforcement on.
    db.exec("BEGIN");
    db.exec(MIGRATION_SQL);
    db.exec("COMMIT");

    const rows = db
      .prepare("SELECT id, status, subject FROM rfi_records ORDER BY id")
      .all() as { id: string; status: string; subject: string }[];
    expect(rows).toEqual([
      { id: "rfi1", status: "open", subject: "Old subject" },
      { id: "rfi2", status: "response_received", subject: "Old subject 2" },
      { id: "rfi3", status: "draft", subject: "Draft subject" },
    ]);

    // Legacy fields mapped onto the new columns.
    const rfi1 = db
      .prepare(
        "SELECT responsible_party, requested_response_date, lock_version FROM rfi_records WHERE id = 'rfi1'",
      )
      .get() as {
      responsible_party: string;
      requested_response_date: string;
      lock_version: number;
    };
    expect(rfi1.responsible_party).toBe("Architect");
    expect(rfi1.requested_response_date).toBe("2026-08-01");
    expect(rfi1.lock_version).toBe(1);

    // The response survived the parent rebuild.
    const responses = db
      .prepare("SELECT id, rfi_id FROM rfi_responses")
      .all() as { id: string; rfi_id: string }[];
    expect(responses).toEqual([{ id: "resp1", rfi_id: "rfi2" }]);

    // New table + schema version.
    const attachments = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rfi_attachments'",
      )
      .get();
    expect(attachments).toBeTruthy();
    const version = db
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .get() as { schema_version: number };
    expect(version.schema_version).toBe(11);
  });

  it("demonstrates why staging is required: a naive parent drop fails", () => {
    const Ctor = sqliteCtor;
    if (!Ctor) return;
    const db = legacyDatabase(Ctor);
    db.exec("BEGIN");
    // RESTRICT is checked immediately even inside a transaction, so dropping the
    // referenced parent while a response exists raises a FK error. This is the
    // exact failure the staged rebuild in 0013 avoids.
    expect(() => {
      db.exec("DROP TABLE rfi_records");
    }).toThrow(/FOREIGN KEY constraint failed/);
    db.exec("ROLLBACK");
  });
});
