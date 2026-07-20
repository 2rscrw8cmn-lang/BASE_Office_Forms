PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rfi_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'answered', 'closed')) DEFAULT 'draft',
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  suggested_resolution TEXT,
  submitted_by TEXT,
  assigned_to TEXT,
  due_date TEXT,
  cost_impact TEXT,
  schedule_impact TEXT,
  issued_at TEXT,
  answered_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (project_id, rfi_number)
);

CREATE INDEX IF NOT EXISTS idx_rfi_records_project_status_created
  ON rfi_records(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfi_records_organization_project_number
  ON rfi_records(organization_id, project_id, rfi_number);

CREATE TABLE IF NOT EXISTS rfi_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  response TEXT NOT NULL,
  responded_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (rfi_id, organization_id) REFERENCES rfi_records(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (rfi_id)
);

CREATE INDEX IF NOT EXISTS idx_rfi_responses_organization_rfi
  ON rfi_responses(organization_id, rfi_id);

CREATE TABLE IF NOT EXISTS rfi_number_sequences (
  project_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

UPDATE app_meta SET schema_version = 5 WHERE id = 1;
