PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS record_revisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  revision_label TEXT,
  title TEXT NOT NULL,
  description TEXT,
  discipline TEXT,
  source TEXT,
  change_summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded')) DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (record_id, organization_id) REFERENCES records(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (record_id, revision_number),
  UNIQUE (record_id, organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_record_revisions_record_number
  ON record_revisions(record_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_record_revisions_organization_project_created
  ON record_revisions(organization_id, project_id, created_at DESC);

-- Enforces at most one published revision per record at the database level,
-- independent of any application-level read-then-write race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_record_revisions_one_published_per_record
  ON record_revisions(record_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS record_revision_sequences (
  record_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  FOREIGN KEY (record_id, organization_id) REFERENCES records(id, organization_id) ON DELETE RESTRICT
);

-- SQLite cannot add a table-level foreign key with ALTER TABLE, so the records
-- table is rebuilt to add the current_revision_id -> record_revisions constraint
-- now that record_revisions exists. Existing rows are preserved by copying them
-- into the rebuilt table before the original is dropped. D1 always runs a
-- migration inside an implicit transaction, and `PRAGMA foreign_keys` cannot be
-- toggled mid-transaction, so enforcement is deferred to the transaction's
-- commit instead (`defer_foreign_keys` resets itself automatically at that
-- point) rather than disabled and re-enabled.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE records_new (
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
  FOREIGN KEY (organization_id, created_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (id, organization_id, current_revision_id) REFERENCES record_revisions(record_id, organization_id, id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, project_id, record_number)
);

INSERT INTO records_new (
  id, organization_id, project_id, record_type, record_number, title, description,
  status, discipline, source, created_by, current_revision_id, archived_at,
  created_at, updated_at
)
SELECT
  id, organization_id, project_id, record_type, record_number, title, description,
  status, discipline, source, created_by, current_revision_id, archived_at,
  created_at, updated_at
FROM records;

DROP TABLE records;

ALTER TABLE records_new RENAME TO records;

CREATE INDEX IF NOT EXISTS idx_records_project_status_created
  ON records(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_organization_project_number
  ON records(organization_id, project_id, record_number);

UPDATE app_meta SET schema_version = 7 WHERE id = 1;
