-- RFI Slice 2A: durable official issuance, frozen render/artifact snapshots,
-- recipient snapshots, idempotency, and cross-storage orphan reconciliation.
--
-- The existing Records -> Revisions -> Files spine remains authoritative.
-- The RFI's existing draft revision is published in place as the original
-- issued revision (shared revisions start at 1), and the generated PDF is
-- attached to that revision with role = generated_artifact.

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

CREATE TABLE rfi_official_issues (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  issuance_id TEXT NOT NULL,
  template_version_id TEXT NOT NULL,
  template_definition_json TEXT NOT NULL CHECK (json_valid(template_definition_json)),
  template_definition_sha256 TEXT NOT NULL CHECK (length(template_definition_sha256) = 64),
  render_payload_json TEXT NOT NULL CHECK (json_valid(render_payload_json)),
  render_payload_sha256 TEXT NOT NULL CHECK (length(render_payload_sha256) = 64),
  renderer_version TEXT NOT NULL,
  artifact_file_id TEXT NOT NULL,
  artifact_storage_key TEXT NOT NULL,
  artifact_filename TEXT NOT NULL,
  artifact_media_type TEXT NOT NULL CHECK (artifact_media_type = 'application/pdf'),
  artifact_byte_size INTEGER NOT NULL CHECK (artifact_byte_size > 0),
  artifact_sha256 TEXT NOT NULL CHECK (length(artifact_sha256) = 64),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode = 'record_only'),
  response_due_date TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  FOREIGN KEY (rfi_id, organization_id, project_id)
    REFERENCES records(id, organization_id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (rfi_id, organization_id, project_id, revision_id)
    REFERENCES record_revisions(record_id, organization_id, project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (issuance_id, organization_id, project_id, rfi_id, revision_id)
    REFERENCES issuances(id, organization_id, project_id, record_id, revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (artifact_file_id, organization_id, project_id, rfi_id, revision_id)
    REFERENCES revision_files(id, organization_id, project_id, record_id, revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, issued_by)
    REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (rfi_id),
  UNIQUE (issuance_id),
  UNIQUE (artifact_file_id),
  UNIQUE (artifact_storage_key)
);

CREATE INDEX idx_rfi_official_issues_project_issued
  ON rfi_official_issues(organization_id, project_id, issued_at DESC);

CREATE TABLE rfi_issue_recipients (
  issue_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  project_contact_id TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('to', 'cc')),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  contact_name_snapshot TEXT NOT NULL,
  company_name_snapshot TEXT,
  contact_type_snapshot TEXT NOT NULL,
  email_snapshot TEXT,
  phone_snapshot TEXT,
  address_snapshot_json TEXT NOT NULL CHECK (json_valid(address_snapshot_json)),
  PRIMARY KEY (issue_id, recipient_role, display_order),
  FOREIGN KEY (issue_id) REFERENCES rfi_official_issues(id) ON DELETE RESTRICT,
  FOREIGN KEY (rfi_id, organization_id, project_id)
    REFERENCES records(id, organization_id, project_id) ON DELETE RESTRICT,
  UNIQUE (issue_id, project_contact_id)
);

CREATE INDEX idx_rfi_issue_recipients_contact
  ON rfi_issue_recipients(organization_id, project_id, project_contact_id);

CREATE TABLE rfi_issue_file_snapshots (
  issue_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('included', 'official_artifact')),
  file_role TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  storage_key TEXT NOT NULL,
  PRIMARY KEY (issue_id, snapshot_kind, display_order),
  FOREIGN KEY (issue_id) REFERENCES rfi_official_issues(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id, organization_id, project_id, rfi_id, revision_id)
    REFERENCES revision_files(id, organization_id, project_id, record_id, revision_id) ON DELETE RESTRICT,
  UNIQUE (issue_id, file_id)
);

