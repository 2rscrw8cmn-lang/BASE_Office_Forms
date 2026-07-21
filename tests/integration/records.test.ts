import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { RecordService } from "../../src/application/records/record-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RecordsRepository } from "../../src/infrastructure/db/d1/records-repository";
import { D1ProjectRecordsReadRepository } from "../../src/infrastructure/db/d1/project-records-read-repository";
import { ProjectRecordsReadModelService } from "../../src/application/read-models/project-records-service";
import type { V2RouteDependencies } from "../../src/http/v2/dependencies";
import { invokeV2Api } from "../helpers/api";
import { resetIdentityFoundation, testDatabase } from "../helpers/d1";

const sessions: Partial<Record<string, AppSession>> = {
  admin: {
    userId: "user-admin",
    organizationId: "org-a",
    membershipRole: "org_admin",
    projectPermissions: [],
  },
  documentControl: {
    userId: "user-doc",
    organizationId: "org-a",
    membershipRole: "document_control_admin",
    projectPermissions: [],
  },
  manager: {
    userId: "user-manager",
    organizationId: "org-a",
    membershipRole: "project_manager",
    projectPermissions: [],
  },
  contributor: {
    userId: "user-contributor",
    organizationId: "org-a",
    membershipRole: "contributor",
    projectPermissions: [],
  },
  viewer: {
    userId: "user-viewer",
    organizationId: "org-a",
    membershipRole: "viewer",
    projectPermissions: [],
  },
};

class FixtureAuthenticationAdapter implements AuthenticationAdapter {
  authenticate(request: Request): Promise<AuthenticationResult> {
    const session = sessions[request.headers.get("x-test-session") ?? ""];
    return Promise.resolve(
      session
        ? { authenticated: true, session }
        : { authenticated: false, reason: "MISSING_CREDENTIALS" },
    );
  }
}

function dependencies(): V2RouteDependencies {
  const database = testDatabase();
  const projects = new ProjectService(
    new D1ProjectsRepository(database),
    new D1ProjectMembershipsRepository(database),
  );
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    records: new RecordService(projects, new D1RecordsRepository(database)),
    projectRecords: new ProjectRecordsReadModelService(
      projects,
      new D1ProjectRecordsReadRepository(database),
    ),
  };
}

function request(session: string, method = "GET", body?: unknown): RequestInit {
  return {
    method,
    headers: {
      "x-test-session": session,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function jsonData<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected an API response object.");
  }
  if (!("data" in body))
    throw new Error("Expected an API response data field.");
  return body.data as T;
}

async function seed(): Promise<void> {
  const database = testDatabase();
  const now = new Date().toISOString();
  const seededSessions = Object.entries(sessions).filter(
    (entry): entry is [string, AppSession] => entry[1] !== undefined,
  );
  await database.batch([
    database
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-a', 'Organization A', 'organization-a', 'active', '{}', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-b', 'Organization B', 'organization-b', 'active', '{}', ?, ?)",
      )
      .bind(now, now),
    ...seededSessions.flatMap(([name, session]) => [
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
        )
        .bind(
          session.userId,
          `identity|${name}`,
          `${name}@example.test`,
          name,
          now,
          now,
        ),
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, ?, 'active', ?)",
        )
        .bind(
          `membership-${session.userId}`,
          session.userId,
          session.membershipRole,
          now,
        ),
    ]),
    database
      .prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-org-b', 'identity|org-b', 'org-b@example.test', 'Organization B User', 'active', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-user-org-b', 'org-b', 'user-org-b', 'contributor', 'active', ?)",
      )
      .bind(now),
  ]);
}

interface ApiProject {
  id: string;
}
interface ApiRecord {
  id: string;
  recordNumber: string | null;
  status: string;
  title: string;
  recordType: string;
}

