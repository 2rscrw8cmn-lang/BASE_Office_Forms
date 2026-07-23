import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const previewDatabase = "base-office-forms-rfi-preview";
const previewMigrations = [
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
  "0014_rfi_document_control_alignment.sql",
];
const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");

function run(args, json = false) {
  return execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

if (!existsSync(wranglerCli))
  throw new Error("Local Wrangler is required; run npm install first.");
run([
  "d1",
  "execute",
  previewDatabase,
  "--remote",
  "--env",
  "preview",
  "--command",
  "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "--yes",
]);
const ledger = JSON.parse(
  run(
    [
      "d1",
      "execute",
      previewDatabase,
      "--remote",
      "--env",
      "preview",
      "--command",
      "SELECT name FROM d1_migrations ORDER BY id",
      "--json",
    ],
    true,
  ),
);
const applied = new Set(ledger[0]?.results?.map((row) => row.name) ?? []);

for (const migration of previewMigrations) {
  if (applied.has(migration)) continue;
  const migrationPath = resolve("migrations", migration);
  if (!existsSync(migrationPath))
    throw new Error(
      `Required combined-preview migration is missing: ${migration}`,
    );
  run([
    "d1",
    "execute",
    previewDatabase,
    "--remote",
    "--env",
    "preview",
    "--file",
    migrationPath,
    "--yes",
  ]);
  run([
    "d1",
    "execute",
    previewDatabase,
    "--remote",
    "--env",
    "preview",
    "--command",
    `INSERT INTO d1_migrations (name) VALUES ('${migration}')`,
    "--yes",
  ]);
}

console.log(
  `Combined RFI preview migration ledger is current (${previewMigrations.length} migrations).`,
);
