-- RFI corrective architecture pass.
--
-- Migration 0013 is already deployed and is intentionally left untouched.
-- This forward migration moves every RFI onto the existing Records -> Revisions
-- -> Files spine while preserving the stable RFI id, consumed number, source
-- template, timestamps, response data, attachment metadata, and R2 object key.

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- The original records table predates the binding record model. Add the common
-- stable-record fields without rebuilding the table (which would require
-- temporarily dismantling the existing revision/file/issuance graph).
ALTER TABLE records ADD COLUMN record_type_key TEXT;
ALTER TABLE records ADD COLUMN template_version_id TEXT REFERENCES template_versions(id) ON DELETE RESTRICT;
ALTER TABLE records ADD COLUMN sequence_no INTEGER CHECK (sequence_no IS NULL OR sequence_no >= 1);
ALTER TABLE records ADD COLUMN workflow_status TEXT;
ALTER TABLE records ADD COLUMN current_responsible_contact_id TEXT REFERENCES project_contacts(id) ON DELETE RESTRICT;
ALTER TABLE records ADD COLUMN responsible_party_legacy_text TEXT;
ALTER TABLE records ADD COLUMN due_date TEXT;
ALTER TABLE records ADD COLUMN issued_at TEXT;
ALTER TABLE records ADD COLUMN returned_at TEXT;
ALTER TABLE records ADD COLUMN closed_at TEXT;
ALTER TABLE records ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version >= 1);

UPDATE records SET record_type_key = record_type WHERE record_type_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_records_project_type_sequence
  ON records(organization_id, project_id, record_type_key, sequence_no)
  WHERE sequence_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_project_type_workflow
  ON records(organization_id, project_id, record_type_key, workflow_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_responsible_contact
  ON records(organization_id, project_id, current_responsible_contact_id, workflow_status);

CREATE TRIGGER records_rfi_workflow_insert_guard
BEFORE INSERT ON records
WHEN NEW.record_type_key = 'rfi'
  AND (NEW.workflow_status IS NULL OR NEW.workflow_status NOT IN (
    'draft', 'ready_to_issue', 'open', 'response_received',
    'closed', 'returned_for_clarification', 'void'
  ))
BEGIN
  SELECT RAISE(ABORT, 'invalid RFI workflow status');
END;

CREATE TRIGGER records_rfi_workflow_update_guard
BEFORE UPDATE OF record_type_key, workflow_status ON records
WHEN NEW.record_type_key = 'rfi'
  AND (NEW.workflow_status IS NULL OR NEW.workflow_status NOT IN (
    'draft', 'ready_to_issue', 'open', 'response_received',
    'closed', 'returned_for_clarification', 'void'
  ))
BEGIN
  SELECT RAISE(ABORT, 'invalid RFI workflow status');
END;

-- SQLite cannot add a composite FK with ALTER TABLE. These guards make a
-- responsible contact authoritative and prevent cross-project/cross-tenant
-- references even if an application query regresses.
CREATE TRIGGER records_responsible_contact_insert_guard
BEFORE INSERT ON records
WHEN NEW.current_responsible_contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_contacts contact
    WHERE contact.id = NEW.current_responsible_contact_id
      AND contact.organization_id = NEW.organization_id
      AND contact.project_id = NEW.project_id
      AND contact.archived_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'responsible contact must belong to the active project');
END;

CREATE TRIGGER records_responsible_contact_update_guard
BEFORE UPDATE OF current_responsible_contact_id, organization_id, project_id ON records
WHEN NEW.current_responsible_contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_contacts contact
    WHERE contact.id = NEW.current_responsible_contact_id
      AND contact.organization_id = NEW.organization_id
      AND contact.project_id = NEW.project_id
      AND contact.archived_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'responsible contact must belong to the active project');
END;

