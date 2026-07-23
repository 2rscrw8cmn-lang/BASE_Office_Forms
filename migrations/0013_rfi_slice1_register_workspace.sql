-- RFI Vertical Slice 1: bring the standalone rfi_records foundation up to the
-- binding RFI product model without folding RFIs into the document-control
-- `records` spine (see docs/UX_RFI_SPEC.md §"Template vs record" and the
-- documented deviation from DATA_MODEL §4's unified record). Changes:
--   * lifecycle enum -> binding workflow states
--       (draft, ready_to_issue, open, response_received, closed,
--        returned_for_clarification, void)
--   * product-vocabulary columns
--       (title->subject, suggested_resolution->contractor_suggestion,
--        assigned_to->responsible_party, due_date->requested_response_date,
--        answered_at->response_received_at)
--   * template binding (template_version_id) resolved from the default BASE RFI
--     template at draft creation
--   * optimistic concurrency (lock_version) for inline register edits
--   * issue-time snapshot columns (issued_number_sequence, project_snapshot_json)
--     added now, populated in Slice 2 -- never written before issue
--   * separate reference fields (drawing_references, specification_references)
--   * optional imported legacy reference (legacy_reference), displayed as
--     visibly-secondary migration/reconciliation context only
--
-- A full table rebuild is required because the status CHECK constraint changes.
--
-- IMPORTANT (D1): each migration file runs inside an implicit transaction, and
-- `PRAGMA foreign_keys` is a no-op inside a transaction, so foreign-key
-- enforcement cannot be turned off here. `rfi_responses` references rfi_records
-- with ON DELETE RESTRICT, so a naive `DROP TABLE rfi_records` raises
-- "FOREIGN KEY constraint failed" on any database that already holds RFI data
-- (RESTRICT is checked immediately even under `defer_foreign_keys`). We therefore
-- stage rfi_responses aside, rebuild rfi_records, then restore rfi_responses
-- against the rebuilt parent. This is safe whether the table is empty or
-- populated and preserves all existing RFI and response rows.

CREATE TABLE rfi_records_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  template_version_id TEXT,
  rfi_number TEXT,
  legacy_reference TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'ready_to_issue', 'open', 'response_received',
    'closed', 'returned_for_clarification', 'void'
  )) DEFAULT 'draft',
  subject TEXT NOT NULL,
  question TEXT NOT NULL,
  contractor_suggestion TEXT,
  drawing_references TEXT,
  specification_references TEXT,
  responsible_party TEXT,
  submitted_by TEXT,
  requested_response_date TEXT,
  cost_impact TEXT,
  schedule_impact TEXT,
  issued_number_sequence INTEGER,
  project_snapshot_json TEXT,
  issued_at TEXT,
  response_received_at TEXT,
  closed_at TEXT,
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version >= 1),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (template_version_id, organization_id) REFERENCES template_versions(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id),
  UNIQUE (project_id, rfi_number)
);

INSERT INTO rfi_records_v2 (
  id, organization_id, project_id, template_version_id, rfi_number,
  legacy_reference, status, subject, question, contractor_suggestion,
  drawing_references, specification_references, responsible_party, submitted_by,
  requested_response_date, cost_impact, schedule_impact, issued_number_sequence,
  project_snapshot_json, issued_at, response_received_at, closed_at,
  lock_version, created_by, created_at, updated_at
)
SELECT
  id, organization_id, project_id, NULL, rfi_number,
  NULL,
  CASE status
    WHEN 'issued' THEN 'open'
    WHEN 'answered' THEN 'response_received'
    ELSE status
  END,
  title, question, suggested_resolution,
  NULL, NULL, assigned_to, submitted_by,
  due_date, cost_impact, schedule_impact, NULL,
  NULL, issued_at, answered_at, closed_at,
  1, NULL, created_at, updated_at
FROM rfi_records;

-- Stage the only child that references rfi_records (ON DELETE RESTRICT) so the
-- parent can be dropped without tripping the constraint, then restore it.
CREATE TABLE rfi_responses_backup AS SELECT * FROM rfi_responses;
DROP TABLE rfi_responses;

DROP TABLE rfi_records;
ALTER TABLE rfi_records_v2 RENAME TO rfi_records;

CREATE INDEX IF NOT EXISTS idx_rfi_records_project_status_created
  ON rfi_records(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfi_records_organization_project_number
  ON rfi_records(organization_id, project_id, rfi_number);

-- Recreate rfi_responses (identical to migration 0006) against the rebuilt
-- parent and restore every staged row.
CREATE TABLE rfi_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  response TEXT NOT NULL,
  responded_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (rfi_id, organization_id) REFERENCES rfi_records(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (rfi_id)
);

INSERT INTO rfi_responses (id, organization_id, rfi_id, response, responded_by, created_at)
  SELECT id, organization_id, rfi_id, response, responded_by, created_at
  FROM rfi_responses_backup;

DROP TABLE rfi_responses_backup;

CREATE INDEX IF NOT EXISTS idx_rfi_responses_organization_rfi
  ON rfi_responses(organization_id, rfi_id);

-- Supporting attachments for an RFI draft/revision context. Each file has an
-- explicit role and remains associated with the exact RFI. Binary content lives
-- in R2 (storage_key); D1 metadata is authoritative for size/type/checksum.
CREATE TABLE IF NOT EXISTS rfi_attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rfi_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('supporting_attachment', 'reference_drawing')),
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (rfi_id, organization_id) REFERENCES rfi_records(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  UNIQUE (storage_key)
);

CREATE INDEX IF NOT EXISTS idx_rfi_attachments_rfi_role_uploaded
  ON rfi_attachments(rfi_id, role, uploaded_at ASC, id ASC);

UPDATE app_meta SET schema_version = 11 WHERE id = 1;
