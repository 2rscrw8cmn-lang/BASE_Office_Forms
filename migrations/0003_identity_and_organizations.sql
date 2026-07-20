PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')) DEFAULT 'active',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  identity_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_email
  ON users(email);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN (
    'org_admin',
    'document_control_admin',
    'project_manager',
    'contributor',
    'viewer'
  )),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_status
  ON organization_memberships(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_organization_status
  ON organization_memberships(organization_id, status, created_at);

-- PR 2 uses this append-only audit stream solely for membership changes.
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system')),
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  action TEXT NOT NULL,
  prior_state_json TEXT,
  new_state_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_events_organization_object_created
  ON activity_events(organization_id, object_type, object_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS activity_events_no_update
BEFORE UPDATE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS activity_events_no_delete
BEFORE DELETE ON activity_events
BEGIN
  SELECT RAISE(ABORT, 'activity_events are append-only');
END;

UPDATE app_meta SET schema_version = 2 WHERE id = 1;