CREATE TRIGGER records_template_version_insert_guard
BEFORE INSERT ON records
WHEN NEW.template_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM template_versions version
    WHERE version.id = NEW.template_version_id
      AND version.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'template version must belong to the record organization');
END;

CREATE TRIGGER records_template_version_update_guard
BEFORE UPDATE OF template_version_id, organization_id ON records
WHEN NEW.template_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM template_versions version
    WHERE version.id = NEW.template_version_id
      AND version.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'template version must belong to the record organization');
END;

-- RFI-only data. Stable record metadata and lifecycle fields intentionally do
-- not appear here.
CREATE TABLE rfi_details (
  record_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  question TEXT NOT NULL,
  contractor_suggestion TEXT,
  drawing_references TEXT,
  specification_references TEXT,
  submitted_by_legacy_text TEXT,
  response TEXT,
  response_by_user_id TEXT,
  response_by_contact_id TEXT,
  response_received_at TEXT,
  cost_impact_legacy_text TEXT,
  schedule_impact_legacy_text TEXT,
  closure_notes TEXT,
  legacy_reference TEXT,
  legacy_workflow_status TEXT,
  issuance_reconciliation_state TEXT NOT NULL CHECK (
    issuance_reconciliation_state IN ('not_issued', 'legacy_incomplete')
  ),
  FOREIGN KEY (record_id, organization_id, project_id)
    REFERENCES records(id, organization_id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, response_by_user_id)
    REFERENCES organization_memberships(organization_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (response_by_contact_id)
    REFERENCES project_contacts(id) ON DELETE RESTRICT,
  UNIQUE (record_id, organization_id)
);

CREATE INDEX idx_rfi_details_project
  ON rfi_details(organization_id, project_id, record_id);

-- A small permanent identity map makes post-deploy reconciliation possible
-- after the 0013 parent table has been retired.
CREATE TABLE rfi_0014_reconciliation (
  legacy_rfi_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL UNIQUE,
  draft_revision_id TEXT NOT NULL UNIQUE,
  migrated_at TEXT NOT NULL,
  FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE RESTRICT,
  FOREIGN KEY (draft_revision_id) REFERENCES record_revisions(id) ON DELETE RESTRICT
);

-- Preserve stable identity by using the RFI id as the record id. An id
-- collision fails the migration rather than silently remapping a record.
INSERT INTO records (
  id, organization_id, project_id, record_type, record_type_key,
  record_number, sequence_no, title, description, status, workflow_status,
  discipline, source, created_by, current_revision_id, archived_at,
  template_version_id, current_responsible_contact_id,
  responsible_party_legacy_text, due_date, issued_at, returned_at, closed_at,
  lock_version, created_at, updated_at
)
SELECT
  rfi.id,
  rfi.organization_id,
  rfi.project_id,
  'other',
  'rfi',
  rfi.rfi_number,
  rfi.issued_number_sequence,
  rfi.subject,
  NULL,
  'active',
  CASE
    WHEN rfi.status IN ('draft', 'ready_to_issue') THEN rfi.status
    ELSE 'ready_to_issue'
  END,
  NULL,
  'rfi',
  COALESCE(
    rfi.created_by,
    (SELECT membership.user_id
       FROM project_memberships membership
      WHERE membership.organization_id = rfi.organization_id
        AND membership.project_id = rfi.project_id
        AND membership.status = 'active'
      ORDER BY membership.created_at, membership.id LIMIT 1),
    (SELECT membership.user_id
       FROM organization_memberships membership
      WHERE membership.organization_id = rfi.organization_id
        AND membership.status = 'active'
      ORDER BY membership.created_at, membership.id LIMIT 1)
  ),
  NULL,
  NULL,
  rfi.template_version_id,
  CASE
    WHEN rfi.responsible_party IS NOT NULL
      AND trim(rfi.responsible_party) <> ''
      AND 1 = (
        SELECT COUNT(*) FROM project_contacts contact
        WHERE contact.organization_id = rfi.organization_id
          AND contact.project_id = rfi.project_id
          AND contact.archived_at IS NULL
          AND lower(trim(contact.contact_name)) = lower(trim(rfi.responsible_party))
      )
    THEN (
      SELECT contact.id FROM project_contacts contact
      WHERE contact.organization_id = rfi.organization_id
        AND contact.project_id = rfi.project_id
        AND contact.archived_at IS NULL
        AND lower(trim(contact.contact_name)) = lower(trim(rfi.responsible_party))
      LIMIT 1
    )
    ELSE NULL
  END,
  CASE
    WHEN rfi.responsible_party IS NOT NULL
      AND trim(rfi.responsible_party) <> ''
      AND 1 = (
        SELECT COUNT(*) FROM project_contacts contact
        WHERE contact.organization_id = rfi.organization_id
          AND contact.project_id = rfi.project_id
          AND contact.archived_at IS NULL
          AND lower(trim(contact.contact_name)) = lower(trim(rfi.responsible_party))
      )
    THEN NULL
    ELSE rfi.responsible_party
  END,
  rfi.requested_response_date,
  rfi.issued_at,
  rfi.response_received_at,
  rfi.closed_at,
  rfi.lock_version,
  rfi.created_at,
  rfi.updated_at
FROM rfi_records rfi;

INSERT INTO rfi_details (
  record_id, organization_id, project_id, question, contractor_suggestion,
  drawing_references, specification_references, submitted_by_legacy_text,
  response, response_by_user_id, response_by_contact_id, response_received_at,
  cost_impact_legacy_text, schedule_impact_legacy_text, closure_notes,
  legacy_reference, legacy_workflow_status, issuance_reconciliation_state
)
SELECT
  rfi.id,
  rfi.organization_id,
  rfi.project_id,
  rfi.question,
  rfi.contractor_suggestion,
  rfi.drawing_references,
  rfi.specification_references,
  rfi.submitted_by,
  response.response,
  NULL,
  NULL,
  COALESCE(rfi.response_received_at, response.created_at),
  rfi.cost_impact,
  rfi.schedule_impact,
  NULL,
  rfi.legacy_reference,
  rfi.status,
  CASE
    WHEN rfi.status NOT IN ('draft', 'ready_to_issue')
      OR rfi.rfi_number IS NOT NULL OR rfi.issued_at IS NOT NULL
    THEN 'legacy_incomplete'
    ELSE 'not_issued'
  END
FROM rfi_records rfi
LEFT JOIN rfi_responses response ON response.rfi_id = rfi.id;

-- Every migrated RFI receives one real draft revision. This is the exact
-- revision to which existing and future draft supporting files belong.
INSERT INTO record_revisions (
  id, organization_id, project_id, record_id, revision_number,
  revision_label, title, description, discipline, source, change_summary,
  status, created_by, created_at
)
SELECT
  rfi.id || ':rfi-draft-v1',
  rfi.organization_id,
  rfi.project_id,
  rfi.id,
  1,
  'Draft',
  rfi.subject,
  rfi.question,
  NULL,
  'rfi',
  'RFI draft reconciled by migration 0014',
  'draft',
  record.created_by,
  rfi.created_at
FROM rfi_records rfi
JOIN records record ON record.id = rfi.id AND record.record_type_key = 'rfi';

INSERT INTO record_revision_sequences (record_id, organization_id, last_number)
SELECT rfi.id, rfi.organization_id, 1 FROM rfi_records rfi;

UPDATE records
SET current_revision_id = id || ':rfi-draft-v1'
WHERE record_type_key = 'rfi';

INSERT INTO rfi_0014_reconciliation (
  legacy_rfi_id, record_id, draft_revision_id, migrated_at
)
SELECT id, id, id || ':rfi-draft-v1', datetime('now') FROM rfi_records;

-- The shared revision-file association now carries an explicit required role.
-- Existing document files are primary documents; migrated RFI files retain
-- their original role and their exact object metadata.
ALTER TABLE revision_files ADD COLUMN role TEXT NOT NULL DEFAULT 'primary_document'
  CHECK (role IN (
    'primary_document', 'supporting_attachment', 'reference_drawing',
    'response_attachment', 'generated_artifact'
  ));

INSERT INTO revision_files (
  id, organization_id, project_id, record_id, revision_id, storage_key,
  original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at,
  role
)
SELECT
  attachment.id,
  attachment.organization_id,
  attachment.project_id,
  attachment.rfi_id,
  attachment.rfi_id || ':rfi-draft-v1',
  attachment.storage_key,
  attachment.original_filename,
  attachment.media_type,
  attachment.byte_size,
  attachment.sha256,
  attachment.uploaded_by,
  attachment.uploaded_at,
  attachment.role
FROM rfi_attachments attachment;

CREATE INDEX IF NOT EXISTS idx_revision_files_revision_role_uploaded
  ON revision_files(revision_id, role, uploaded_at ASC, id ASC);

-- Preserve response history while changing its parent to the stable record.
CREATE TABLE rfi_responses_v2 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  response TEXT NOT NULL,
  responded_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (record_id, organization_id)
    REFERENCES rfi_details(record_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (record_id, organization_id, project_id)
    REFERENCES records(id, organization_id, project_id) ON DELETE RESTRICT,
  UNIQUE (record_id)
);

INSERT INTO rfi_responses_v2 (
  id, organization_id, project_id, record_id, response, responded_by, created_at
)
SELECT
  response.id,
  response.organization_id,
  record.project_id,
  response.rfi_id,
  response.response,
  response.responded_by,
  response.created_at
FROM rfi_responses response
JOIN records record ON record.id = response.rfi_id
  AND record.organization_id = response.organization_id;

-- Move type-specific numbering state to a shared per-record-type sequence.
CREATE TABLE project_record_type_sequences (
  organization_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_type_key TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, project_id, record_type_key),
  FOREIGN KEY (project_id, organization_id)
    REFERENCES projects(id, organization_id) ON DELETE RESTRICT
);

