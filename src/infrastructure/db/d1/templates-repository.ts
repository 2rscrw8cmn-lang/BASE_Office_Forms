import type {
  Template,
  TemplateKind,
  TemplateVersion,
  TemplateVersionStatus,
  TemplateWithPublishedVersion,
} from "../../../domain/templates/template";

interface TemplateRow {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  kind: TemplateKind;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TemplateVersionRow {
  id: string;
  organization_id: string;
  template_id: string;
  version_number: number;
  definition_json: string;
  status: TemplateVersionStatus;
  created_by: string;
  created_at: string;
  published_at: string;
  published_by: string;
}

const TEMPLATE_COLUMNS = `id, organization_id, key, name, kind, created_by, created_at, updated_at`;
const VERSION_COLUMNS = `id, organization_id, template_id, version_number, definition_json,
  status, created_by, created_at, published_at, published_by`;

function mapTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    organizationId: row.organization_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: TemplateVersionRow): TemplateVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    definition: JSON.parse(row.definition_json) as Record<string, unknown>,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

export interface TemplatePublishActor {
  actorUserId: string;
  correlationId: string;
}

export class D1TemplatesRepository {
  constructor(private readonly database: D1Database) {}

  async list(organizationId: string): Promise<TemplateWithPublishedVersion[]> {
    const rows = await this.database
      .prepare(
        `SELECT ${TEMPLATE_COLUMNS} FROM templates
         WHERE organization_id = ? ORDER BY key ASC`,
      )
      .bind(organizationId)
      .all<TemplateRow>();
    const templates = rows.results.map(mapTemplate);
    const withVersions = await Promise.all(
      templates.map(async (template) => {
        const publishedVersion = await this.findPublishedVersion(
          organizationId,
          template.id,
        );
        return publishedVersion ? { ...template, publishedVersion } : null;
      }),
    );
    return withVersions.filter(
      (item): item is TemplateWithPublishedVersion => item !== null,
    );
  }

  async findByKey(
    organizationId: string,
    key: string,
  ): Promise<TemplateWithPublishedVersion | null> {
    const template = await this.findTemplateRow(organizationId, key);
    if (!template) return null;
    const publishedVersion = await this.findPublishedVersion(
      organizationId,
      template.id,
    );
    if (!publishedVersion) return null;
    return { ...template, publishedVersion };
  }

  async findVersionById(
    organizationId: string,
    versionId: string,
  ): Promise<TemplateVersion | null> {
    const row = await this.database
      .prepare(
        `SELECT ${VERSION_COLUMNS} FROM template_versions
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(organizationId, versionId)
      .first<TemplateVersionRow>();
    return row ? mapVersion(row) : null;
  }

  private async findTemplateRow(
    organizationId: string,
    key: string,
  ): Promise<Template | null> {
    const row = await this.database
      .prepare(
        `SELECT ${TEMPLATE_COLUMNS} FROM templates
         WHERE organization_id = ? AND key = ?`,
      )
      .bind(organizationId, key)
      .first<TemplateRow>();
    return row ? mapTemplate(row) : null;
  }

  private async findPublishedVersion(
    organizationId: string,
    templateId: string,
  ): Promise<TemplateVersion | null> {
    const row = await this.database
      .prepare(
        `SELECT ${VERSION_COLUMNS} FROM template_versions
         WHERE organization_id = ? AND template_id = ? AND status = 'published'`,
      )
      .bind(organizationId, templateId)
      .first<TemplateVersionRow>();
    return row ? mapVersion(row) : null;
  }

  // Creates the template on first publish (find-or-create by key), retires
  // whatever was previously published, and inserts the new version as the
  // one and only published row -- all in a single atomic batch. Versions are
  // append-only: nothing already published is ever mutated or deleted.
  async publishWithActivity(
    organizationId: string,
    metadata: { key: string; name: string; kind: TemplateKind },
    definition: Record<string, unknown>,
    actor: TemplatePublishActor,
  ): Promise<TemplateWithPublishedVersion> {
    const now = new Date().toISOString();
    const existing = await this.findByKey(organizationId, metadata.key);
    const templateId = existing?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];

    if (!existing) {
      statements.push(
        this.database
          .prepare(
            `INSERT INTO templates
              (id, organization_id, key, name, kind, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            templateId,
            organizationId,
            metadata.key,
            metadata.name,
            metadata.kind,
            actor.actorUserId,
            now,
            now,
          ),
        this.database
          .prepare(
            `INSERT INTO template_version_sequences (template_id, organization_id, last_number)
             VALUES (?, ?, 0)`,
          )
          .bind(templateId, organizationId),
      );
    } else {
      statements.push(
        this.database
          .prepare(
            `UPDATE templates SET name = ?, kind = ?, updated_at = ?
             WHERE id = ? AND organization_id = ?`,
          )
          .bind(metadata.name, metadata.kind, now, templateId, organizationId),
      );
    }

    statements.push(
      this.database
        .prepare(
          `UPDATE template_version_sequences SET last_number = last_number + 1
           WHERE template_id = ? AND organization_id = ?`,
        )
        .bind(templateId, organizationId),
    );

    if (existing) {
      statements.push(
        this.database
          .prepare(
            `UPDATE template_versions SET status = 'retired'
             WHERE id = ? AND organization_id = ? AND status = 'published'`,
          )
          .bind(existing.publishedVersion.id, organizationId),
        this.activityStatement(organizationId, {
          actorUserId: actor.actorUserId,
          objectId: existing.publishedVersion.id,
          action: "template.version.retired",
          metadata: { versionNumber: existing.publishedVersion.versionNumber },
          correlationId: actor.correlationId,
        }),
      );
    }

    const versionId = crypto.randomUUID();
    statements.push(
      this.database
        .prepare(
          `INSERT INTO template_versions
            (id, organization_id, template_id, version_number, definition_json,
             status, created_by, created_at, published_at, published_by)
           SELECT ?, ?, ?, last_number, ?, 'published', ?, ?, ?, ?
           FROM template_version_sequences
           WHERE template_id = ? AND organization_id = ?`,
        )
        .bind(
          versionId,
          organizationId,
          templateId,
          JSON.stringify(definition),
          actor.actorUserId,
          now,
          now,
          actor.actorUserId,
          templateId,
          organizationId,
        ),
      this.activityStatement(organizationId, {
        actorUserId: actor.actorUserId,
        objectId: versionId,
        action: "template.version.published",
        metadata: { key: metadata.key },
        correlationId: actor.correlationId,
      }),
    );

    await this.database.batch(statements);

    const published = await this.findByKey(organizationId, metadata.key);
    if (!published) throw new Error("Published template could not be loaded.");
    return published;
  }

  private activityStatement(
    organizationId: string,
    event: {
      actorUserId: string;
      objectId: string;
      action: string;
      metadata: Record<string, unknown>;
      correlationId: string;
    },
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT INTO activity_events
          (id, organization_id, actor_user_id, actor_type, object_type, object_id,
           action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
         VALUES (?, ?, ?, 'user', 'template', ?, ?, NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        event.actorUserId,
        event.objectId,
        event.action,
        JSON.stringify(event.metadata),
        event.correlationId,
        new Date().toISOString(),
      );
  }
}
