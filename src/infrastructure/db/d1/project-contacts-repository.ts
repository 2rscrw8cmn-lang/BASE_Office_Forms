import type {
  ProjectAddress,
  ProjectContact,
} from "../../../domain/projects/project";
import type { NewActivityEvent } from "./activity-events-repository";

interface ContactRow {
  id: string;
  organization_id: string;
  project_id: string;
  company_name: string | null;
  contact_name: string;
  contact_type: string;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectContactWriteInput {
  companyName: string | null;
  contactName: string;
  contactType: string;
  email: string | null;
  phone: string | null;
  address: ProjectAddress;
  notes: string | null;
}

const CONTACT_COLUMNS = `id, organization_id, project_id, company_name, contact_name, contact_type,
  email, phone, address_line_1, address_line_2, address_city, address_region,
  address_postal_code, address_country, notes, created_at, updated_at, archived_at`;

function mapContact(row: ContactRow): ProjectContact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactType: row.contact_type,
    email: row.email,
    phone: row.phone,
    address: {
      line1: row.address_line_1,
      line2: row.address_line_2,
      city: row.address_city,
      region: row.address_region,
      postalCode: row.address_postal_code,
      country: row.address_country,
    },
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function state(contact: ProjectContact): Record<string, unknown> {
  return {
    companyName: contact.companyName,
    contactName: contact.contactName,
    contactType: contact.contactType,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    notes: contact.notes,
    archivedAt: contact.archivedAt,
  };
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events (id, organization_id, actor_user_id, actor_type, object_type, object_id,
      action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.organizationId,
      event.actorUserId,
      event.actorType,
      event.objectType,
      event.objectId,
      event.action,
      event.priorState ? JSON.stringify(event.priorState) : null,
      event.newState ? JSON.stringify(event.newState) : null,
      JSON.stringify(event.metadata ?? {}),
      event.correlationId,
      new Date().toISOString(),
    );
}

export class D1ProjectContactsRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectContact[]> {
    const result = await this.database
      .prepare(
        `SELECT ${CONTACT_COLUMNS} FROM project_contacts
       WHERE organization_id = ? AND project_id = ? AND archived_at IS NULL
       ORDER BY contact_name COLLATE NOCASE ASC, id ASC`,
      )
      .bind(organizationId, projectId)
      .all<ContactRow>();
    return result.results.map(mapContact);
  }

  async findById(
    organizationId: string,
    projectId: string,
    contactId: string,
  ): Promise<ProjectContact | null> {
    const row = await this.database
      .prepare(
        `SELECT ${CONTACT_COLUMNS} FROM project_contacts
       WHERE organization_id = ? AND project_id = ? AND id = ? AND archived_at IS NULL`,
      )
      .bind(organizationId, projectId, contactId)
      .first<ContactRow>();
    return row ? mapContact(row) : null;
  }

  async createWithActivity(
    organizationId: string,
    projectId: string,
    input: ProjectContactWriteInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<ProjectContact> {
    const now = new Date().toISOString();
    const contact: ProjectContact = {
      id: crypto.randomUUID(),
      organizationId,
      projectId,
      ...input,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO project_contacts (${CONTACT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          contact.id,
          organizationId,
          projectId,
          contact.companyName,
          contact.contactName,
          contact.contactType,
          contact.email,
          contact.phone,
          contact.address.line1,
          contact.address.line2,
          contact.address.city,
          contact.address.region,
          contact.address.postalCode,
          contact.address.country,
          contact.notes,
          contact.createdAt,
          contact.updatedAt,
          null,
        ),
      eventStatement(this.database, {
        ...event,
        organizationId,
        objectId: contact.id,
        newState: state(contact),
      }),
    ]);
    return contact;
  }

  async updateWithActivity(
    contact: ProjectContact,
    input: ProjectContactWriteInput,
    event: Omit<
      NewActivityEvent,
      "organizationId" | "objectId" | "priorState" | "newState"
    >,
  ): Promise<ProjectContact> {
    const updated: ProjectContact = {
      ...contact,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE project_contacts SET company_name = ?, contact_name = ?, contact_type = ?,
        email = ?, phone = ?, address_line_1 = ?, address_line_2 = ?, address_city = ?, address_region = ?,
        address_postal_code = ?, address_country = ?, notes = ?, updated_at = ?
        WHERE id = ? AND project_id = ? AND organization_id = ?`,
        )
        .bind(
          updated.companyName,
          updated.contactName,
          updated.contactType,
          updated.email,
          updated.phone,
          updated.address.line1,
          updated.address.line2,
          updated.address.city,
          updated.address.region,
          updated.address.postalCode,
          updated.address.country,
          updated.notes,
          updated.updatedAt,
          updated.id,
          updated.projectId,
          updated.organizationId,
        ),
      eventStatement(this.database, {
        ...event,
        organizationId: updated.organizationId,
        objectId: updated.id,
        priorState: state(contact),
        newState: state(updated),
      }),
    ]);
    return updated;
  }
}
