import type {
  RfiOfficialIssueResult,
  RfiIssueRecipientSummary,
} from "../../../domain/rfis/official-issue";
import type { ProjectAddress } from "../../../domain/projects/project";
import type { RfiAttachment } from "../../../domain/rfis/rfi";

export interface OfficialIssueRecipientSnapshot extends RfiIssueRecipientSummary {
  contactType: string;
  phone: string | null;
  address: ProjectAddress;
}

export interface OfficialArtifactInput {
  fileId: string;
  storageKey: string;
  originalFilename: string;
  mediaType: "application/pdf";
  byteSize: number;
  sha256: string;
}

export interface CommitRfiOfficialIssueInput {
  issueId: string;
  organizationId: string;
  projectId: string;
  rfiId: string;
  revisionId: string;
  revisionNumber: number;
  revisionCreatedBy: string;
  revisionCreatedAt: string;
  subject: string;
  question: string;
  expectedLastRfiNumber: number;
  existingRfiSequence: number | null;
  officialDisplayNumber: string;
  templateVersionId: string;
  templateDefinitionJson: string;
  templateDefinitionSha256: string;
  renderPayloadJson: string;
  renderPayloadSha256: string;
  rendererVersion: string;
  artifact: OfficialArtifactInput;
  includedFiles: RfiAttachment[];
  recipients: OfficialIssueRecipientSnapshot[];
  cc: OfficialIssueRecipientSnapshot[];
  responseDueDate: string;
  issuedBy: string;
  issuedByDisplayName: string | null;
  issuedAt: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  issuanceId: string;
}

interface IdempotencyRow {
  project_id: string;
  resource_id: string;
  request_hash: string;
  response_json: string;
}

export type RfiOfficialCommitState =
  | { status: "committed"; result: RfiOfficialIssueResult }
  | { status: "absent" }
  | { status: "conflict" }
  | { status: "unknown" };

export class D1RfiOfficialIssueRepository {
  constructor(private readonly database: D1Database) {}

  async findIdempotentResult(
    organizationId: string,
    projectId: string,
    rfiId: string,
    idempotencyKey: string,
  ): Promise<{
    projectId: string;
    resourceId: string;
    requestedResourceMatches: boolean;
    requestHash: string;
    result: RfiOfficialIssueResult;
  } | null> {
    const row = await this.database
      .prepare(
        `SELECT project_id, resource_id, request_hash, response_json
         FROM idempotency_keys
         WHERE organization_id = ? AND operation = 'rfi.issue'
           AND idempotency_key = ?`,
      )
      .bind(organizationId, idempotencyKey)
      .first<IdempotencyRow>();
    if (!row) return null;
    return {
      projectId: row.project_id,
      resourceId: row.resource_id,
      requestedResourceMatches:
        row.project_id === projectId && row.resource_id === rfiId,
      requestHash: row.request_hash,
      result: JSON.parse(row.response_json) as RfiOfficialIssueResult,
    };
  }

  async findOfficialIssueResult(
    organizationId: string,
    projectId: string,
    rfiId: string,
  ): Promise<RfiOfficialIssueResult | null> {
    const row = await this.database
      .prepare(
        `SELECT response_json FROM idempotency_keys
         WHERE organization_id = ? AND project_id = ?
           AND operation = 'rfi.issue' AND resource_id = ?`,
      )
      .bind(organizationId, projectId, rfiId)
      .first<{ response_json: string }>();
    return row
      ? (JSON.parse(row.response_json) as RfiOfficialIssueResult)
      : null;
  }

