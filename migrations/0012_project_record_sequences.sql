PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_record_sequences (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, project_id),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

UPDATE app_meta SET schema_version = 10 WHERE id = 1;
