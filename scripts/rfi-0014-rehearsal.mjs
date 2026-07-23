import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseName = "base-office-forms-rfi-0014-rehearsal";
const databaseId = "e88f15e9-b648-49d1-bded-bed1996bdbd9";
const configPath = resolve("wrangler.rfi-rehearsal.jsonc");
const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const sourceMigrations = [
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
  "0013_rfi_slice1_register_workspace.sql",
];
const alignmentMigration = "0014_rfi_document_control_alignment.sql";

function assertTarget() {
  const config = readFileSync(configPath, "utf8");
  if (
    !config.includes(`\"database_name\": \"${databaseName}\"`) ||
    !config.includes(`\"database_id\": \"${databaseId}\"`)
  ) {
    throw new Error(
      "Refusing rehearsal: its checked-in config no longer pins the disposable database.",
    );
  }
}

function run(args, json = false) {
  return execFileSync(
    process.execPath,
    [wranglerCli, "--config", configPath, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
    },
  );
}

function execute(command, json = false) {
  return run(
    [
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--command",
      command,
      "--yes",
      ...(json ? ["--json"] : []),
    ],
    json,
  );
}

function ledger() {
  return (
    JSON.parse(
      execute("SELECT name FROM d1_migrations ORDER BY id", true),
    )[0]?.results?.map((row) => row.name) ?? []
  );
}

function apply(name) {
  const path = resolve("migrations", name);
  if (!existsSync(path))
    throw new Error(`Missing rehearsal migration: ${name}`);
  run(["d1", "execute", databaseName, "--remote", "--file", path, "--yes"]);
  execute(`INSERT INTO d1_migrations (name) VALUES ('${name}')`);
}

function queryOne(sql) {
  return JSON.parse(execute(sql, true))[0]?.results?.[0] ?? {};
}

function assertVerification() {
  const row = queryOne(`SELECT
    (SELECT COUNT(*) FROM rfi_0014_reconciliation) AS reconciliation_rows,
    (SELECT COUNT(*) FROM records WHERE id IN ('rfi-0014-issued', 'rfi-0014-draft') AND record_type_key = 'rfi') AS rfi_records,
    (SELECT COUNT(*) FROM rfi_details WHERE record_id IN ('rfi-0014-issued', 'rfi-0014-draft')) AS details_rows,
    (SELECT COUNT(*) FROM record_revisions WHERE id IN ('rfi-0014-issued:rfi-draft-v1', 'rfi-0014-draft:rfi-draft-v1') AND status = 'draft') AS draft_revisions,
    (SELECT COUNT(*) FROM rfi_responses WHERE id = 'rfi-0014-response' AND record_id = 'rfi-0014-issued') AS preserved_responses,
    (SELECT COUNT(*) FROM revision_files WHERE id = 'rfi-0014-attachment' AND record_id = 'rfi-0014-issued' AND revision_id = 'rfi-0014-issued:rfi-draft-v1' AND role = 'reference_drawing' AND storage_key = 'organizations/rfi-0014-org/projects/rfi-0014-project/rfis/rfi-0014-issued/attachments/rfi-0014-attachment' AND sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') AS preserved_files,
    (SELECT COUNT(*) FROM records WHERE id = 'rfi-0014-issued' AND current_responsible_contact_id = 'rfi-0014-contact' AND responsible_party_legacy_text IS NULL) AS resolved_party,
    (SELECT COUNT(*) FROM records WHERE id = 'rfi-0014-draft' AND current_responsible_contact_id IS NULL AND responsible_party_legacy_text = 'Unmatched Consultant') AS unresolved_party,
    (SELECT COUNT(*) FROM rfi_0014_reconciliation map LEFT JOIN records r ON r.id = map.record_id LEFT JOIN rfi_details d ON d.record_id = map.record_id LEFT JOIN record_revisions v ON v.id = map.draft_revision_id WHERE r.id IS NULL OR d.record_id IS NULL OR v.id IS NULL) AS orphan_reconciliation,
    (SELECT COUNT(*) FROM rfi_details d LEFT JOIN records r ON r.id = d.record_id WHERE r.id IS NULL) AS orphan_details,
    (SELECT COUNT(*) FROM record_revisions v LEFT JOIN records r ON r.id = v.record_id WHERE v.id LIKE 'rfi-0014-%' AND r.id IS NULL) AS orphan_revisions,
    (SELECT COUNT(*) FROM revision_files f LEFT JOIN record_revisions v ON v.id = f.revision_id WHERE f.id = 'rfi-0014-attachment' AND v.id IS NULL) AS orphan_files,
    (SELECT COUNT(*) FROM records r JOIN rfi_details d ON d.record_id = r.id WHERE r.organization_id = 'rfi-0014-org' AND r.project_id = 'rfi-0014-project' AND r.record_type_key = 'rfi') AS dashboard_rfi_model,
    (SELECT COUNT(*) FROM records r JOIN rfi_details d ON d.record_id = r.id WHERE r.organization_id = 'rfi-0014-org' AND r.project_id = 'rfi-0014-project' AND r.record_type_key = 'rfi') AS overview_rfi_model,
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('rfi_records', 'rfi_attachments', 'rfi_number_sequences')) AS legacy_tables,
    (SELECT COUNT(*) FROM d1_migrations) AS migration_count,
    (SELECT last_number FROM project_record_type_sequences WHERE organization_id = 'rfi-0014-org' AND project_id = 'rfi-0014-project' AND record_type_key = 'rfi') AS consumed_sequence;`);
  const expected = {
    reconciliation_rows: 2,
    rfi_records: 2,
    details_rows: 2,
    draft_revisions: 2,
    preserved_responses: 1,
    preserved_files: 1,
    resolved_party: 1,
    unresolved_party: 1,
    orphan_reconciliation: 0,
    orphan_details: 0,
    orphan_revisions: 0,
    orphan_files: 0,
    dashboard_rfi_model: 2,
    overview_rfi_model: 2,
    legacy_tables: 0,
    migration_count: 14,
    consumed_sequence: 4,
  };
  for (const [key, value] of Object.entries(expected))
    if (Number(row[key]) !== value)
      throw new Error(
        `Rehearsal assertion failed: ${key} expected ${value}, got ${row[key]}.`,
      );
  console.log(
    "RFI 0014 populated-data rehearsal passed: 2 stable records, details, drafts, response, file metadata, Party resolution, and reconciliation are intact.",
  );
}

