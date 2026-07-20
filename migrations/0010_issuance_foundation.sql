PRAGMA foreign_keys = ON;

-- Supporting composite keys make tenant/project/record/revision hierarchy
-- mismatches impossible to persist, even if application validation regresses.
CREATE UNIQUE INDEX IF NOT EXISTS uq_records_issuance_hierarchy
  ON records(id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revision_files_issuance_hierarchy
  ON revision_files(id, organization_id, project_id, record_id, revision_id);

CREATE TABLE IF NOT EXISTS project_issuance_sequences (
  project_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS issuances (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  issue_number TEXT NOT NULL,
  issue_sequence INTEGER NOT NULL CHECK (issue_sequence >= 1),
  purpose TEXT NOT NULL CHECK (purpose IN (
    'for_information',
    'for_review',
    'for_approval',
    'for_construction',
    'as_recorded',
    'other'
  )),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  revision_snapshot_json TEXT NOT NULL CHECK (json_valid(revision_snapshot_json)),
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL CHECK (length(trim(correlation_id)) > 0),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, organization_id, project_id) REFERENCES records(id, organization_id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, organization_id, project_id, revision_id) REFERENCES record_revisions(record_id, organization_id, project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, issued_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (organization_id, project_id, issue_sequence),
  UNIQUE (organization_id, project_id, issue_number),
  UNIQUE (id, organization_id, project_id, record_id, revision_id),
  CHECK (issue_number = 'ISS-' || printf('%03d', issue_sequence))
);

CREATE TABLE IF NOT EXISTS issuance_files (
  issuance_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  storage_key TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (issuance_id, file_id),
  FOREIGN KEY (issuance_id, organization_id, project_id, record_id, revision_id) REFERENCES issuances(id, organization_id, project_id, record_id, revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id, organization_id, project_id, record_id, revision_id) REFERENCES revision_files(id, organization_id, project_id, record_id, revision_id) ON DELETE RESTRICT,
  UNIQUE (issuance_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_issuances_project_sequence
  ON issuances(organization_id, project_id, issue_sequence DESC);
CREATE INDEX IF NOT EXISTS idx_issuances_record_revision
  ON issuances(organization_id, record_id, revision_id, issue_sequence DESC);
CREATE INDEX IF NOT EXISTS idx_issuance_files_order
  ON issuance_files(issuance_id, display_order ASC);

-- Issuances and their selected-file snapshots are append-only audit facts.
CREATE TRIGGER IF NOT EXISTS issuances_no_update
BEFORE UPDATE ON issuances
BEGIN
  SELECT RAISE(ABORT, 'issuances are immutable');
END;

CREATE TRIGGER IF NOT EXISTS issuances_no_delete
BEFORE DELETE ON issuances
BEGIN
  SELECT RAISE(ABORT, 'issuances are immutable');
END;

CREATE TRIGGER IF NOT EXISTS issuance_files_no_update
BEFORE UPDATE ON issuance_files
BEGIN
  SELECT RAISE(ABORT, 'issuance files are immutable');
END;

CREATE TRIGGER IF NOT EXISTS issuance_files_no_delete
BEFORE DELETE ON issuance_files
BEGIN
  SELECT RAISE(ABORT, 'issuance files are immutable');
END;

UPDATE app_meta SET schema_version = 9 WHERE id = 1;