async function createProject(number: string): Promise<ApiProject> {
  const response = await invokeV2Api(
    "/api/v2/projects",
    request("admin", "POST", {
      projectNumber: number,
      name: `Project ${number}`,
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  return jsonData<ApiProject>(response);
}

async function createRecord(
  projectId: string,
  number: string | null = "A-101",
): Promise<ApiRecord> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records`,
    request("admin", "POST", {
      recordType: "drawing",
      recordNumber: number,
      title: "  Floor Plan  ",
      description: " Level one ",
      discipline: " Architecture ",
      source: " Consultant ",
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  return jsonData<ApiRecord>(response);
}

describe("records foundation API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("creates, lists, retrieves, updates, and archives records with schema version 9", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(9);
    const project = await createProject("P-REC-1");
    const record = await createRecord(project.id);
    expect(record).toMatchObject({
      recordType: "drawing",
      recordNumber: "A-101",
      title: "Floor Plan",
      status: "active",
    });
    const list = await invokeV2Api(
      `/api/v2/projects/${project.id}/records`,
      request("admin"),
      dependencies(),
    );
    await expect(list.json()).resolves.toMatchObject({
      data: {
        records: [{ id: record.id, currentRevision: null, fileCount: 0 }],
        capabilities: { createRecord: true },
      },
    });
    const detail = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}`,
      request("admin"),
      dependencies(),
    );
    await expect(detail.json()).resolves.toMatchObject({
      data: { description: "Level one", discipline: "Architecture" },
    });
    const update = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}`,
      request("documentControl", "PATCH", {
        title: " Revised Floor Plan ",
        recordNumber: " A-102 ",
      }),
      dependencies(),
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      data: { title: "Revised Floor Plan", recordNumber: "A-102" },
    });
    const archive = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/archive`,
      request("manager", "POST"),
      dependencies(),
    );
    expect(archive.status).toBe(404);
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('manager-record', 'org-a', ?, 'user-manager', 'project_manager', 'active', ?)",
      )
      .bind(project.id, now)
      .run();
    const archived = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/archive`,
      request("manager", "POST"),
      dependencies(),
    );
    expect(archived.status).toBe(200);
    const archivedBody = await jsonData<{
      status: string;
      archivedAt: string | null;
    }>(archived);
    expect(archivedBody.status).toBe("archived");
    expect(typeof archivedBody.archivedAt).toBe("string");
    const activeList = await invokeV2Api(
      `/api/v2/projects/${project.id}/records`,
      request("admin"),
      dependencies(),
    );
    await expect(activeList.json()).resolves.toMatchObject({
      data: { records: [] },
    });
    const allList = await invokeV2Api(
      `/api/v2/projects/${project.id}/records?includeArchived=true`,
      request("admin"),
      dependencies(),
    );
    await expect(allList.json()).resolves.toMatchObject({
      data: { records: [{ id: record.id, status: "archived" }] },
    });
  });

  it("validates input and enforces project-scoped record numbers", async () => {
    const first = await createProject("P-REC-2A");
    const second = await createProject("P-REC-2B");
    await createRecord(first.id, null);
    const invalidType = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", { recordType: "rfi", title: "Invalid" }),
      dependencies(),
    );
    expect(invalidType.status).toBe(400);
    const missingTitle = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", { recordType: "document", title: " " }),
      dependencies(),
    );
    expect(missingTitle.status).toBe(400);
    const emptyNumber = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", {
        recordType: "document",
        recordNumber: " ",
        title: "Empty number",
      }),
      dependencies(),
    );
    expect(emptyNumber.status).toBe(400);
    await createRecord(first.id, "C-001");
    const duplicate = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", {
        recordType: "document",
        recordNumber: " C-001 ",
        title: "Duplicate",
      }),
      dependencies(),
    );
    expect(duplicate.status).toBe(409);
    await createRecord(second.id, "C-001");
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-record-org-b', 'org-b', 'P-REC-B', 'Other', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, status, created_by, created_at, updated_at) VALUES ('record-org-b', 'org-b', 'project-record-org-b', 'document', 'C-001', 'Other', 'active', 'user-org-b', ?, ?)",
        )
        .bind(now, now),
    ]);
    const protectedFields = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", {
        recordType: "document",
        title: "Protected",
        status: "archived",
      }),
      dependencies(),
    );
    expect(protectedFields.status).toBe(400);
  });

  it("requires a record creator to be a member of the record organization", async () => {
    const database = testDatabase();
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-record-integrity', 'org-b', 'P-REC-INTEGRITY', 'Integrity', 'planning', 'America/New_York', ?, ?)",
      )
      .bind(now, now)
      .run();

    await expect(
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-valid-creator', 'org-b', 'project-record-integrity', 'document', 'Valid creator', 'active', 'user-org-b', ?, ?)",
        )
        .bind(now, now)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-missing-creator', 'org-b', 'project-record-integrity', 'document', 'Missing creator', 'active', 'missing-user', ?, ?)",
        )
        .bind(now, now)
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-cross-tenant-creator', 'org-b', 'project-record-integrity', 'document', 'Cross-tenant creator', 'active', 'user-admin', ?, ?)",
        )
        .bind(now, now)
        .run(),
    ).rejects.toThrow();
  });

  it("keeps tenants and project URLs isolated and makes contributors and viewers read-only", async () => {
    const project = await createProject("P-REC-3");
    const record = await createRecord(project.id);
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-b', 'org-b', 'P-B', 'Other', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-b', 'org-b', 'project-b', 'document', 'Other', 'active', 'user-org-b', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('contributor-record', 'org-a', ?, 'user-contributor', 'contributor', 'active', ?)",
        )
        .bind(project.id, now),
      testDatabase()
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('viewer-record', 'org-a', ?, 'user-viewer', 'viewer', 'active', ?)",
        )
        .bind(project.id, now),
    ]);
    expect(
      (
        await invokeV2Api(
          "/api/v2/projects/project-b/records/record-b",
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/not-${project.id}/records/${record.id}`,
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records`,
          request("contributor"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}`,
          request("viewer"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records`,
          request("contributor", "POST", {
            recordType: "document",
            title: "Denied",
          }),
          dependencies(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/archive`,
          request("viewer", "POST"),
          dependencies(),
        )
      ).status,
    ).toBe(403);
  });

  it("rejects edits and repeated archives after archive", async () => {
    const project = await createProject("P-REC-4");
    const record = await createRecord(project.id);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/archive`,
          request("admin", "POST"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}`,
          request("admin", "PATCH", { title: "Denied" }),
          dependencies(),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/archive`,
          request("admin", "POST"),
          dependencies(),
        )
      ).status,
    ).toBe(409);
  });

  it("writes accurate activity events atomically and rolls back when event writes fail", async () => {
    const project = await createProject("P-REC-5");
    const record = await createRecord(project.id);
    const update = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}`,
      request("admin", "PATCH", { title: "Updated" }),
      dependencies(),
    );
    expect(update.status).toBe(200);
    const archive = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/archive`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(archive.status).toBe(200);
    const events = await testDatabase()
      .prepare(
        "SELECT action, prior_state_json, new_state_json FROM activity_events WHERE object_id = ? ORDER BY created_at ASC",
      )
      .bind(record.id)
      .all<{
        action: string;
        prior_state_json: string | null;
        new_state_json: string;
      }>();
    expect(events.results.map((event) => event.action)).toEqual([
      "record.created",
      "record.updated",
      "record.archived",
    ]);
    expect(
      JSON.parse(events.results[1].prior_state_json ?? "{}"),
    ).toMatchObject({ title: "Floor Plan", status: "active" });
    expect(JSON.parse(events.results[2].new_state_json)).toMatchObject({
      title: "Updated",
      status: "archived",
    });

    await testDatabase()
      .prepare(
        "CREATE TRIGGER fail_record_created_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'record.created' BEGIN SELECT RAISE(ABORT, 'forced record audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records`,
          request("admin", "POST", {
            recordType: "document",
            title: "Rollback",
          }),
          dependencies(),
        ),
      ).rejects.toThrow(/forced record audit failure/);
      const count = await testDatabase()
        .prepare(
          "SELECT COUNT(*) AS count FROM records WHERE title = 'Rollback'",
        )
        .first<{ count: number }>();
      expect(count?.count).toBe(0);
    } finally {
      await testDatabase()
        .prepare("DROP TRIGGER IF EXISTS fail_record_created_activity")
        .run();
    }

    const rollbackRecord = await createRecord(project.id, "ROLLBACK-1");
    await testDatabase()
      .prepare(
        "CREATE TRIGGER fail_record_updated_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'record.updated' BEGIN SELECT RAISE(ABORT, 'forced record update audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records/${rollbackRecord.id}`,
          request("admin", "PATCH", { title: "Must roll back" }),
          dependencies(),
        ),
      ).rejects.toThrow(/forced record update audit failure/);
      const stored = await testDatabase()
        .prepare("SELECT title FROM records WHERE id = ?")
        .bind(rollbackRecord.id)
        .first<{ title: string }>();
      expect(stored?.title).toBe("Floor Plan");
    } finally {
      await testDatabase()
        .prepare("DROP TRIGGER IF EXISTS fail_record_updated_activity")
        .run();
    }

    await testDatabase()
      .prepare(
        "CREATE TRIGGER fail_record_archived_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'record.archived' BEGIN SELECT RAISE(ABORT, 'forced record archive audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records/${rollbackRecord.id}/archive`,
          request("admin", "POST"),
          dependencies(),
        ),
      ).rejects.toThrow(/forced record archive audit failure/);
      const stored = await testDatabase()
        .prepare("SELECT status, archived_at FROM records WHERE id = ?")
        .bind(rollbackRecord.id)
        .first<{ status: string; archived_at: string | null }>();
      expect(stored).toEqual({ status: "active", archived_at: null });
    } finally {
      await testDatabase()
        .prepare("DROP TRIGGER IF EXISTS fail_record_archived_activity")
        .run();
    }
  });
});