CREATE TABLE idempotency_keys (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  resource_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (organization_id, operation, idempotency_key),
  UNIQUE (organization_id, operation, resource_id),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE rfi_artifact_orphans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  artifact_storage_key TEXT NOT NULL UNIQUE,
  artifact_sha256 TEXT NOT NULL CHECK (length(artifact_sha256) = 64),
  artifact_byte_size INTEGER NOT NULL CHECK (artifact_byte_size > 0),
  reconciliation_kind TEXT NOT NULL CHECK (
    reconciliation_kind IN ('compensation_delete_failed', 'commit_outcome_unknown')
  ),
  failure_summary TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL CHECK (
    reconciliation_status IN ('pending', 'deleted', 'retained')
  ) DEFAULT 'pending',
  detected_at TEXT NOT NULL,
  reconciled_at TEXT,
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

-- Official issue snapshots are immutable. Operational orphan rows intentionally
-- remain mutable so a reconciliation job can record its final disposition.
CREATE TRIGGER rfi_official_issues_no_update
BEFORE UPDATE ON rfi_official_issues
BEGIN
  SELECT RAISE(ABORT, 'official RFI issues are immutable');
END;

CREATE TRIGGER rfi_official_issues_no_delete
BEFORE DELETE ON rfi_official_issues
BEGIN
  SELECT RAISE(ABORT, 'official RFI issues are immutable');
END;

CREATE TRIGGER rfi_issue_recipients_no_update
BEFORE UPDATE ON rfi_issue_recipients
BEGIN
  SELECT RAISE(ABORT, 'official RFI recipient snapshots are immutable');
END;

CREATE TRIGGER rfi_issue_recipients_no_delete
BEFORE DELETE ON rfi_issue_recipients
BEGIN
  SELECT RAISE(ABORT, 'official RFI recipient snapshots are immutable');
END;

CREATE TRIGGER rfi_issue_file_snapshots_no_update
BEFORE UPDATE ON rfi_issue_file_snapshots
BEGIN
  SELECT RAISE(ABORT, 'official RFI file snapshots are immutable');
END;

CREATE TRIGGER rfi_issue_file_snapshots_no_delete
BEFORE DELETE ON rfi_issue_file_snapshots
BEGIN
  SELECT RAISE(ABORT, 'official RFI file snapshots are immutable');
END;

CREATE TRIGGER idempotency_keys_no_update
BEFORE UPDATE ON idempotency_keys
BEGIN
  SELECT RAISE(ABORT, 'completed idempotency results are immutable');
END;

CREATE TRIGGER idempotency_keys_no_delete
BEFORE DELETE ON idempotency_keys
BEGIN
  SELECT RAISE(ABORT, 'completed idempotency results are immutable');
END;

-- Once an RFI issue row exists, the issued revision and the Record's official
-- identity relationship cannot be rewritten. Workflow status may still move
-- through response/close/void using the controlled RFI transitions.
CREATE TRIGGER issued_rfi_revision_no_update
BEFORE UPDATE ON record_revisions
WHEN EXISTS (
  SELECT 1 FROM rfi_official_issues issue
  WHERE issue.revision_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'issued RFI revisions are immutable');
END;

CREATE TRIGGER issued_rfi_revision_no_delete
BEFORE DELETE ON record_revisions
WHEN EXISTS (
  SELECT 1 FROM rfi_official_issues issue
  WHERE issue.revision_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'issued RFI revisions are immutable');
END;

CREATE TRIGGER issued_rfi_record_identity_no_update
BEFORE UPDATE ON records
WHEN EXISTS (
  SELECT 1 FROM rfi_official_issues issue
  WHERE issue.rfi_id = OLD.id
) AND (
  NEW.sequence_no IS NOT OLD.sequence_no
  OR NEW.record_number IS NOT OLD.record_number
  OR NEW.current_revision_id IS NOT OLD.current_revision_id
  OR NEW.issued_at IS NOT OLD.issued_at
)
BEGIN
  SELECT RAISE(ABORT, 'issued RFI identity is immutable');
END;

UPDATE app_meta SET schema_version = 13 WHERE id = 1;
