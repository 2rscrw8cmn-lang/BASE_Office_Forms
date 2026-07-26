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
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_official_issues_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_official_issues_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_issue_recipients_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_issue_recipients_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_issue_file_snapshots_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS rfi_issue_file_snapshots_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS idempotency_keys_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS idempotency_keys_no_delete"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issued_rfi_revision_no_update"),
    env.DB.prepare("DROP TRIGGER IF EXISTS issued_rfi_revision_no_delete"),
    env.DB.prepare(
      "DROP TRIGGER IF EXISTS issued_rfi_record_identity_no_update",
    ),
  ]);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM idempotency_keys"),
    env.DB.prepare("DELETE FROM rfi_issue_file_snapshots"),
    env.DB.prepare("DELETE FROM rfi_issue_recipients"),
    env.DB.prepare("DELETE FROM rfi_official_issues"),
    env.DB.prepare("DELETE FROM rfi_artifact_orphans"),
    env.DB.prepare(
      "UPDATE records SET current_revision_id = NULL WHERE current_revision_id IS NOT NULL",
    ),
    env.DB.prepare("DELETE FROM issuance_files"),
    env.DB.prepare("DELETE FROM issuances"),
    env.DB.prepare("DELETE FROM project_issuance_sequences"),
    env.DB.prepare("DELETE FROM revision_files"),
    env.DB.prepare("DELETE FROM rfi_responses"),
    env.DB.prepare("DELETE FROM rfi_details"),
    env.DB.prepare("DELETE FROM rfi_0014_reconciliation"),
    env.DB.prepare("DELETE FROM record_revisions"),
    env.DB.prepare("DELETE FROM record_revision_sequences"),
    env.DB.prepare("DELETE FROM project_record_sequences"),
    env.DB.prepare("DELETE FROM project_record_type_sequences"),
    env.DB.prepare("DELETE FROM records"),
    // RFI records reference template_versions, so records are cleared before
    // the templates they bind to.
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
    env.DB.prepare(
      `CREATE TRIGGER rfi_official_issues_no_update
       BEFORE UPDATE ON rfi_official_issues
       BEGIN SELECT RAISE(ABORT, 'official RFI issues are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER rfi_official_issues_no_delete
       BEFORE DELETE ON rfi_official_issues
       BEGIN SELECT RAISE(ABORT, 'official RFI issues are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER rfi_issue_recipients_no_update
       BEFORE UPDATE ON rfi_issue_recipients
       BEGIN SELECT RAISE(ABORT, 'official RFI recipient snapshots are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER rfi_issue_recipients_no_delete
       BEFORE DELETE ON rfi_issue_recipients
       BEGIN SELECT RAISE(ABORT, 'official RFI recipient snapshots are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER rfi_issue_file_snapshots_no_update
       BEFORE UPDATE ON rfi_issue_file_snapshots
       BEGIN SELECT RAISE(ABORT, 'official RFI file snapshots are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER rfi_issue_file_snapshots_no_delete
       BEFORE DELETE ON rfi_issue_file_snapshots
       BEGIN SELECT RAISE(ABORT, 'official RFI file snapshots are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER idempotency_keys_no_update
       BEFORE UPDATE ON idempotency_keys
       BEGIN SELECT RAISE(ABORT, 'completed idempotency results are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER idempotency_keys_no_delete
       BEFORE DELETE ON idempotency_keys
       BEGIN SELECT RAISE(ABORT, 'completed idempotency results are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issued_rfi_revision_no_update
       BEFORE UPDATE ON record_revisions
       WHEN EXISTS (
         SELECT 1 FROM rfi_official_issues issue
         WHERE issue.revision_id = OLD.id
       )
       BEGIN SELECT RAISE(ABORT, 'issued RFI revisions are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issued_rfi_revision_no_delete
       BEFORE DELETE ON record_revisions
       WHEN EXISTS (
         SELECT 1 FROM rfi_official_issues issue
         WHERE issue.revision_id = OLD.id
       )
       BEGIN SELECT RAISE(ABORT, 'issued RFI revisions are immutable'); END`,
    ),
    env.DB.prepare(
      `CREATE TRIGGER issued_rfi_record_identity_no_update
       BEFORE UPDATE ON records
       WHEN EXISTS (
         SELECT 1 FROM rfi_official_issues issue
         WHERE issue.rfi_id = OLD.id
       ) AND (
         NEW.sequence_no IS NOT OLD.sequence_no
         OR NEW.record_number IS NOT OLD.record_number
         OR NEW.current_revision_id IS NOT OLD.current_revision_id
         OR NEW.issued_at IS NOT OLD.issued_at
       )
       BEGIN SELECT RAISE(ABORT, 'issued RFI identity is immutable'); END`,
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
