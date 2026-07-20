PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('document', 'drawing', 'specification', 'schedule', 'report', 'correspondence', 'other')),
  record_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  discipline TEXT,
  source TEXT,
  created_by TEXT NOT NULL,
  current_revision_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, project_id, record_number)
);

CREATE INDEX IF NOT EXISTS idx_records_project_status_created
  ON records(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_organization_project_number
  ON records(organization_id, project_id, record_number);

UPDATE app_meta SET schema_version = 6 WHERE id = 1;