  async hasOfficialIssue(
    organizationId: string,
    projectId: string,
    rfiId: string,
  ): Promise<boolean> {
    const row = await this.database
      .prepare(
        `SELECT 1 AS found FROM rfi_official_issues
         WHERE organization_id = ? AND project_id = ? AND rfi_id = ?`,
      )
      .bind(organizationId, projectId, rfiId)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  async peekLastRfiNumber(
    organizationId: string,
    projectId: string,
  ): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT last_number FROM project_record_type_sequences
         WHERE organization_id = ? AND project_id = ?
           AND record_type_key = 'rfi'`,
      )
      .bind(organizationId, projectId)
      .first<{ last_number: number }>();
    return row?.last_number ?? 0;
  }

  async findOrganizationName(organizationId: string): Promise<string | null> {
    const row = await this.database
      .prepare(
        "SELECT name FROM organizations WHERE id = ? AND status = 'active'",
      )
      .bind(organizationId)
      .first<{ name: string }>();
    return row?.name ?? null;
  }

  async commit(input: CommitRfiOfficialIssueInput): Promise<void> {
    const statements: D1PreparedStatement[] = [];
    const expectedFileCount = input.includedFiles.length + 1;
    const expectedRecipientCount = input.recipients.length + input.cc.length;

    statements.push(
      this.database
        .prepare(
          `INSERT OR IGNORE INTO project_record_type_sequences
            (organization_id, project_id, record_type_key, last_number, updated_at)
           SELECT ?, ?, 'rfi', 0, ?
           WHERE EXISTS (
             SELECT 1 FROM projects WHERE id = ? AND organization_id = ?
           )`,
        )
        .bind(
          input.organizationId,
          input.projectId,
          input.issuedAt,
          input.projectId,
          input.organizationId,
        ),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO project_issuance_sequences
            (project_id, organization_id, next_sequence)
           SELECT ?, ?, 1
           WHERE EXISTS (
             SELECT 1 FROM projects WHERE id = ? AND organization_id = ?
           )`,
        )
        .bind(
          input.projectId,
          input.organizationId,
          input.projectId,
          input.organizationId,
        ),
      this.database
        .prepare(
          `UPDATE records
           SET sequence_no = COALESCE(sequence_no, ?),
               record_number = COALESCE(record_number, ?),
               workflow_status = 'open',
               due_date = ?,
               issued_at = ?,
               lock_version = lock_version + 1,
               updated_at = ?
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_type_key = 'rfi' AND status = 'active'
             AND workflow_status = 'ready_to_issue'
             AND current_revision_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM rfi_official_issues issue WHERE issue.rfi_id = records.id
             )
             AND (
               sequence_no IS NOT NULL OR EXISTS (
                 SELECT 1 FROM project_record_type_sequences sequence
                 WHERE sequence.organization_id = records.organization_id
                   AND sequence.project_id = records.project_id
                   AND sequence.record_type_key = 'rfi'
                   AND sequence.last_number = ?
               )
             )`,
        )
        .bind(
          input.existingRfiSequence ?? input.expectedLastRfiNumber + 1,
          input.officialDisplayNumber,
          input.responseDueDate,
          input.issuedAt,
          input.issuedAt,
          input.rfiId,
          input.organizationId,
          input.projectId,
          input.revisionId,
          input.expectedLastRfiNumber,
        ),
    );

    if (input.existingRfiSequence === null) {
      statements.push(
        this.database
          .prepare(
            `UPDATE project_record_type_sequences
             SET last_number = last_number + 1, updated_at = ?
             WHERE organization_id = ? AND project_id = ?
               AND record_type_key = 'rfi' AND last_number = ?
               AND EXISTS (
                 SELECT 1 FROM records
                 WHERE id = ? AND organization_id = ? AND project_id = ?
                   AND sequence_no = ? AND workflow_status = 'open'
                   AND issued_at = ?
               )`,
          )
          .bind(
            input.issuedAt,
            input.organizationId,
            input.projectId,
            input.expectedLastRfiNumber,
            input.rfiId,
            input.organizationId,
            input.projectId,
            input.expectedLastRfiNumber + 1,
            input.issuedAt,
          ),
      );
    }

    statements.push(
      this.database
        .prepare(
          `UPDATE record_revisions
           SET status = 'published', revision_label = 'Original Issue',
               title = ?, description = ?, change_summary = 'Official RFI issue'
           WHERE id = ? AND organization_id = ? AND project_id = ?
             AND record_id = ? AND status = 'draft'
             AND EXISTS (
               SELECT 1 FROM records
               WHERE id = ? AND organization_id = ? AND project_id = ?
                 AND current_revision_id = ? AND workflow_status = 'open'
                 AND issued_at = ?
             )`,
        )
        .bind(
          input.subject,
          input.question,
          input.revisionId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.rfiId,
          input.organizationId,
          input.projectId,
          input.revisionId,
          input.issuedAt,
        ),
      this.database
        .prepare(
          `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, role,
             storage_key, original_filename, media_type, byte_size, sha256,
             uploaded_by, uploaded_at)
           SELECT ?, ?, ?, ?, ?, 'generated_artifact', ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM record_revisions
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND record_id = ? AND status = 'published'
           )`,
        )
        .bind(
          input.artifact.fileId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionId,
          input.artifact.storageKey,
          input.artifact.originalFilename,
          input.artifact.mediaType,
          input.artifact.byteSize,
          input.artifact.sha256,
          input.issuedBy,
          input.issuedAt,
          input.revisionId,
          input.organizationId,
          input.projectId,
          input.rfiId,
        ),
      this.database
        .prepare(
          `INSERT INTO issuances
            (id, organization_id, project_id, record_id, revision_id,
             issue_number, issue_sequence, purpose, notes,
             revision_snapshot_json, issued_by, issued_at, correlation_id)
           SELECT ?, ?, ?, ?, ?,
             'ISS-' || printf('%03d', sequence.next_sequence),
             sequence.next_sequence, 'for_information', NULL,
             json_object(
               'id', ?, 'organizationId', ?, 'projectId', ?, 'recordId', ?,
               'revisionNumber', ?, 'revisionLabel', 'Original Issue',
               'status', 'published', 'title', ?, 'description', ?,
               'discipline', NULL, 'source', 'rfi',
               'changeSummary', 'Official RFI issue',
               'createdBy', ?, 'createdAt', ?,
               'issuedByDisplayName', ?
             ),
             ?, ?, ?
           FROM project_issuance_sequences sequence
           WHERE sequence.project_id = ? AND sequence.organization_id = ?
             AND EXISTS (
               SELECT 1 FROM record_revisions
               WHERE id = ? AND organization_id = ? AND project_id = ?
                 AND record_id = ? AND status = 'published'
             )`,
        )
        .bind(
          input.issuanceId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionId,
          input.revisionId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionNumber,
          input.subject,
          input.question,
          input.revisionCreatedBy,
          input.revisionCreatedAt,
          input.issuedByDisplayName,
          input.issuedBy,
          input.issuedAt,
          input.requestId,
          input.projectId,
          input.organizationId,
          input.revisionId,
          input.organizationId,
          input.projectId,
          input.rfiId,
        ),
      this.database
        .prepare(
          `UPDATE project_issuance_sequences
           SET next_sequence = next_sequence + 1
           WHERE project_id = ? AND organization_id = ?
             AND EXISTS (
               SELECT 1 FROM issuances
               WHERE id = ? AND organization_id = ? AND project_id = ?
                 AND issue_sequence = project_issuance_sequences.next_sequence
             )`,
        )
        .bind(
          input.projectId,
          input.organizationId,
          input.issuanceId,
          input.organizationId,
          input.projectId,
        ),
    );

    const allFiles = [
      ...input.includedFiles.map((file) => ({
        ...file,
        snapshotKind: "included" as const,
      })),
      {
        id: input.artifact.fileId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        rfiId: input.rfiId,
        revisionId: input.revisionId,
        role: "generated_artifact",
        storageKey: input.artifact.storageKey,
        originalFilename: input.artifact.originalFilename,
        mediaType: input.artifact.mediaType,
        byteSize: input.artifact.byteSize,
        sha256: input.artifact.sha256,
        uploadedBy: input.issuedBy,
        uploadedAt: input.issuedAt,
        snapshotKind: "official_artifact" as const,
      },
    ];
    for (const [index, file] of allFiles.entries()) {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO issuance_files
              (issuance_id, organization_id, project_id, record_id, revision_id,
               file_id, original_filename, media_type, byte_size, sha256,
               storage_key, display_order)
             SELECT ?, organization_id, project_id, record_id, revision_id, id,
                    original_filename, media_type, byte_size, sha256, storage_key, ?
             FROM revision_files
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND record_id = ? AND revision_id = ?
               AND byte_size = ? AND sha256 = ?`,
          )
          .bind(
            input.issuanceId,
            index,
            file.id,
            input.organizationId,
            input.projectId,
            input.rfiId,
            input.revisionId,
            file.byteSize,
            file.sha256,
          ),
      );
    }

    statements.push(
      this.database
        .prepare(
          `INSERT INTO rfi_official_issues
            (id, organization_id, project_id, rfi_id, revision_id, issuance_id,
             template_version_id, template_definition_json,
             template_definition_sha256, render_payload_json,
             render_payload_sha256, renderer_version, artifact_file_id,
             artifact_storage_key, artifact_filename, artifact_media_type,
             artifact_byte_size, artifact_sha256, delivery_mode,
             response_due_date, issued_by, issued_at, request_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  'record_only', ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM issuances
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND record_id = ? AND revision_id = ?
           ) AND EXISTS (
             SELECT 1 FROM revision_files
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND record_id = ? AND revision_id = ?
               AND role = 'generated_artifact'
           )`,
        )
        .bind(
          input.issueId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionId,
          input.issuanceId,
          input.templateVersionId,
          input.templateDefinitionJson,
          input.templateDefinitionSha256,
          input.renderPayloadJson,
          input.renderPayloadSha256,
          input.rendererVersion,
          input.artifact.fileId,
          input.artifact.storageKey,
          input.artifact.originalFilename,
          input.artifact.mediaType,
          input.artifact.byteSize,
          input.artifact.sha256,
          input.responseDueDate,
          input.issuedBy,
          input.issuedAt,
          input.requestId,
          input.issuanceId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionId,
          input.artifact.fileId,
          input.organizationId,
          input.projectId,
          input.rfiId,
          input.revisionId,
        ),
    );

    const routed = [
      ...input.recipients.map((contact) => ({
        contact,
        role: "to" as const,
      })),
      ...input.cc.map((contact) => ({ contact, role: "cc" as const })),
    ];
    let toOrder = 0;
    let ccOrder = 0;
    for (const { contact, role } of routed) {
      const displayOrder = role === "to" ? toOrder++ : ccOrder++;
      statements.push(
        this.database
          .prepare(
            `INSERT INTO rfi_issue_recipients
              (issue_id, organization_id, project_id, rfi_id,
               project_contact_id, recipient_role, display_order,
               contact_name_snapshot, company_name_snapshot,
               contact_type_snapshot, email_snapshot, phone_snapshot,
               address_snapshot_json)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM project_contacts
               WHERE id = ? AND organization_id = ? AND project_id = ?
                 AND archived_at IS NULL
             ) AND EXISTS (
               SELECT 1 FROM rfi_official_issues WHERE id = ?
             )`,
          )
          .bind(
            input.issueId,
            input.organizationId,
            input.projectId,
            input.rfiId,
            contact.projectContactId,
            role,
            displayOrder,
            contact.contactName,
            contact.companyName,
            contact.contactType,
            contact.email,
            contact.phone,
            JSON.stringify(contact.address),
            contact.projectContactId,
            input.organizationId,
            input.projectId,
            input.issueId,
          ),
      );
    }

    let includedOrder = 0;
    for (const [index, file] of allFiles.entries()) {
      const displayOrder =
        file.snapshotKind === "included" ? includedOrder++ : 0;
      statements.push(
        this.database
          .prepare(
            `INSERT INTO rfi_issue_file_snapshots
              (issue_id, organization_id, project_id, rfi_id, revision_id,
               file_id, snapshot_kind, file_role, display_order,
               original_filename, media_type, byte_size, sha256, storage_key)
             SELECT ?, organization_id, project_id, record_id, revision_id, id,
                    ?, role, ?, original_filename, media_type, byte_size, sha256,
                    storage_key
             FROM revision_files
             WHERE id = ? AND organization_id = ? AND project_id = ?
               AND record_id = ? AND revision_id = ?
               AND byte_size = ? AND sha256 = ?
               AND EXISTS (
                 SELECT 1 FROM issuance_files
                 WHERE issuance_id = ? AND file_id = revision_files.id
                   AND display_order = ?
               )`,
          )
          .bind(
            input.issueId,
            file.snapshotKind,
            displayOrder,
            file.id,
            input.organizationId,
            input.projectId,
            input.rfiId,
            input.revisionId,
            file.byteSize,
            file.sha256,
            input.issuanceId,
            index,
          ),
      );
    }

    const event = (
      objectType: string,
      objectId: string,
      action: string,
      metadata: Record<string, unknown>,
    ): D1PreparedStatement =>
      this.database
        .prepare(
          `INSERT INTO activity_events
            (id, organization_id, actor_user_id, actor_type, object_type,
             object_id, action, prior_state_json, new_state_json,
             metadata_json, correlation_id, created_at)
           VALUES (?, ?, ?, 'user', ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.organizationId,
          input.issuedBy,
          objectType,
          objectId,
          action,
          JSON.stringify(metadata),
          input.requestId,
          input.issuedAt,
        );
    statements.push(
      event("issuance", input.issuanceId, "issuance.created", {
        recordId: input.rfiId,
        revisionId: input.revisionId,
        fileCount: expectedFileCount,
      }),
      event("file", input.artifact.fileId, "artifact.created", {
        recordId: input.rfiId,
        revisionId: input.revisionId,
        sha256: input.artifact.sha256,
      }),
    );

    statements.push(
      this.database
        .prepare(
          `INSERT INTO idempotency_keys
            (organization_id, project_id, operation, idempotency_key, request_hash,
             resource_id, response_json, created_at, expires_at)
           SELECT ?, ?, 'rfi.issue', ?, ?, ?, json_object(
             'rfiId', record.id,
             'recordId', record.id,
             'officialDisplayNumber', record.record_number,
             'status', 'open',
             'issuedRevision', json_object(
               'id', revision.id,
               'internalRevisionNumber', revision.revision_number,
               'userFacingVersion', 'Original Issue'
             ),
             'issuance', json_object(
               'id', issuance.id,
               'issueNumber', issuance.issue_number
             ),
             'issuedAt', issue.issued_at,
             'responseDueDate', issue.response_due_date,
             'officialArtifact', json_object(
               'fileId', artifact.file_id,
               'role', artifact.file_role,
               'originalFilename', artifact.original_filename,
               'mediaType', artifact.media_type,
               'byteSize', artifact.byte_size,
               'sha256', artifact.sha256
             ),
             'includedFiles', json(COALESCE((
               SELECT json_group_array(json_object(
                 'fileId', selected.file_id,
                 'role', selected.file_role,
                 'originalFilename', selected.original_filename,
                 'mediaType', selected.media_type,
                 'byteSize', selected.byte_size,
                 'sha256', selected.sha256
               ))
               FROM (
                 SELECT * FROM rfi_issue_file_snapshots
                 WHERE issue_id = issue.id AND snapshot_kind = 'included'
                 ORDER BY display_order
               ) selected
             ), '[]')),
             'recipients', json_object(
               'to', json(COALESCE((
                 SELECT json_group_array(json_object(
                   'projectContactId', selected.project_contact_id,
                   'contactName', selected.contact_name_snapshot,
                   'companyName', selected.company_name_snapshot,
                   'email', selected.email_snapshot
                 ))
                 FROM (
                   SELECT * FROM rfi_issue_recipients
                   WHERE issue_id = issue.id AND recipient_role = 'to'
                   ORDER BY display_order
                 ) selected
               ), '[]')),
               'cc', json(COALESCE((
                 SELECT json_group_array(json_object(
                   'projectContactId', selected.project_contact_id,
                   'contactName', selected.contact_name_snapshot,
                   'companyName', selected.company_name_snapshot,
                   'email', selected.email_snapshot
                 ))
                 FROM (
                   SELECT * FROM rfi_issue_recipients
                   WHERE issue_id = issue.id AND recipient_role = 'cc'
                   ORDER BY display_order
                 ) selected
               ), '[]'))
             ),
             'capabilities', json_object(
               'issue', json('false'),
               'recordResponse', json('true'),
               'returnForClarification', json('false'),
               'close', json('false'),
               'reopen', json('false'),
               'void', json('true')
             ),
             'requestId', issue.request_id
           ), ?, NULL
           FROM rfi_official_issues issue
           JOIN records record ON record.id = issue.rfi_id
           JOIN record_revisions revision ON revision.id = issue.revision_id
           JOIN issuances issuance ON issuance.id = issue.issuance_id
           JOIN rfi_issue_file_snapshots artifact
             ON artifact.issue_id = issue.id
            AND artifact.snapshot_kind = 'official_artifact'
           WHERE issue.id = ? AND (
             SELECT COUNT(*) FROM rfi_issue_recipients
             WHERE issue_id = issue.id
           ) = ? AND (
             SELECT COUNT(*) FROM rfi_issue_file_snapshots
             WHERE issue_id = issue.id
           ) = ?`,
        )
        .bind(
          input.organizationId,
          input.projectId,
          input.idempotencyKey,
          input.requestHash,
          input.rfiId,
          input.issuedAt,
          input.issueId,
          expectedRecipientCount,
          expectedFileCount,
        ),
      this.database
        .prepare(
          `INSERT INTO activity_events
            (id, organization_id, actor_user_id, actor_type, object_type,
             object_id, action, prior_state_json, new_state_json,
             metadata_json, correlation_id, created_at)
           VALUES (?, ?, ?, 'user', 'rfi', ?,
             CASE WHEN
               (SELECT COUNT(*) FROM records
                WHERE id = ? AND workflow_status = 'open'
                  AND record_number = ? AND issued_at = ?) = 1
               AND (SELECT COUNT(*) FROM record_revisions
                    WHERE id = ? AND status = 'published') = 1
               AND (SELECT COUNT(*) FROM issuances
                    WHERE id = ?) = 1
               AND (SELECT COUNT(*) FROM issuance_files
                    WHERE issuance_id = ?) = ?
               AND (SELECT COUNT(*) FROM rfi_issue_recipients
                    WHERE issue_id = ?) = ?
               AND (SELECT COUNT(*) FROM rfi_issue_file_snapshots
                    WHERE issue_id = ?) = ?
               AND (SELECT COUNT(*) FROM idempotency_keys
                    WHERE organization_id = ? AND operation = 'rfi.issue'
                      AND idempotency_key = ?) = 1
             THEN 'rfi.issued' ELSE NULL END,
             ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.organizationId,
          input.issuedBy,
          input.rfiId,
          input.rfiId,
          input.officialDisplayNumber,
          input.issuedAt,
          input.revisionId,
          input.issuanceId,
          input.issuanceId,
          expectedFileCount,
          input.issueId,
          expectedRecipientCount,
          input.issueId,
          expectedFileCount,
          input.organizationId,
          input.idempotencyKey,
          JSON.stringify({ status: "ready_to_issue" }),
          JSON.stringify({
            status: "open",
            officialDisplayNumber: input.officialDisplayNumber,
            revisionId: input.revisionId,
            issuanceId: input.issuanceId,
          }),
          JSON.stringify({
            artifactSha256: input.artifact.sha256,
            renderPayloadSha256: input.renderPayloadSha256,
            deliveryMode: "record_only",
          }),
          input.requestId,
          input.issuedAt,
        ),
    );

    await this.database.batch(statements);
  }

  async inspectCommitState(
    input: CommitRfiOfficialIssueInput,
  ): Promise<RfiOfficialCommitState> {
    const row = await this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM rfi_official_issues
            WHERE id = ? AND organization_id = ? AND project_id = ? AND rfi_id = ?
              AND artifact_file_id = ? AND artifact_storage_key = ?
              AND artifact_sha256 = ?) AS issue_count,
           (SELECT COUNT(*) FROM revision_files
            WHERE id = ? AND organization_id = ? AND project_id = ? AND record_id = ?
              AND storage_key = ? AND sha256 = ?) AS revision_file_count,
           (SELECT COUNT(*) FROM issuance_files
            WHERE organization_id = ? AND project_id = ? AND record_id = ?
              AND file_id = ? AND storage_key = ? AND sha256 = ?) AS issuance_file_count,
           (SELECT COUNT(*) FROM rfi_issue_file_snapshots
            WHERE organization_id = ? AND project_id = ? AND rfi_id = ?
              AND file_id = ? AND storage_key = ? AND sha256 = ?) AS snapshot_count,
           (SELECT COUNT(*) FROM idempotency_keys
            WHERE organization_id = ? AND project_id = ? AND operation = 'rfi.issue'
              AND idempotency_key = ? AND resource_id = ?
              AND request_hash = ?) AS idempotency_count,
           (SELECT COUNT(*) FROM idempotency_keys
            WHERE organization_id = ? AND operation = 'rfi.issue'
              AND idempotency_key = ?) AS idempotency_any_count`,
      )
      .bind(
        input.issueId,
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.artifact.fileId,
        input.artifact.storageKey,
        input.artifact.sha256,
        input.artifact.fileId,
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.artifact.storageKey,
        input.artifact.sha256,
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.artifact.fileId,
        input.artifact.storageKey,
        input.artifact.sha256,
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.artifact.fileId,
        input.artifact.storageKey,
        input.artifact.sha256,
        input.organizationId,
        input.projectId,
        input.idempotencyKey,
        input.rfiId,
        input.requestHash,
        input.organizationId,
        input.idempotencyKey,
      )
      .first<{
        issue_count: number;
        revision_file_count: number;
        issuance_file_count: number;
        snapshot_count: number;
        idempotency_count: number;
        idempotency_any_count: number;
      }>();
    if (!row) return { status: "unknown" };
    const counts = [
      row.issue_count,
      row.revision_file_count,
      row.issuance_file_count,
      row.snapshot_count,
      row.idempotency_count,
    ];
    if (
      counts.slice(0, 4).every((count) => count === 0) &&
      row.idempotency_count === 0 &&
      row.idempotency_any_count === 1
    ) {
      return { status: "conflict" };
    }
    if (counts.every((count) => count === 0)) return { status: "absent" };
    if (counts.every((count) => count === 1)) {
      const stored = await this.findIdempotentResult(
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.idempotencyKey,
      );
      if (
        stored &&
        stored.projectId === input.projectId &&
        stored.resourceId === input.rfiId &&
        stored.requestHash === input.requestHash
      ) {
        return { status: "committed", result: stored.result };
      }
    }
    return { status: "unknown" };
  }

  async artifactIsReferenced(input: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    fileId: string;
    storageKey: string;
    sha256: string;
  }): Promise<boolean> {
    const row = await this.database
      .prepare(
        `SELECT (
           EXISTS(SELECT 1 FROM rfi_official_issues
             WHERE organization_id = ? AND project_id = ?
               AND (artifact_file_id = ? OR artifact_storage_key = ?))
           OR EXISTS(SELECT 1 FROM revision_files
             WHERE organization_id = ? AND project_id = ?
               AND (id = ? OR storage_key = ?))
           OR EXISTS(SELECT 1 FROM issuance_files
             WHERE organization_id = ? AND project_id = ?
               AND (file_id = ? OR storage_key = ?))
           OR EXISTS(SELECT 1 FROM rfi_issue_file_snapshots
             WHERE organization_id = ? AND project_id = ?
               AND (file_id = ? OR storage_key = ?))
         ) AS referenced`,
      )
      .bind(
        input.organizationId,
        input.projectId,
        input.fileId,
        input.storageKey,
        input.organizationId,
        input.projectId,
        input.fileId,
        input.storageKey,
        input.organizationId,
        input.projectId,
        input.fileId,
        input.storageKey,
        input.organizationId,
        input.projectId,
        input.fileId,
        input.storageKey,
      )
      .first<{ referenced: number }>();
    return row?.referenced === 1;
  }

  async recordArtifactReconciliation(input: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    storageKey: string;
    sha256: string;
    byteSize: number;
    failureSummary: string;
    kind: "compensation_delete_failed" | "commit_outcome_unknown";
  }): Promise<void> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO rfi_artifact_orphans
          (id, organization_id, project_id, rfi_id, artifact_storage_key,
           artifact_sha256, artifact_byte_size, reconciliation_kind, failure_summary,
           reconciliation_status, detected_at, reconciled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
      )
      .bind(
        crypto.randomUUID(),
        input.organizationId,
        input.projectId,
        input.rfiId,
        input.storageKey,
        input.sha256,
        input.byteSize,
        input.kind,
        input.failureSummary.slice(0, 1000),
        new Date().toISOString(),
      )
      .run();
  }
}
