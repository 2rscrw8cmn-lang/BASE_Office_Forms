PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('form', 'document', 'package')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, created_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS template_version_sequences (
  template_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  FOREIGN KEY (template_id, organization_id) REFERENCES templates(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  definition_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'retired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  FOREIGN KEY (template_id, organization_id) REFERENCES templates(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, published_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, template_id, version_number)
);

-- Only one published version can be active per template at a time; older
-- versions are retired (never mutated or deleted) when a new one publishes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_one_published
  ON template_versions(template_id) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_template_versions_template_created
  ON template_versions(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_organization_key
  ON templates(organization_id, key);

UPDATE app_meta SET schema_version = 9 WHERE id = 1;
