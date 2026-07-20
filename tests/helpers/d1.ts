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
