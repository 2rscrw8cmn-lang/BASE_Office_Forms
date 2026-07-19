import {
  RendererDefinitionValidationError,
  requireValidRendererDefinition,
} from "../../src/rendering/renderer-definition";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
};

type DocumentRow = {
  id: string;
  folder_id: string | null;
  title: string;
  document_no: string;
  kind: "form" | "document" | "package";
  document_type: string;
  definition_json: string;
  edit_token_hash: string;
  version: number;
  created_at: string;
  updated_at: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const MAX_BODY_BYTES = 850_000;
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS app_meta (id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL, title TEXT NOT NULL, document_no TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK (kind IN ('form', 'document', 'package')), document_type TEXT NOT NULL DEFAULT '', definition_json TEXT NOT NULL, edit_token_hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_documents_folder_updated ON documents(folder_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_documents_kind_updated ON documents(kind, updated_at DESC)",
  "INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES ('forms', 'Forms', NULL, 10, datetime('now'))",
  "INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES ('scopes', 'Scopes of Work', NULL, 20, datetime('now'))",
  "INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES ('proposals', 'Proposals', NULL, 30, datetime('now'))",
  "INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES ('safety', 'Safety', NULL, 40, datetime('now'))",
  "INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES ('manuals', 'Manuals & Procedures', NULL, 50, datetime('now'))",
  "INSERT OR REPLACE INTO app_meta (id, schema_version) VALUES (1, 1)",
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function ensureSchema(db: D1Database): Promise<void> {
  try {
    const version = await db.prepare("SELECT schema_version FROM app_meta WHERE id = 1").first<number>("schema_version");
    if (version === 1) return;
  } catch (_) {}
  await db.batch(SCHEMA_STATEMENTS.map(statement => db.prepare(statement)));
}

function pathParts(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  if (!request.body) throw new Error("A JSON object is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch (_) { throw new Error("Invalid JSON body."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required.");
  return body as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max = 180): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

function optionalText(value: unknown, max = 180): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error("A text value is too long.");
  return text;
}

function definitionFrom(body: Record<string, unknown>): { definition: Record<string, unknown>; encoded: string } {
  if (body.definition === undefined) throw new Error("A document definition is required.");
  const definition = requireValidRendererDefinition(body.definition);
  const encoded = JSON.stringify(definition);
  if (new TextEncoder().encode(encoded).byteLength > 800_000) throw new Error("Document is too large for the shared library.");
  return { definition, encoded };
}

function token(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(value)) return new Uint8Array(32);
  return Uint8Array.from(value.match(/.{2}/g) || [], pair => Number.parseInt(pair, 16));
}

async function tokenHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request, expectedHash: string): Promise<boolean> {
  const supplied = request.headers.get("X-Edit-Token") || "";
  const suppliedHash = await tokenHash(supplied);
  const suppliedBytes = fromHex(suppliedHash);
  const expectedBytes = fromHex(expectedHash);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) difference |= suppliedBytes[index] ^ expectedBytes[index];
  return difference === 0;
}

function publicDocument(row: DocumentRow, includeDefinition = false): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    no: row.document_no,
    kind: row.kind,
    documentType: row.document_type,
    version: row.version,
    created: row.created_at,
    updated: row.updated_at,
  };
  if (includeDefinition) result.definition = JSON.parse(row.definition_json) as unknown;
  return result;
}

async function listDocuments(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder");
  const kind = url.searchParams.get("kind");
  let query = "SELECT * FROM documents";
  const filters: string[] = [];
  const values: string[] = [];
  if (folder) { filters.push("folder_id = ?"); values.push(folder); }
  if (kind && new Set(["form", "document", "package"]).has(kind)) { filters.push("kind = ?"); values.push(kind); }
  if (filters.length) query += ` WHERE ${filters.join(" AND ")}`;
  query += " ORDER BY updated_at DESC LIMIT 500";
  const response = await db.prepare(query).bind(...values).all<DocumentRow>();
  return json({ documents: response.results.map(row => publicDocument(row)) });
}

