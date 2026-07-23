import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const previewDatabase = "base-office-forms-ui2-preview";
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
];
const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const wranglerConfig = resolve("wrangler.ui2.jsonc");

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

const ledger = JSON.parse(
  runWrangler(
    [
      "d1",
      "execute",
      previewDatabase,
      "--remote",
      "--command",
      "SELECT name FROM d1_migrations ORDER BY id",
      "--json",
    ],
    { json: true },
  ),
);
const applied = new Set(ledger[0]?.results?.map((row) => row.name) ?? []);

for (const migration of previewMigrations) {
  if (applied.has(migration)) continue;

  const migrationPath = resolve("migrations", migration);
  if (!existsSync(migrationPath)) {
    throw new Error(`Required UI-2 preview migration is missing: ${migration}`);
  }

  runWrangler([
    "d1",
    "execute",
    previewDatabase,
    "--remote",
    "--file",
    migrationPath,
    "--yes",
  ]);
  runWrangler([
    "d1",
    "execute",
    previewDatabase,
    "--remote",
    "--command",
    `INSERT INTO d1_migrations (name) VALUES ('${migration}')`,
    "--yes",
  ]);
}

console.log(
  `UI-2 preview migration ledger is current (${previewMigrations.length} migrations).`,
);
