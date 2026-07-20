import type {
  Project,
  ProjectAddress,
  ProjectStatus,
} from "../../../domain/projects/project";
import type { NewActivityEvent } from "./activity-events-repository";

interface ProjectRow {
  id: string;
  organization_id: string;
  project_number: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  timezone: string;
  start_date: string | null;
  target_completion_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectWriteInput {
  projectNumber: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  address: ProjectAddress;
  timezone: string;
  startDate: string | null;
  targetCompletionDate: string | null;
}

const PROJECT_COLUMNS = `id, organization_id, project_number, name, status, description,
  address_line_1, address_line_2, address_city, address_region, address_postal_code,
  address_country, timezone, start_date, target_completion_date, created_at, updated_at,
  archived_at`;

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectNumber: row.project_number,
    name: row.name,
    status: row.status,
    description: row.description,
    address: {
      line1: row.address_line_1,
      line2: row.address_line_2,
      city: row.address_city,
      region: row.address_region,
      postalCode: row.address_postal_code,
      country: row.address_country,
    },
    timezone: row.timezone,
    startDate: row.start_date,
    targetCompletionDate: row.target_completion_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function state(project: Project): Record<string, unknown> {
  return {
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    description: project.description,
    address: project.address,
    timezone: project.timezone,
    startDate: project.startDate,
    targetCompletionDate: project.targetCompletionDate,
    archivedAt: project.archivedAt,
  };
}

function eventStatement(
  database: D1Database,
  event: NewActivityEvent,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO activity_events
        (id, organization_id, actor_user_id, actor_type, object_type, object_id,
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

export class D1ProjectsRepository {
  constructor(private readonly database: D1Database) {}

  async list(
    organizationId: string,
    projectIds?: readonly string[],
  ): Promise<Project[]> {
    if (projectIds?.length === 0) return [];
    const membershipClause = projectIds
      ? ` AND id IN (${projectIds.map(() => "?").join(", ")})`
      : "";
    const result = await this.database
      .prepare(
        `SELECT ${PROJECT_COLUMNS} FROM projects
         WHERE organization_id = ? AND archived_at IS NULL${membershipClause}
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .bind(organizationId, ...(projectIds ?? []))
      .all<ProjectRow>();
    return result.results.map(mapProject);
  }

  async findById(
    organizationId: string,
    projectId: string,
  ): Promise<Project | null> {
    const row = await this.database
      .prepare(
        `SELECT ${PROJECT_COLUMNS} FROM projects
         WHERE organization_id = ? AND id = ? AND archived_at IS NULL`,
      )
      .bind(organizationId, projectId)
      .first<ProjectRow>();
    return row ? mapProject(row) : null;
  }

  async createWithActivity(
    organizationId: string,
    input: ProjectWriteInput,
    event: Omit<NewActivityEvent, "organizationId" | "objectId" | "newState">,
  ): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      createdAt: now,
      updatedAt: now,
      archivedAt: input.status === "archived" ? now : null,
    };
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO projects (${PROJECT_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          project.id,
          project.organizationId,
          project.projectNumber,
          project.name,
          project.status,
          project.description,
          project.address.line1,
          project.address.line2,
          project.address.city,
          project.address.region,
          project.address.postalCode,
          project.address.country,
          project.timezone,
          project.startDate,
          project.targetCompletionDate,
          project.createdAt,
          project.updatedAt,
          project.archivedAt,
        ),
      eventStatement(this.database, {
        ...event,
        organizationId,
        objectId: project.id,
        newState: state(project),
      }),
    ]);
    return project;
  }

  async updateWithActivity(
    project: Project,
    input: ProjectWriteInput,
    event: Omit<
      NewActivityEvent,
      "organizationId" | "objectId" | "priorState" | "newState"
    >,
  ): Promise<Project> {
    const updated: Project = {
      ...project,
      ...input,
      updatedAt: new Date().toISOString(),
      archivedAt:
        input.status === "archived"
          ? (project.archivedAt ?? new Date().toISOString())
          : null,
    };
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE projects SET project_number = ?, name = ?, status = ?, description = ?,
         address_line_1 = ?, address_line_2 = ?, address_city = ?, address_region = ?,
         address_postal_code = ?, address_country = ?, timezone = ?, start_date = ?,
         target_completion_date = ?, updated_at = ?, archived_at = ?
         WHERE id = ? AND organization_id = ?`,
        )
        .bind(
          updated.projectNumber,
          updated.name,
          updated.status,
          updated.description,
          updated.address.line1,
          updated.address.line2,
          updated.address.city,
          updated.address.region,
          updated.address.postalCode,
          updated.address.country,
          updated.timezone,
          updated.startDate,
          updated.targetCompletionDate,
          updated.updatedAt,
          updated.archivedAt,
          updated.id,
          updated.organizationId,
        ),
      eventStatement(this.database, {
        ...event,
        organizationId: updated.organizationId,
        objectId: updated.id,
        priorState: state(project),
        newState: state(updated),
      }),
    ]);
    return updated;
  }
}
