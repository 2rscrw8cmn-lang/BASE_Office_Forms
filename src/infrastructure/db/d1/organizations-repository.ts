export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: Organization["status"];
  settings_json: string;
  created_at: string;
  updated_at: string;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    settingsJson: row.settings_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1OrganizationsRepository {
  constructor(private readonly database: D1Database) {}

  async findById(organizationId: string): Promise<Organization | null> {
    const row = await this.database
      .prepare(
        `SELECT id, name, slug, status, settings_json, created_at, updated_at
         FROM organizations
         WHERE id = ?`,
      )
      .bind(organizationId)
      .first<OrganizationRow>();

    return row ? mapOrganization(row) : null;
  }
}
