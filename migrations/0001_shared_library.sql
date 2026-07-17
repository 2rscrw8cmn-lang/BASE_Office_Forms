PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  document_no TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('form', 'document', 'package')),
  document_type TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL,
  edit_token_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_folder_updated
  ON documents(folder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_kind_updated
  ON documents(kind, updated_at DESC);

INSERT OR IGNORE INTO folders (id, name, parent_id, sort_order, created_at) VALUES
  ('forms', 'Forms', NULL, 10, datetime('now')),
  ('scopes', 'Scopes of Work', NULL, 20, datetime('now')),
  ('proposals', 'Proposals', NULL, 30, datetime('now')),
  ('safety', 'Safety', NULL, 40, datetime('now')),
  ('manuals', 'Manuals & Procedures', NULL, 50, datetime('now'));
