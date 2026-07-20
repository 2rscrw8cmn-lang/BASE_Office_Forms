PRAGMA foreign_keys = ON;

-- Composite parent key so a file's project_id must match the project that
-- actually owns its revision and record. Without this, the revision-only and
-- project-only foreign keys below could each be individually satisfied while a
-- file paired a Project A revision/record with a Project B project_id in the
-- same organization. id is already the primary key, so this index is trivially
-- unique and only exists to serve the four-column foreign key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_record_revisions_file_hierarchy
  ON record_revisions(record_id, organization_id, project_id, id);

CREATE TABLE IF NOT EXISTS revision_files (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (record_id, organization_id, project_id, revision_id) REFERENCES record_revisions(record_id, organization_id, project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, organization_id) REFERENCES records(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (storage_key),
  UNIQUE (revision_id, organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_revision_files_revision_uploaded
  ON revision_files(revision_id, uploaded_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_revision_files_organization_project
  ON revision_files(organization_id, project_id, uploaded_at DESC);

UPDATE app_meta SET schema_version = 8 WHERE id = 1;