function cleanup() {
  execute(`BEGIN;
    UPDATE records SET current_revision_id = NULL WHERE id IN ('rfi-0014-issued', 'rfi-0014-draft');
    DELETE FROM rfi_responses WHERE id = 'rfi-0014-response';
    DELETE FROM rfi_0014_reconciliation WHERE legacy_rfi_id IN ('rfi-0014-issued', 'rfi-0014-draft');
    DELETE FROM revision_files WHERE id = 'rfi-0014-attachment';
    DELETE FROM record_revision_sequences WHERE record_id IN ('rfi-0014-issued', 'rfi-0014-draft');
    DELETE FROM record_revisions WHERE id IN ('rfi-0014-issued:rfi-draft-v1', 'rfi-0014-draft:rfi-draft-v1');
    DELETE FROM rfi_details WHERE record_id IN ('rfi-0014-issued', 'rfi-0014-draft');
    DELETE FROM records WHERE id IN ('rfi-0014-issued', 'rfi-0014-draft');
    DELETE FROM project_record_type_sequences WHERE organization_id = 'rfi-0014-org' AND project_id = 'rfi-0014-project';
    DELETE FROM template_version_sequences WHERE template_id = 'rfi-0014-template';
    DELETE FROM template_versions WHERE id = 'rfi-0014-template-v1';
    DELETE FROM templates WHERE id = 'rfi-0014-template';
    DELETE FROM project_memberships WHERE id = 'rfi-0014-project-membership';
    DELETE FROM project_contacts WHERE id = 'rfi-0014-contact';
    DELETE FROM projects WHERE id = 'rfi-0014-project';
    DELETE FROM organization_memberships WHERE id = 'rfi-0014-org-membership';
    DELETE FROM users WHERE id = 'rfi-0014-user';
    DELETE FROM organizations WHERE id = 'rfi-0014-org';
  COMMIT;`);
  console.log(
    "RFI 0014 rehearsal fixture cleanup completed (migrations remain for audit).",
  );
}

if (!existsSync(wranglerCli))
  throw new Error("Local Wrangler is required; run npm install first.");
assertTarget();
if (process.argv[2] === "cleanup") cleanup();
else {
  execute(
    "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const applied = new Set(ledger());
  for (const migration of sourceMigrations)
    if (!applied.has(migration)) apply(migration);
  if (!ledger().includes(alignmentMigration)) {
    run([
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--file",
      resolve("scripts", "fixtures", "rfi-0014-legacy-fixture.sql"),
      "--yes",
    ]);
    apply(alignmentMigration);
  }
  assertVerification();
}