INSERT INTO project_record_type_sequences (
  organization_id, project_id, record_type_key, last_number, updated_at
)
SELECT organization_id, project_id, 'rfi', last_number, datetime('now')
FROM rfi_number_sequences;

INSERT OR IGNORE INTO project_record_type_sequences (
  organization_id, project_id, record_type_key, last_number, updated_at
)
SELECT organization_id, project_id, 'rfi', COALESCE(MAX(issued_number_sequence), 0), datetime('now')
FROM rfi_records
GROUP BY organization_id, project_id;

-- Abort the migration before any legacy table is retired unless identity,
-- details, revisions, responses, and attachment metadata all reconciled.
CREATE TABLE _rfi_0014_assertion (
  check_name TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO _rfi_0014_assertion VALUES (
  'rfi identity',
  (SELECT COUNT(*) FROM rfi_records) =
    (SELECT COUNT(*) FROM rfi_0014_reconciliation)
  AND NOT EXISTS (
    SELECT 1 FROM rfi_records source
    LEFT JOIN records record ON record.id = source.id
      AND record.organization_id = source.organization_id
      AND record.project_id = source.project_id
      AND record.record_type_key = 'rfi'
    LEFT JOIN rfi_details details ON details.record_id = source.id
      AND details.organization_id = source.organization_id
      AND details.project_id = source.project_id
    LEFT JOIN record_revisions revision ON revision.id = source.id || ':rfi-draft-v1'
      AND revision.record_id = source.id
    WHERE record.id IS NULL OR details.record_id IS NULL OR revision.id IS NULL
  )
);

INSERT INTO _rfi_0014_assertion VALUES (
  'rfi stable fields',
  NOT EXISTS (
    SELECT 1 FROM rfi_records source
    JOIN records target ON target.id = source.id
    WHERE target.title <> source.subject
      OR COALESCE(target.record_number, '') <> COALESCE(source.rfi_number, '')
      OR COALESCE(target.due_date, '') <> COALESCE(source.requested_response_date, '')
      OR COALESCE(target.issued_at, '') <> COALESCE(source.issued_at, '')
      OR COALESCE(target.closed_at, '') <> COALESCE(source.closed_at, '')
      OR target.lock_version <> source.lock_version
  )
);

INSERT INTO _rfi_0014_assertion VALUES (
  'rfi detail fields',
  NOT EXISTS (
    SELECT 1 FROM rfi_records source
    JOIN rfi_details target ON target.record_id = source.id
    WHERE target.question <> source.question
      OR COALESCE(target.contractor_suggestion, '') <> COALESCE(source.contractor_suggestion, '')
      OR COALESCE(target.drawing_references, '') <> COALESCE(source.drawing_references, '')
      OR COALESCE(target.specification_references, '') <> COALESCE(source.specification_references, '')
      OR COALESCE(target.cost_impact_legacy_text, '') <> COALESCE(source.cost_impact, '')
      OR COALESCE(target.schedule_impact_legacy_text, '') <> COALESCE(source.schedule_impact, '')
  )
);

INSERT INTO _rfi_0014_assertion VALUES (
  'rfi responses',
  (SELECT COUNT(*) FROM rfi_responses) =
    (SELECT COUNT(*) FROM rfi_responses_v2)
);

INSERT INTO _rfi_0014_assertion VALUES (
  'rfi attachments',
  (SELECT COUNT(*) FROM rfi_attachments) =
    (SELECT COUNT(*) FROM revision_files file
      JOIN rfi_0014_reconciliation map ON map.record_id = file.record_id
      WHERE file.revision_id = map.draft_revision_id
        AND file.role IN ('supporting_attachment', 'reference_drawing'))
  AND NOT EXISTS (
    SELECT 1 FROM rfi_attachments source
    LEFT JOIN revision_files target ON target.id = source.id
      AND target.record_id = source.rfi_id
      AND target.revision_id = source.rfi_id || ':rfi-draft-v1'
      AND target.storage_key = source.storage_key
      AND target.original_filename = source.original_filename
      AND target.media_type = source.media_type
      AND target.byte_size = source.byte_size
      AND target.sha256 = source.sha256
      AND target.uploaded_by = source.uploaded_by
      AND target.uploaded_at = source.uploaded_at
      AND target.role = source.role
    WHERE target.id IS NULL
  )
);

DROP TABLE _rfi_0014_assertion;

-- Retire the parallel platform only after the assertions above pass.
DROP TABLE rfi_attachments;
DROP TABLE rfi_responses;
DROP TABLE rfi_records;
DROP TABLE rfi_number_sequences;
ALTER TABLE rfi_responses_v2 RENAME TO rfi_responses;

CREATE INDEX idx_rfi_responses_organization_record
  ON rfi_responses(organization_id, project_id, record_id);

UPDATE app_meta SET schema_version = 12 WHERE id = 1;

-- Post-migration reconciliation query (expected: missing_* = 0):
-- SELECT
--   COUNT(*) AS migrated_rfis,
--   SUM(CASE WHEN record.id IS NULL THEN 1 ELSE 0 END) AS missing_records,
--   SUM(CASE WHEN details.record_id IS NULL THEN 1 ELSE 0 END) AS missing_details,
--   SUM(CASE WHEN revision.id IS NULL THEN 1 ELSE 0 END) AS missing_revisions
-- FROM rfi_0014_reconciliation map
-- LEFT JOIN records record ON record.id = map.record_id
-- LEFT JOIN rfi_details details ON details.record_id = map.record_id
-- LEFT JOIN record_revisions revision ON revision.id = map.draft_revision_id;
