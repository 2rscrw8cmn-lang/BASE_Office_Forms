import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const mode = process.argv[2];
const previewDatabase = "base-office-forms-ui2-preview";
const previewDatabaseId = "c874725c-78d8-43d5-a1b8-5d4d26e52067";
const productionDatabase = "base-office-forms-library";
const previewFixture = {
  organizationId: "7a27fb84-3b74-4a18-8ef9-6b8cc859b664",
  userId: "f554d4d1-97b4-4e59-a299-8eaa59a22ed5",
  organizationMembershipId: "9e5e513f-d0cf-4130-a11d-e515b25bc0f4",
  projectId: "e2a4cefe-f5a0-4527-a22a-0caf2a32fc13",
  projectMembershipId: "4db664dc-4f67-4477-9f58-abc0a9fe12ee",
  recordId: "ee9f81db-4b75-4be7-aae5-d2eef5f16391",
  revisionId: "ef8a1723-3242-42f2-a276-9c761dc260f2",
  organizationName: "BASE UI Preview",
  projectName: "UI-2 Smoke Test",
  projectNumber: "UI2-001",
  recordTitle: "Preview Test Document",
};
const expectedMigrations = [
  "0001_shared_library.sql",
  "0002_schema_marker.sql",
  "0003_identity_and_organizations.sql",
  "0004_correct_identity_schema_metadata.sql",
  "0005_projects_and_project_contacts.sql",
  "0006_rfi_foundation.sql",
  "0007_records_foundation.sql",
  "0008_revisions_foundation.sql",
  "0009_files_foundation.sql",
  "0010_issuance_foundation.sql",
  "0011_templates_foundation.sql",
  "0012_project_record_sequences.sql",
];
const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const wranglerConfig = resolve("wrangler.ui2.jsonc");