async function createDocument(db: D1Database, request: Request): Promise<Response> {
  const body = await readBody(request);
  const { definition, encoded } = definitionFrom(body);
  const id = crypto.randomUUID();
  const editToken = token();
  const hash = await tokenHash(editToken);
  const now = new Date().toISOString();
  const title = requiredText(definition.title, "Title");
  const no = optionalText(definition.no, 80);
  const kind = String(definition.kind) as DocumentRow["kind"];
  const documentType = optionalText(definition.documentType || definition.typeLabel, 100);
  const folderId = optionalText(body.folderId, 100) || null;
  await db.prepare(`INSERT INTO documents
    (id, folder_id, title, document_no, kind, document_type, definition_json, edit_token_hash, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(id, folderId, title, no, kind, documentType, encoded, hash, now, now).run();
  const row = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRow>();
  if (!row) throw new Error("Document could not be created.");
  return json({ document: publicDocument(row, true), editToken }, 201);
}

async function getDocument(db: D1Database, id: string): Promise<Response> {
  const row = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRow>();
  return row ? json({ document: publicDocument(row, true) }) : json({ error: "Document not found." }, 404);
}

async function updateDocument(db: D1Database, request: Request, id: string): Promise<Response> {
  const existing = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRow>();
  if (!existing) return json({ error: "Document not found." }, 404);
  if (!(await authorized(request, existing.edit_token_hash))) return json({ error: "This edit link is not authorized." }, 403);
  const body = await readBody(request);
  const expectedVersion = Number(body.version || existing.version);
  if (expectedVersion !== existing.version) return json({ error: `This document changed in the library. Reload version ${existing.version} before saving.` }, 409);
  const { definition, encoded } = definitionFrom(body);
  const now = new Date().toISOString();
  const title = requiredText(definition.title, "Title");
  const no = optionalText(definition.no, 80);
  const kind = String(definition.kind) as DocumentRow["kind"];
  const documentType = optionalText(definition.documentType || definition.typeLabel, 100);
  const folderId = body.folderId === undefined ? existing.folder_id : (optionalText(body.folderId, 100) || null);
  const update = await db.prepare(`UPDATE documents SET folder_id = ?, title = ?, document_no = ?, kind = ?, document_type = ?,
    definition_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`)
    .bind(folderId, title, no, kind, documentType, encoded, now, id, expectedVersion).run();
  if (!update.meta.changes) return json({ error: "This document changed while you were editing. Reload it before saving." }, 409);
  const row = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRow>();
  if (!row) throw new Error("Document could not be updated.");
  return json({ document: publicDocument(row, true) });
}

async function deleteDocument(db: D1Database, request: Request, id: string): Promise<Response> {
  const existing = await db.prepare("SELECT edit_token_hash FROM documents WHERE id = ?").bind(id).first<{ edit_token_hash: string }>();
  if (!existing) return json({ error: "Document not found." }, 404);
  if (!(await authorized(request, existing.edit_token_hash))) return json({ error: "This edit link is not authorized." }, 403);
  await db.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
  return json({ deleted: true });
}

async function folders(db: D1Database, request: Request): Promise<Response> {
  if (request.method === "GET") {
    const response = await db.prepare("SELECT * FROM folders ORDER BY sort_order, name").all<FolderRow>();
    return json({ folders: response.results.map(row => ({ id: row.id, name: row.name, parentId: row.parent_id, created: row.created_at })) });
  }
  if (request.method === "POST") {
    const body = await readBody(request);
    const id = crypto.randomUUID();
    const name = requiredText(body.name, "Folder name", 80);
    const parentId = optionalText(body.parentId, 100) || null;
    await db.prepare("INSERT INTO folders (id, name, parent_id, sort_order, created_at) VALUES (?, ?, ?, 100, ?)")
      .bind(id, name, parentId, new Date().toISOString()).run();
    return json({ folder: { id, name, parentId } }, 201);
  }
  return json({ error: "Method not allowed." }, 405);
}

export const onRequest: PagesFunction<Env, "path"> = async context => {
  try {
    await ensureSchema(context.env.DB);
    const parts = pathParts(context.params.path);
    const [resource, id] = parts;
    const method = context.request.method.toUpperCase();
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    if (!resource || resource === "health") return json({ ok: true, storage: "D1" });
    if (resource === "folders") return await folders(context.env.DB, context.request);
    if (resource !== "documents") return json({ error: "API route not found." }, 404);
    if (!id && method === "GET") return await listDocuments(context.env.DB, context.request);
    if (!id && method === "POST") return await createDocument(context.env.DB, context.request);
    if (id && method === "GET") return await getDocument(context.env.DB, id);
    if (id && method === "PUT") return await updateDocument(context.env.DB, context.request, id);
    if (id && method === "DELETE") return await deleteDocument(context.env.DB, context.request, id);
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(JSON.stringify({ message: "library request failed", error: message, path: new URL(context.request.url).pathname }));
    if (error instanceof RendererDefinitionValidationError) {
      return json({ error: "Renderer definition is invalid.", validationErrors: error.issues }, 400);
    }
    const status = /required|invalid|too large|too long/i.test(message) ? 400 : 500;
    return json({ error: status === 500 ? "The shared library could not complete this request." : message }, status);
  }
};
