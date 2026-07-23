-- Deterministic, non-production source data for migration 0014 rehearsal.
-- This file is applied only by scripts/rfi-0014-rehearsal.mjs after 0001-0013.
INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at)
VALUES ('rfi-0014-org', 'RFI 0014 Rehearsal', 'rfi-0014-rehearsal', 'active', '{}', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at)
VALUES ('rfi-0014-user', 'rfi-0014-rehearsal-subject', 'rfi-0014@example.test', 'RFI Rehearsal User', 'active', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at)
VALUES ('rfi-0014-org-membership', 'rfi-0014-org', 'rfi-0014-user', 'org_admin', 'active', '2026-07-23T00:00:00Z');
INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at)
VALUES ('rfi-0014-project', 'rfi-0014-org', 'RFI-0014', 'RFI 0014 Rehearsal Project', 'active', 'UTC', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at)
VALUES ('rfi-0014-project-membership', 'rfi-0014-org', 'rfi-0014-project', 'rfi-0014-user', 'project_manager', 'active', '2026-07-23T00:00:00Z');
INSERT INTO project_contacts (id, organization_id, project_id, contact_name, contact_type, created_at, updated_at)
VALUES ('rfi-0014-contact', 'rfi-0014-org', 'rfi-0014-project', 'Architect of Record', 'architect', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
INSERT INTO templates (id, organization_id, key, name, kind, created_by, created_at, updated_at)
VALUES ('rfi-0014-template', 'rfi-0014-org', 'base-rfi', 'BASE RFI', 'form', 'rfi-0014-user', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
INSERT INTO template_version_sequences (template_id, organization_id, last_number)
VALUES ('rfi-0014-template', 'rfi-0014-org', 1);
INSERT INTO template_versions (id, organization_id, template_id, version_number, definition_json, status, created_by, created_at, published_at, published_by)
VALUES ('rfi-0014-template-v1', 'rfi-0014-org', 'rfi-0014-template', 1, '{"kind":"form","title":"RFI","sections":[]}', 'published', 'rfi-0014-user', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z', 'rfi-0014-user');

-- Consumed legacy number with a resolvable Party and a response/attachment.
INSERT INTO rfi_records (id, organization_id, project_id, template_version_id, rfi_number, legacy_reference, status, subject, question, contractor_suggestion, drawing_references, specification_references, responsible_party, submitted_by, requested_response_date, cost_impact, schedule_impact, issued_number_sequence, project_snapshot_json, issued_at, response_received_at, closed_at, lock_version, created_by, created_at, updated_at)
VALUES ('rfi-0014-issued', 'rfi-0014-org', 'rfi-0014-project', 'rfi-0014-template-v1', 'RFI-004', 'LEG-004', 'open', 'Resolved party RFI', 'Confirm lintel elevation.', 'Provide elevation sketch.', 'A-401', '05 50 00', 'Architect of Record', 'Legacy contractor', '2026-08-01', 'potential', 'two days', 4, '{"project":"rehearsal"}', '2026-07-01T00:00:00Z', NULL, NULL, 3, 'rfi-0014-user', '2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z');
INSERT INTO rfi_responses (id, organization_id, rfi_id, response, responded_by, created_at)
VALUES ('rfi-0014-response', 'rfi-0014-org', 'rfi-0014-issued', 'Use elevation 7/A-401.', 'Architect of Record', '2026-07-02T00:00:00Z');
INSERT INTO rfi_attachments (id, organization_id, project_id, rfi_id, role, storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
VALUES ('rfi-0014-attachment', 'rfi-0014-org', 'rfi-0014-project', 'rfi-0014-issued', 'reference_drawing', 'organizations/rfi-0014-org/projects/rfi-0014-project/rfis/rfi-0014-issued/attachments/rfi-0014-attachment', 'A-401.pdf', 'application/pdf', 4, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'rfi-0014-user', '2026-07-01T00:00:00Z');

-- Unconsumed draft with an unresolved Party value.
INSERT INTO rfi_records (id, organization_id, project_id, template_version_id, rfi_number, legacy_reference, status, subject, question, contractor_suggestion, drawing_references, specification_references, responsible_party, submitted_by, requested_response_date, cost_impact, schedule_impact, issued_number_sequence, project_snapshot_json, issued_at, response_received_at, closed_at, lock_version, created_by, created_at, updated_at)
VALUES ('rfi-0014-draft', 'rfi-0014-org', 'rfi-0014-project', 'rfi-0014-template-v1', NULL, NULL, 'draft', 'Unresolved party RFI', 'Confirm finish transition.', NULL, NULL, NULL, 'Unmatched Consultant', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'rfi-0014-user', '2026-07-03T00:00:00Z', '2026-07-03T00:00:00Z');
INSERT INTO rfi_number_sequences (project_id, organization_id, last_number)
VALUES ('rfi-0014-project', 'rfi-0014-org', 4);
