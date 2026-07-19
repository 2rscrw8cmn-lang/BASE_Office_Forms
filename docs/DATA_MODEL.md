# Data Model

## 1. Strategy

Use Cloudflare D1 for relational data and metadata. Use R2 for files and generated artifacts.

The data model is additive to the existing `folders` and `documents` tables. Do not destructively repurpose those tables during the first implementation phases.

All identifiers use UUIDs for internal identity. Human-readable sequence numbers are separate fields.

All organization-owned tables include `organization_id`.

## 2. Core tables

### 2.1 organizations

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | Required |
| slug | TEXT | Unique |
| status | TEXT | active, suspended |
| settings_json | TEXT | Non-security preferences |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### 2.2 users

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| identity_subject | TEXT | Unique provider subject |
| email | TEXT | Normalized |
| display_name | TEXT | |
| status | TEXT | active, disabled |
| created_at | TEXT | |
| updated_at | TEXT | |

### 2.3 organization_memberships

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| organization_id | TEXT FK | |
| user_id | TEXT FK | |
| role | TEXT | org_admin, document_control_admin, project_manager, contributor, viewer |
| status | TEXT | active, invited, disabled |
| created_at | TEXT | |

Unique: `(organization_id, user_id)`.

### 2.4 projects

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| organization_id | TEXT FK | Tenant boundary |
| name | TEXT | Full project name |
| short_name | TEXT | Project display code |
| internal_project_no | TEXT | BASE number |
| client_project_no | TEXT | Optional |
| architect_project_no | TEXT | Optional |
| owner_project_no | TEXT | Optional |
| status | TEXT | planning, bidding, construction, closeout, archived |
| address_json | TEXT | Structured address |
| start_date | TEXT | |
| end_date | TEXT | |
| routing_json | TEXT | Default recipients and rules |
| created_at | TEXT | |
| updated_at | TEXT | |
| archived_at | TEXT | Nullable |

Unique where populated: `(organization_id, internal_project_no)`.

### 2.5 project_members

Connect users to projects.

Columns:

- id
- organization_id
- project_id
- user_id
- project_role
- created_at

Unique: `(project_id, user_id)`.

### 2.6 contacts

Organization contact directory.

Columns:

- id
- organization_id
- company_name
- first_name
- last_name
- email
- phone
- status
- source
- source_external_id
- created_at
- updated_at

### 2.7 project_contacts

Connect contacts to projects.

Columns:

- id
- organization_id
- project_id
- contact_id
- role
- routing_priority
- is_default_to
- is_default_cc
- excluded_from_routing
- notes
- created_at

## 3. Templates and controlled documents

### 3.1 templates

Columns:

- id
- organization_id
- record_type_key
- name
- category
- status: draft, published, retired
- current_version_id
- created_by
- created_at
- updated_at

### 3.2 template_versions

Columns:

- id
- organization_id
- template_id
- version_no
- renderer_schema_version
- definition_json
- binding_schema_json
- defaults_json
- change_summary
- status: draft, published
- published_by
- published_at
- created_at

Unique: `(template_id, version_no)`.

Published rows are immutable.

### 3.3 branding_profiles

Columns:

- id
- organization_id
- name
- is_default
- logo_file_id
- settings_json
- created_at
- updated_at

### 3.4 controlled_documents

Columns:

- id
- organization_id
- document_no
- title
- owner_user_id
- status: draft, active, retired
- current_revision_id
- created_at
- updated_at

### 3.5 controlled_document_revisions

Columns:

- id
- organization_id
- controlled_document_id
- revision_no
- status: draft, approved, published, superseded
- effective_date
- supersedes_revision_id
- template_version_id
- content_data_json
- render_payload_json
- artifact_id
- approved_by
- approved_at
- published_by
- published_at
- created_at

Unique: `(controlled_document_id, revision_no)`.

Published revisions are immutable.

## 4. Project records

### 4.1 sequence_counters

Columns:

- id
- organization_id
- project_id
- record_type_key
- scope_key
- next_value
- updated_at

Unique: `(organization_id, project_id, record_type_key, scope_key)`.

Examples:

- RFI scope key: `default`
- Submittal item scope key: `06-6410`

Sequence assignment must occur in one atomic server-side statement.

### 4.2 records

Columns:

- id
- organization_id
- project_id
- record_type_key
- template_version_id
- sequence_no
- display_no
- title
- workflow_status
- current_responsible_user_id
- current_responsible_contact_id
- due_date
- issued_at
- returned_at
- closed_at
- current_revision_no
- data_json
- lock_version
- created_by
- created_at
- updated_at
- archived_at

Constraints:

- Unique `(organization_id, project_id, record_type_key, sequence_no)` where sequence exists
- Unique `(organization_id, project_id, record_type_key, display_no)`
- `lock_version` is for optimistic concurrency only
- Official number cannot change after first issue

### 4.3 rfi_details

One-to-one with `records`.

Columns:

- record_id PK/FK
- organization_id
- question
- contractor_suggestion
- drawing_references
- specification_references
- requested_response_date
- response
- response_by_user_id
- response_by_contact_id
- response_received_at
- cost_impact_status
- cost_impact_amount
- schedule_impact_status
- schedule_impact_days
- closure_notes