function sql(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runWrangler(args, options = {}) {
  return execFileSync(
    process.execPath,
    [wranglerCli, "--config", wranglerConfig, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: options.json ? ["ignore", "pipe", "inherit"] : "inherit",
    },
  );
}

function queryDatabase(database, command, environment) {
  const args = ["d1", "execute", database, "--remote"];
  if (environment) args.push("--env", environment);
  args.push("--command", command, "--json");
  const output = JSON.parse(runWrangler(args, { json: true }));
  return output[0]?.results ?? [];
}

function executePreviewFile(sqlText) {
  const temporaryDirectory = mkdtempSync(
    resolve(tmpdir(), "base-ui2-preview-fixture-"),
  );
  const temporaryFile = resolve(temporaryDirectory, "fixture.sql");
  writeFileSync(temporaryFile, sqlText, "utf8");
  try {
    runWrangler([
      "d1",
      "execute",
      previewDatabase,
      "--remote",
      "--file",
      temporaryFile,
      "--yes",
    ]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertPreviewTarget() {
  if (!existsSync(wranglerCli)) {
    throw new Error("Local Wrangler is required; run npm install first.");
  }
  const configuration = readFileSync("wrangler.ui2.jsonc", "utf8");
  if (
    !configuration.includes(`\"database_name\": \"${previewDatabase}\"`) ||
    !configuration.includes(`\"database_id\": \"${previewDatabaseId}\"`)
  ) {
    throw new Error(
      "Refusing to run: wrangler.jsonc does not declare the pinned UI-2 preview D1 target.",
    );
  }
}

function assertMigrations() {
  const migrations = queryDatabase(
    previewDatabase,
    "SELECT name FROM d1_migrations ORDER BY id",
  ).map((row) => row.name);
  if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) {
    throw new Error(
      "Refusing to seed: preview migration ledger is not exactly UI-2 migrations 0001–0012.",
    );
  }
}

function resolveProductionIdentity() {
  const accessEmail = process.env.UI2_FIXTURE_EMAIL?.trim().toLowerCase();
  if (!accessEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail)) {
    throw new Error(
      "UI2_FIXTURE_EMAIL must contain the product owner's Cloudflare Access email.",
    );
  }

  // This workflow's only production operation is a parameter-safe identity read.
  const rows = queryDatabase(
    productionDatabase,
    `SELECT identity_subject, email, display_name
     FROM users
     WHERE lower(email) = ${sql(accessEmail)} AND status = 'active'`,
  );
  if (rows.length !== 1) {
    throw new Error(
      "Expected exactly one production identity for UI2_FIXTURE_EMAIL; no preview data was changed.",
    );
  }

  const identity = rows[0];
  if (
    typeof identity.identity_subject !== "string" ||
    typeof identity.email !== "string" ||
    typeof identity.display_name !== "string"
  ) {
    throw new Error(
      "Production identity is incomplete; no preview data was changed.",
    );
  }
  return identity;
}

function resolvePreviewUser(identity) {
  const rows = queryDatabase(
    previewDatabase,
    `SELECT id, identity_subject, email
     FROM users
     WHERE identity_subject = ${sql(identity.identity_subject)}
        OR lower(email) = ${sql(identity.email.toLowerCase())}`,
  );
  if (rows.length > 1) {
    throw new Error(
      "Refusing to seed: preview identity resolution is ambiguous.",
    );
  }
  if (
    rows.length === 1 &&
    (rows[0].identity_subject !== identity.identity_subject ||
      rows[0].email.toLowerCase() !== identity.email.toLowerCase())
  ) {
    throw new Error(
      "Refusing to seed: an unrelated preview user already owns this identity or email.",
    );
  }
  return rows[0]?.id ?? previewFixture.userId;
}

function seed() {
  assertPreviewTarget();
  assertMigrations();
  const identity = resolveProductionIdentity();
  const userId = resolvePreviewUser(identity);
  const now = new Date().toISOString();

  executePreviewFile(`
    PRAGMA foreign_keys = ON;
    INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at)
    VALUES (${sql(previewFixture.organizationId)}, ${sql(previewFixture.organizationName)}, 'base-ui-preview', 'active', '{}', ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, status = excluded.status, settings_json = excluded.settings_json, updated_at = excluded.updated_at;
    INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at)
    VALUES (${sql(userId)}, ${sql(identity.identity_subject)}, ${sql(identity.email)}, ${sql(identity.display_name)}, 'active', ${sql(now)}, ${sql(now)})
    ON CONFLICT(identity_subject) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, status = 'active', updated_at = excluded.updated_at;
    INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at)
    VALUES (${sql(previewFixture.organizationMembershipId)}, ${sql(previewFixture.organizationId)}, ${sql(userId)}, 'org_admin', 'active', ${sql(now)})
    ON CONFLICT(organization_id, user_id) DO UPDATE SET role = 'org_admin', status = 'active';
    INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at)
    VALUES (${sql(previewFixture.projectId)}, ${sql(previewFixture.organizationId)}, ${sql(previewFixture.projectNumber)}, ${sql(previewFixture.projectName)}, 'active', 'America/New_York', ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET project_number = excluded.project_number, name = excluded.name, status = 'active', timezone = excluded.timezone, updated_at = excluded.updated_at, archived_at = NULL;
    INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at)
    VALUES (${sql(previewFixture.projectMembershipId)}, ${sql(previewFixture.organizationId)}, ${sql(previewFixture.projectId)}, ${sql(userId)}, 'project_manager', 'active', ${sql(now)})
    ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'project_manager', status = 'active';
    INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, description, status, discipline, source, created_by, current_revision_id, archived_at, created_at, updated_at)
    VALUES (${sql(previewFixture.recordId)}, ${sql(previewFixture.organizationId)}, ${sql(previewFixture.projectId)}, 'document', 'UI2-DOC-001', ${sql(previewFixture.recordTitle)}, 'Synthetic UI-2 preview fixture only.', 'active', 'General', 'Preview fixture', ${sql(userId)}, NULL, NULL, ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET record_number = excluded.record_number, title = excluded.title, description = excluded.description, status = 'active', discipline = excluded.discipline, source = excluded.source, created_by = excluded.created_by, archived_at = NULL, updated_at = excluded.updated_at;
    INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, revision_label, title, description, discipline, source, change_summary, status, created_by, created_at)
    VALUES (${sql(previewFixture.revisionId)}, ${sql(previewFixture.organizationId)}, ${sql(previewFixture.projectId)}, ${sql(previewFixture.recordId)}, 1, 'P0', ${sql(previewFixture.recordTitle)}, 'Synthetic UI-2 preview fixture only.', 'General', 'Preview fixture', 'Initial synthetic smoke-test revision.', 'draft', ${sql(userId)}, ${sql(now)})
    ON CONFLICT(record_id, revision_number) DO UPDATE SET revision_label = excluded.revision_label, title = excluded.title, description = excluded.description, discipline = excluded.discipline, source = excluded.source, change_summary = excluded.change_summary, status = 'draft', created_by = excluded.created_by;
    UPDATE records SET current_revision_id = ${sql(previewFixture.revisionId)}, updated_at = ${sql(now)}
      WHERE id = ${sql(previewFixture.recordId)} AND organization_id = ${sql(previewFixture.organizationId)};
  `);

  verify(userId);
  console.log(
    `UI-2 preview fixture is ready: ${previewFixture.organizationId} / ${previewFixture.projectId} / ${previewFixture.recordId} / ${previewFixture.revisionId}.`,
  );
}

function verify(userId) {
  const membership = queryDatabase(
    previewDatabase,
    `SELECT om.role AS organization_role, pm.role AS project_role
     FROM users u
     JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'active'
     JOIN project_memberships pm ON pm.user_id = u.id AND pm.organization_id = om.organization_id AND pm.status = 'active'
     WHERE u.id = ${sql(userId)} AND u.status = 'active' AND om.organization_id = ${sql(previewFixture.organizationId)} AND pm.project_id = ${sql(previewFixture.projectId)}`,
  );
  if (
    membership.length !== 1 ||
    membership[0].organization_role !== "org_admin" ||
    membership[0].project_role !== "project_manager"
  ) {
    throw new Error("Preview fixture memberships did not resolve as required.");
  }
  const dashboard = queryDatabase(
    previewDatabase,
    `SELECT
       (SELECT COUNT(*) FROM record_revisions rev JOIN records rec ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id WHERE rev.organization_id = ${sql(previewFixture.organizationId)} AND rev.status = 'draft' AND rec.status = 'active' AND rev.project_id = ${sql(previewFixture.projectId)}) AS draft_revision_count,
       (SELECT COUNT(*) FROM rfi_records WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)} AND status IN ('issued', 'answered')) AS active_rfi_count,
       (SELECT COUNT(*) FROM revision_files WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)}) AS recent_file_count,
       (SELECT COUNT(*) FROM issuances WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)}) AS recent_issuance_count`,
  );
  if (dashboard.length !== 1 || dashboard[0].draft_revision_count !== 1) {
    throw new Error(
      "Dashboard verification query did not return the synthetic draft revision.",
    );
  }
  const overview = queryDatabase(
    previewDatabase,
    `SELECT
       (SELECT COUNT(*) FROM records WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)} AND status = 'active') AS records,
       (SELECT COUNT(*) FROM record_revisions rev JOIN records rec ON rec.id = rev.record_id AND rec.organization_id = rev.organization_id WHERE rev.organization_id = ${sql(previewFixture.organizationId)} AND rev.project_id = ${sql(previewFixture.projectId)} AND rev.status = 'draft' AND rec.status = 'active') AS draft_revisions,
       (SELECT COUNT(*) FROM rfi_records WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)} AND status IN ('issued', 'answered')) AS active_rfis,
       (SELECT COUNT(*) FROM project_memberships WHERE organization_id = ${sql(previewFixture.organizationId)} AND project_id = ${sql(previewFixture.projectId)} AND status = 'active') AS team_members`,
  );
  if (
    overview.length !== 1 ||
    overview[0].records !== 1 ||
    overview[0].draft_revisions !== 1 ||
    overview[0].active_rfis !== 0 ||
    overview[0].team_members !== 1
  ) {
    throw new Error(
      "Project Overview verification query did not return the expected fixture state.",
    );
  }
  const records = queryDatabase(
    previewDatabase,
    `SELECT r.id FROM records r LEFT JOIN record_revisions cur ON cur.id = r.current_revision_id AND cur.organization_id = r.organization_id AND cur.record_id = r.id
     WHERE r.organization_id = ${sql(previewFixture.organizationId)} AND r.project_id = ${sql(previewFixture.projectId)} AND r.status = 'active' AND r.id = ${sql(previewFixture.recordId)}`,
  );
  if (records.length !== 1) {
    throw new Error(
      "Records verification query did not return the synthetic record.",
    );
  }
  assertMigrations();
}

function cleanup() {
  assertPreviewTarget();
  executePreviewFile(`
    PRAGMA foreign_keys = ON;
    UPDATE records SET current_revision_id = NULL WHERE id = ${sql(previewFixture.recordId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM record_revisions WHERE id = ${sql(previewFixture.revisionId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM records WHERE id = ${sql(previewFixture.recordId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM project_memberships WHERE id = ${sql(previewFixture.projectMembershipId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM projects WHERE id = ${sql(previewFixture.projectId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM organization_memberships WHERE id = ${sql(previewFixture.organizationMembershipId)} AND organization_id = ${sql(previewFixture.organizationId)};
    DELETE FROM organizations WHERE id = ${sql(previewFixture.organizationId)};
    DELETE FROM users WHERE id = ${sql(previewFixture.userId)} AND NOT EXISTS (SELECT 1 FROM organization_memberships WHERE user_id = ${sql(previewFixture.userId)});
  `);
  console.log(
    "UI-2 preview fixture cleanup completed for deterministic synthetic rows only.",
  );
}

if (mode === "seed") {
  seed();
} else if (mode === "cleanup") {
  cleanup();
} else {
  throw new Error("Usage: node scripts/ui2-preview-fixture.mjs <seed|cleanup>");
}
