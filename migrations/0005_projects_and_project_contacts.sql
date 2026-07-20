PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  project_number TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning', 'active', 'closeout', 'suspended', 'archived')) DEFAULT 'planning',
  description TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  address_city TEXT,
  address_region TEXT,
  address_postal_code TEXT,
  address_country TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  start_date TEXT,
  target_completion_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, project_number)
);

CREATE INDEX IF NOT EXISTS idx_projects_organization_status_created
  ON projects(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS project_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('project_manager', 'contributor', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, user_id) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_organization_user_status
  ON project_memberships(organization_id, user_id, status, project_id);

CREATE TABLE IF NOT EXISTS project_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  contact_type TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  address_city TEXT,
  address_region TEXT,
  address_postal_code TEXT,
  address_country TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_project_contacts_project_active_name
  ON project_contacts(project_id, archived_at, contact_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_project_contacts_organization_email
  ON project_contacts(organization_id, email);

UPDATE app_meta SET schema_version = 4 WHERE id = 1;
