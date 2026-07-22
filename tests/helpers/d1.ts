import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

export function testDatabase(): D1Database {
  return env.DB;
}

export async function applyTestMigrations(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

export async function resetLegacyLibrary(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM documents"),
    env.DB.prepare("DELETE FROM folders"),
  ]);
}

export async function resetIdentityFoundation(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DROP TRIGGER IF EXISTS activity_events_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS activity_events_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issuances_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issuances_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issuance_files_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issuance_files_no_delete"),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE records SET current_revision_id = NULL WHERE current_revision_id IS NOT NULL",
    ),
    env.DB.prepare("DELETE FROM issuance_files"),
    env.DB.prepare("DELETE FROM issuances"),
    env.DB.prepare("DELETE FROM project_issuance_sequences"),
    env.DB.prepare("DELETE FROM revision_files"),
    env.DB.prepare("DELETE FROM record_revisions"),
    env.DB.prepare("DELETE FROM record_revision_sequences"),
    env.DB.prepare("DELETE FROM project_record_sequences"),
    env.DB.prepare("DELETE FROM records"),
    // RFI rows reference template_versions, so they must be cleared before the
    // templates they bind to.
    env.DB.prepare("DELETE FROM rfi_attachments"),
    env.DB.prepare("DELETE FROM rfi_responses"),
    env.DB.prepare("DELETE FROM rfi_records"),
    env.DB.prepare("DELETE FROM rfi_number_sequences"),
    env.DB.prepare("DELETE FROM template_versions"),
    env.DB.prepare("DELETE FROM template_version_sequences"),
    env.DB.prepare("DELETE FROM templates"),
    env.DB.prepare("DELETE FROM project_contacts"),
    env.DB.prepare("DELETE FROM project_memberships"),
    env.DB.prepare("DELETE FROM projects"),
    env.DB.prepare("DELETE FROM activity_events"),
    env.DB.prepare("DELETE FROM organization_memberships"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM organizations"),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TRIGGER activity_events_no_update
       BEFORE UPDATE ON activity_events
       BEGIN SELECT RAISE(ABORT, 'activity_events are append-only'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER activity_events_no_delete
       BEFORE DELETE ON activity_events
       BEGIN SELECT RAISE(ABORT, 'activity_events are append-only'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issuances_no_update
       BEFORE UPDATE ON issuances
       BEGIN SELECT RAISE(ABORT, 'issuances are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issuances_no_delete
       BEFORE DELETE ON issuances
       BEGIN SELECT RAISE(ABORT, 'issuances are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issuance_files_no_update
       BEFORE UPDATE ON issuance_files
       BEGIN SELECT RAISE(ABORT, 'issuance files are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issuance_files_no_delete
       BEFORE DELETE ON issuance_files
       BEGIN SELECT RAISE(ABORT, 'issuance files are immutable'); END`,
    ),
  ]);
}

export async function seedLegacyDocument(
  definition: Record<string, unknown>,
  options: { id?: string; editTokenHash?: string } = {},
): Promise<string> {
  const id = options.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const title =
    typeof definition.title === "string" ? definition.title : "Fixture";
  const kind =
    typeof definition.kind === "string" ? definition.kind : "document";

  await env.DB.prepare(
    `INSERT INTO documents
      (id, folder_id, title, document_no, kind, document_type, definition_json,
       edit_token_hash, version, created_at, updated_at)
     VALUES (?, NULL, ?, '', ?, '', ?, ?, 1, ?, ?)`,
  )
    .bind(
      id,
      title,
      kind,
      JSON.stringify(definition),
      options.editTokenHash ?? "0".repeat(64),
      now,
      now,
    )
    .run();

  return id;
}