### 4.4 submittal_details

One-to-one with `records`.

Columns:

- record_id PK/FK
- organization_id
- specification_section
- item_sequence
- stable_base_no
- description
- vendor_contact_id
- submitter_contact_id
- reviewer_contact_id
- required_on_site_date
- review_disposition
- final_approval_at

Unique: `(organization_id, project_id via record, stable_base_no)` enforced through service validation and indexed projection.

### 4.5 record_revisions

Columns:

- id
- organization_id
- record_id
- revision_no
- revision_type
- status
- issue_date
- returned_date
- issued_by
- disposition
- response_text
- render_payload_json
- artifact_id
- checksum
- created_at

Unique: `(record_id, revision_no)`.

Once `issue_date` is set, the revision is immutable except for returned review fields written through a controlled transition.

### 4.6 record_files

Columns:

- id
- organization_id
- record_id
- record_revision_id
- file_id
- role
- sort_order
- description
- created_by
- created_at

A role is required.

## 5. Files and artifacts

### 5.1 files

Columns:

- id
- organization_id
- storage_provider
- bucket
- object_key
- original_name
- media_type
- size_bytes
- sha256
- upload_status
- security_status
- uploaded_by
- uploaded_at
- deleted_at

Unique: `(organization_id, sha256, size_bytes)` may be used for optional deduplication.

### 5.2 artifacts

Columns:

- id
- organization_id
- project_id
- record_id
- record_revision_id
- artifact_type
- file_id
- generated_by
- generation_inputs_json
- generated_at
- checksum

Artifacts are immutable.

## 6. Delivery, sharing, and audit

### 6.1 deliveries

Columns:

- id
- organization_id
- project_id
- record_id
- record_revision_id
- artifact_id
- channel
- subject_snapshot
- message_snapshot
- sent_by
- sent_at
- status
- external_provider_id
- created_at

### 6.2 delivery_recipients

Columns:

- id
- delivery_id
- recipient_type
- contact_id
- email_snapshot
- recipient_role
- delivery_status
- delivered_at

`recipient_role`: to, cc, bcc.

### 6.3 share_links

Columns:

- id
- organization_id
- project_id
- object_type
- object_id
- token_hash
- permission_scope
- recipient_email
- expires_at
- max_uses
- use_count
- revoked_at
- created_by
- created_at

Never store the plaintext token after creation.

### 6.4 share_access_events

Columns:

- id
- share_link_id
- accessed_at
- action
- ip_hash
- user_agent_summary
- success
- metadata_json

### 6.5 activity_events

Columns:

- id
- organization_id
- project_id
- actor_user_id
- actor_type
- object_type
- object_id
- action
- prior_state_json
- new_state_json
- metadata_json
- correlation_id
- created_at

Activity events are append-only.

### 6.6 idempotency_keys

Used for issue, upload-finalize, delivery, and AI job endpoints.

Columns:

- organization_id
- key
- operation
- request_hash
- response_json
- expires_at
- created_at

Unique: `(organization_id, key, operation)`.

## 7. Numbering rules

### RFI

- Drafts remain unnumbered.
- First issue atomically assigns the next project RFI sequence.
- Display format: `RFI-001`.
- Number never changes.
- A voided RFI number is not reused.

### Submittal

Stable item number:

```text
{specification_section}-{item_sequence}
06-6410-01
```

Revision number:

```text
{stable_base_no}-{revision_no}
06-6410-01-00
```

- Item sequence is unique within project and specification section.
- Revision starts at `00`.
- Resubmission increments revision.
- Revision numbers are never reused.

### Controlled documents

Revision format is configured per organization but stored as text. The system enforces uniqueness and immutability, not semantic numbering style.

## 8. Status versus disposition

Never combine these fields.

### Workflow status

Where the record is in the process.

### Review disposition

The reviewer outcome.

Example:

```text
workflow_status = returned
review_disposition = approved_as_noted
```

## 9. Indexes

Minimum indexes:

- records by organization/project/type/status
- records by display number
- records by due date
- records by responsible user/contact
- record revisions by record/revision
- activity events by object/time
- files by organization/checksum
- share links by token hash
- deliveries by record/time
- templates by organization/type/status

## 10. Soft deletion and retention

Use soft deletion for projects, records, files, templates, and controlled documents.

Issued revisions, artifacts, deliveries, and activity events are not deleted through normal product actions.

A future retention job may purge eligible data under organization policy and must write a purge audit record.

## 11. Existing shared-library compatibility

Keep:

- `folders`
- `documents`

Rename the meaning of `documents.version` in code and UI to `lock_version` or `save_version`. Do not treat it as a controlled revision.

Add optional linkage later:

- `documents.organization_id`
- `documents.template_id`
- `documents.migrated_record_id`
- `documents.library_classification`

No destructive migration is required for the first release.

## 12. Migration source tracking

Use `migration_sources`:

- id
- organization_id
- source_system
- source_object_type
- source_external_id
- target_object_type
- target_object_id
- source_url
- imported_at
- import_batch_id
- source_hash

This prevents duplicate imports and preserves traceability to Notion.
