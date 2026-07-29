import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import definition from "../src/domain/rfis/base-rfi-template-definition.json" with { type: "json" };
import {
  previewTemplateIds,
  reconcilePreviewTemplate,
} from "./rfi-preview-template-reconciliation.mjs";

const previewDatabase = "base-office-forms-rfi-preview";
const previewDatabaseId = "5169cd7c-60d8-4dbd-a66c-75155f745216";
const productionDatabase = "base-office-forms-library";
const productionDatabaseId = "1a6057f7-6e2b-44c0-8bfb-d9a6b992a1ab";
const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const fixture = {
  organizationId: "rfi-preview-org",
  projectId: "rfi-preview-project",
  userId: "rfi-preview-access-user",
  contactId: "rfi-preview-contact",
  templateId: "rfi-preview-template",
  templateVersionId: previewTemplateIds.stale,
  recordId: "rfi-preview-record",
  revisionId: "rfi-preview-record:draft-v1",
};

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertPreviewTarget() {
  const config = readFileSync("wrangler.jsonc", "utf8");
  if (
    !config.includes(`\"database_id\": \"${productionDatabaseId}\"`) ||
    !config.includes(`\"preview_database_id\": \"${previewDatabaseId}\"`) ||
    !config.includes(`\"database_name\": \"${previewDatabase}\"`)
  ) {
    throw new Error(
      "Refusing RFI preview fixture: the Pages config no longer pins the approved database identities.",
    );
  }
}

function run(args, json = false) {
  return execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function query(database, command, preview = false) {
  const output = run(
    [
      "d1",
      "execute",
      database,
      "--remote",
      ...(preview ? ["--env", "preview"] : []),
      "--command",
      command,
      "--json",
    ],
    true,
  );
  return JSON.parse(output)[0]?.results ?? [];
}

function execute(command) {
  run([
    "d1",
    "execute",
    previewDatabase,
    "--remote",
    "--env",
    "preview",
    "--command",
    command,
    "--yes",
  ]);
}

function resolveIdentity() {
  const email = process.env.RFI_PREVIEW_FIXTURE_EMAIL?.trim();
  if (!email)
    throw new Error(
      "RFI_PREVIEW_FIXTURE_EMAIL is required and is never stored in the repository.",
    );
  const matches = query(
    productionDatabase,
    `SELECT identity_subject, email, display_name FROM users WHERE lower(email) = lower(${sql(email)}) AND status = 'active'`,
  );
  if (matches.length !== 1)
    throw new Error(
      "Expected exactly one active production user for the supplied Access email.",
    );
  return matches[0];
}

async function reconcile() {
  const plan = await reconcilePreviewTemplate({
    query: (command) => query(previewDatabase, command, true),
    execute,
    sql,
  });
  console.log(
    `Combined RFI preview template reconciled: canonical version ${plan.canonicalVersionId}; published=${plan.publishCanonicalVersion}; eligible RFIs rebound=${plan.rebindRecordIds.length}.`,
  );
  return plan.canonicalVersionId;
}

async function seed() {
  const identity = resolveIdentity();
  execute(`INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at)
    VALUES (${sql(fixture.userId)}, ${sql(identity.identity_subject)}, ${sql(identity.email)}, ${sql(identity.display_name)}, 'active', datetime('now'), datetime('now'))
    ON CONFLICT(identity_subject) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, status = 'active', updated_at = datetime('now')`);
  execute(`INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at)
    VALUES (${sql(fixture.organizationId)}, 'BASE RFI Preview', 'base-rfi-preview', 'active', '{}', datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = 'active', updated_at = datetime('now')`);
  execute(`INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at)
    VALUES ('rfi-preview-org-admin', ${sql(fixture.organizationId)}, ${sql(fixture.userId)}, 'org_admin', 'active', datetime('now'))
    ON CONFLICT(organization_id, user_id) DO UPDATE SET role = 'org_admin', status = 'active'`);
  execute(`INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at)
    VALUES (${sql(fixture.projectId)}, ${sql(fixture.organizationId)}, 'RFI-001', 'RFI Slice 1 Preview', 'active', 'America/New_York', datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = 'active', updated_at = datetime('now')`);
  execute(`INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at)
    VALUES ('rfi-preview-project-manager', ${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, ${sql(fixture.userId)}, 'project_manager', 'active', datetime('now'))
    ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'project_manager', status = 'active'`);
  execute(`INSERT INTO project_contacts (id, organization_id, project_id, contact_name, contact_type, email, created_at, updated_at)
    VALUES (${sql(fixture.contactId)}, ${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, 'Preview Architect', 'architect', 'architect@example.test', datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET archived_at = NULL, updated_at = datetime('now')`);
  execute(`INSERT INTO templates (id, organization_id, key, name, kind, created_by, created_at, updated_at)
    VALUES (${sql(fixture.templateId)}, ${sql(fixture.organizationId)}, 'base-rfi', 'BASE RFI', 'form', ${sql(fixture.userId)}, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now')`);
  execute(
    `INSERT OR IGNORE INTO template_version_sequences (template_id, organization_id, last_number) VALUES (${sql(fixture.templateId)}, ${sql(fixture.organizationId)}, 1)`,
  );
  execute(`INSERT INTO template_versions (id, organization_id, template_id, version_number, definition_json, status, created_by, created_at, published_at, published_by)
    VALUES (${sql(fixture.templateVersionId)}, ${sql(fixture.organizationId)}, ${sql(fixture.templateId)}, 1, ${sql(JSON.stringify(definition))}, 'published', ${sql(fixture.userId)}, datetime('now'), datetime('now'), ${sql(fixture.userId)})
    ON CONFLICT(id) DO NOTHING`);
  const canonicalTemplateVersionId = await reconcile();
  execute(`INSERT INTO records (id, organization_id, project_id, record_type, record_type_key, record_number, sequence_no, title, status, workflow_status, source, created_by, template_version_id, current_responsible_contact_id, lock_version, created_at, updated_at)
    VALUES (${sql(fixture.recordId)}, ${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, 'other', 'rfi', NULL, NULL, 'Preview RFI draft', 'active', 'draft', 'rfi', ${sql(fixture.userId)}, ${sql(canonicalTemplateVersionId)}, ${sql(fixture.contactId)}, 1, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET archived_at = NULL, workflow_status = 'draft', template_version_id = excluded.template_version_id, updated_at = datetime('now')`);
  execute(`INSERT INTO rfi_details (record_id, organization_id, project_id, question, contractor_suggestion, issuance_reconciliation_state)
    VALUES (${sql(fixture.recordId)}, ${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, 'Is the proposed lintel elevation acceptable?', 'Provide an updated elevation if not.', 'not_issued')
    ON CONFLICT(record_id) DO UPDATE SET question = excluded.question, contractor_suggestion = excluded.contractor_suggestion`);
  execute(`INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, revision_label, title, description, change_summary, status, created_by, created_at)
    VALUES (${sql(fixture.revisionId)}, ${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, ${sql(fixture.recordId)}, 1, 'Draft', 'Preview RFI draft', 'Is the proposed lintel elevation acceptable?', 'Synthetic preview fixture', 'draft', ${sql(fixture.userId)}, datetime('now'))
    ON CONFLICT(id) DO NOTHING`);
  execute(
    `INSERT OR IGNORE INTO record_revision_sequences (record_id, organization_id, last_number) VALUES (${sql(fixture.recordId)}, ${sql(fixture.organizationId)}, 1)`,
  );
  execute(
    `INSERT OR IGNORE INTO project_record_type_sequences (organization_id, project_id, record_type_key, last_number, updated_at) VALUES (${sql(fixture.organizationId)}, ${sql(fixture.projectId)}, 'rfi', 0, datetime('now'))`,
  );
  execute(
    `UPDATE records SET current_revision_id = ${sql(fixture.revisionId)} WHERE id = ${sql(fixture.recordId)}`,
  );
  verify();
}

function verify() {
  const rows = query(
    previewDatabase,
    `SELECT
    (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ${sql(fixture.organizationId)} AND user_id = ${sql(fixture.userId)} AND role = 'org_admin' AND status = 'active') AS org_access,
    (SELECT COUNT(*) FROM project_memberships WHERE project_id = ${sql(fixture.projectId)} AND user_id = ${sql(fixture.userId)} AND role = 'project_manager' AND status = 'active') AS project_access,
    (SELECT COUNT(*) FROM records WHERE id = ${sql(fixture.recordId)} AND current_revision_id = ${sql(fixture.revisionId)}) AS preview_record,
    (SELECT COUNT(*) FROM rfi_details WHERE record_id = ${sql(fixture.recordId)}) AS preview_rfi,
    (SELECT COUNT(*) FROM records r JOIN rfi_details d ON d.record_id = r.id WHERE r.organization_id = ${sql(fixture.organizationId)} AND r.record_type_key = 'rfi') AS dashboard_rfi_model,
    (SELECT COUNT(*) FROM records r JOIN rfi_details d ON d.record_id = r.id WHERE r.organization_id = ${sql(fixture.organizationId)} AND r.project_id = ${sql(fixture.projectId)} AND r.record_type_key = 'rfi') AS overview_rfi_model,
    (SELECT COUNT(*) FROM d1_migrations) AS migration_count`,
    true,
  );
  const row = rows[0] ?? {};
  for (const key of [
    "org_access",
    "project_access",
    "preview_record",
    "preview_rfi",
    "dashboard_rfi_model",
    "overview_rfi_model",
  ])
    if (Number(row[key]) !== 1)
      throw new Error(`Combined preview fixture verification failed: ${key}.`);
  if (Number(row.migration_count) !== 15)
    throw new Error(
      `Combined preview fixture requires ledger 0001-0015; found ${row.migration_count} entries.`,
    );
  console.log(
    "Combined RFI preview fixture verified: authenticated user, organization, project, contact, template, RFI draft, and revision are ready.",
  );
}

function cleanup() {
  execute(`BEGIN;
    UPDATE records SET current_revision_id = NULL WHERE id = ${sql(fixture.recordId)};
    DELETE FROM rfi_responses WHERE record_id = ${sql(fixture.recordId)};
    DELETE FROM revision_files WHERE record_id = ${sql(fixture.recordId)};
    DELETE FROM record_revision_sequences WHERE record_id = ${sql(fixture.recordId)};
    DELETE FROM record_revisions WHERE id = ${sql(fixture.revisionId)};
    DELETE FROM rfi_details WHERE record_id = ${sql(fixture.recordId)};
    DELETE FROM records WHERE id = ${sql(fixture.recordId)};
    DELETE FROM project_record_type_sequences WHERE organization_id = ${sql(fixture.organizationId)} AND project_id = ${sql(fixture.projectId)} AND record_type_key = 'rfi';
    DELETE FROM project_memberships WHERE id = 'rfi-preview-project-manager';
    DELETE FROM project_contacts WHERE id = ${sql(fixture.contactId)};
    DELETE FROM projects WHERE id = ${sql(fixture.projectId)};
    DELETE FROM organization_memberships WHERE id = 'rfi-preview-org-admin';
    DELETE FROM users WHERE id = ${sql(fixture.userId)};
    DELETE FROM organizations WHERE id = ${sql(fixture.organizationId)};
  COMMIT;`);
  console.log(
    "Combined RFI preview fixture cleanup completed; immutable preview template versions remain for audit and migrations remain untouched.",
  );
}

if (!existsSync(wranglerCli))
  throw new Error("Local Wrangler is required; run npm install first.");
assertPreviewTarget();
if (process.argv[2] === "cleanup") cleanup();
else if (process.argv[2] === "verify") verify();
else if (process.argv[2] === "reconcile") await reconcile();
else await seed();
