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
import { D1ProjectRecordSequencesRepository } from "../../src/infrastructure/db/d1/project-record-sequences-repository";
import { ProjectRecordsReadModelService } from "../../src/application/read-models/project-records-service";
import { RecordWorkspaceReadModelService } from "../../src/application/read-models/record-workspace-service";
import { RevisionWorkspaceReadModelService } from "../../src/application/read-models/revision-workspace-service";
import { D1RecordWorkspaceReadRepository } from "../../src/infrastructure/db/d1/record-workspace-read-repository";
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
  orgBAdmin: {
    userId: "user-org-b",
    organizationId: "org-b",
    membershipRole: "org_admin",
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
  const recordWorkspace = new RecordWorkspaceReadModelService(
    projects,
    new D1RecordWorkspaceReadRepository(database),
  );
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    records: new RecordService(
      projects,
      new D1RecordsRepository(
        database,
        new D1ProjectRecordSequencesRepository(database),
      ),
    ),
    projectRecords: new ProjectRecordsReadModelService(
      projects,
      new D1ProjectRecordsReadRepository(database),
    ),
    recordWorkspace,
    revisionWorkspace: new RevisionWorkspaceReadModelService(recordWorkspace),
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
    (entry): entry is [string, AppSession] =>
      entry[1] !== undefined && entry[1].organizationId === "org-a",
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
        "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-user-org-b', 'org-b', 'user-org-b', 'org_admin', 'active', ?)",
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

async function createProject(
  number: string,
  session = "admin",
): Promise<ApiProject> {
  const response = await invokeV2Api(
    "/api/v2/projects",
    request(session, "POST", {
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
  session = "admin",
  title = "Floor Plan",
): Promise<ApiRecord> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records`,
    request(session, "POST", {
      recordType: "drawing",
      title: `  ${title}  `,
      description: " Level one ",
      discipline: "architectural",
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

  it("returns a scoped record workspace with authoritative revision and file summaries", async () => {
    const project = await createProject("P-WORKSPACE");
    const record = await createRecord(project.id);
    const database = testDatabase();
    const now = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          `INSERT INTO record_revisions
        (id, organization_id, project_id, record_id, revision_number, revision_label, title, change_summary, status, created_by, created_at)
        VALUES ('rev-current', 'org-a', ?, ?, 1, 'A', 'Published plan', 'Initial issue', 'published', 'user-admin', ?)`,
        )
        .bind(project.id, record.id, now),
      database
        .prepare(
          `INSERT INTO record_revisions
        (id, organization_id, project_id, record_id, revision_number, revision_label, title, change_summary, status, created_by, created_at)
        VALUES ('rev-draft', 'org-a', ?, ?, 2, 'B', 'Draft plan', 'Coordination', 'draft', 'user-admin', ?)`,
        )
        .bind(project.id, record.id, now),
    ]);
    await database
      .prepare(
        "UPDATE records SET current_revision_id = 'rev-current' WHERE id = ?",
      )
      .bind(record.id)
      .run();
    await database.batch([
      database
        .prepare(
          `INSERT INTO revision_files
        (id, organization_id, project_id, record_id, revision_id, storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
        VALUES ('file-current', 'org-a', ?, ?, 'rev-current', 'private/current.pdf', 'current.pdf', 'application/pdf', 10, ?, 'user-admin', ?)`,
        )
        .bind(project.id, record.id, "a".repeat(64), now),
      database
        .prepare(
          `INSERT INTO revision_files
        (id, organization_id, project_id, record_id, revision_id, storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
        VALUES ('file-draft', 'org-a', ?, ?, 'rev-draft', 'private/draft.pdf', 'draft.pdf', 'application/pdf', 10, ?, 'user-admin', ?)`,
        )
        .bind(project.id, record.id, "b".repeat(64), now),
    ]);

    const response = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/workspace`,
      request("admin"),
      dependencies(),
    );
    expect(response.status).toBe(200);
    const model = await jsonData<Record<string, unknown>>(response);
    expect(model).toMatchObject({
      record: { id: record.id, projectId: project.id, title: "Floor Plan" },
      currentRevision: { id: "rev-current", revisionNumber: 1, fileCount: 1 },
      revisions: [
        {
          id: "rev-draft",
          revisionNumber: 2,
          status: "draft",
          fileCount: 1,
          isCurrent: false,
          files: [{ id: "file-draft", originalFilename: "draft.pdf" }],
          capabilities: { uploadFile: true, publishRevision: true },
        },
        {
          id: "rev-current",
          revisionNumber: 1,
          status: "published",
          fileCount: 1,
          isCurrent: true,
          files: [{ id: "file-current", originalFilename: "current.pdf" }],
          capabilities: { uploadFile: false, publishRevision: false },
        },
      ],
      totalFileCount: 2,
      capabilities: {
        updateRecord: true,
        archiveRecord: true,
        createRevision: true,
      },
    });
    expect(JSON.stringify(model)).not.toContain("organizationId");
    expect(JSON.stringify(model)).not.toContain("storage_key");
    expect(JSON.stringify(model)).not.toContain("private/current.pdf");

    const revisionWorkspace = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions/rev-draft/workspace`,
      request("admin"),
      dependencies(),
    );
    expect(revisionWorkspace.status).toBe(200);
    await expect(revisionWorkspace.json()).resolves.toMatchObject({
      data: {
        record: { id: record.id },
        revision: {
          id: "rev-draft",
          files: [{ id: "file-draft", originalFilename: "draft.pdf" }],
          capabilities: { uploadFile: true, publishRevision: true },
        },
        currentRevisionId: "rev-current",
      },
    });

    const wrongProject = await invokeV2Api(
      `/api/v2/projects/not-${project.id}/records/${record.id}/workspace`,
      request("admin"),
      dependencies(),
    );
    expect(wrongProject.status).toBe(404);
    const inaccessible = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/workspace`,
      request("manager"),
      dependencies(),
    );
    expect(inaccessible.status).toBe(404);

    await database
      .prepare("UPDATE records SET current_revision_id = NULL WHERE id = ?")
      .bind(record.id)
      .run();
    const withoutCurrent = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/workspace`,
      request("viewer"),
      dependencies(),
    );
    expect(withoutCurrent.status).toBe(404);
    await database
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('viewer-workspace', 'org-a', ?, 'user-viewer', 'viewer', 'active', ?)",
      )
      .bind(project.id, now)
      .run();
    const readable = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/workspace`,
      request("viewer"),
      dependencies(),
    );
    await expect(
      jsonData<Record<string, unknown>>(readable),
    ).resolves.toMatchObject({
      currentRevision: null,
      capabilities: {
        updateRecord: false,
        archiveRecord: false,
        createRevision: false,
      },
    });
    await database
      .prepare(
        "UPDATE records SET status = 'archived', archived_at = ? WHERE id = ?",
      )
      .bind(now, record.id)
      .run();
    const archived = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/workspace`,
      request("admin"),
      dependencies(),
    );
    await expect(
      jsonData<Record<string, unknown>>(archived),
    ).resolves.toMatchObject({
      record: { status: "archived", archivedAt: now },
      capabilities: {
        updateRecord: false,
        archiveRecord: false,
        createRevision: false,
      },
    });
  });

  it("creates, lists, retrieves, updates, and archives records with schema version 10", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(12);
    const project = await createProject("P-REC-1");
    const record = await createRecord(project.id);
    expect(record).toMatchObject({
      recordType: "drawing",
      recordNumber: "0001",
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
      data: { description: "Level one", discipline: "architectural" },
    });
    const update = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}`,
      request("documentControl", "PATCH", {
        title: " Revised Floor Plan ",
        discipline: "structural",
      }),
      dependencies(),
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      data: {
        title: "Revised Floor Plan",
        recordNumber: "0001",
        discipline: "structural",
      },
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

  it("allocates isolated project sequences atomically and never reuses archived numbers", async () => {
    const first = await createProject("P-REC-2A");
    const second = await createProject("P-REC-2B");
    const otherOrganization = await createProject("P-REC-2C", "orgBAdmin");
    const concurrent = await Promise.all([
      createRecord(first.id, "admin", "First"),
      createRecord(first.id, "admin", "Second"),
      createRecord(first.id, "admin", "Third"),
    ]);
    expect(concurrent.map((record) => record.recordNumber).sort()).toEqual([
      "0001",
      "0002",
      "0003",
    ]);
    expect((await createRecord(second.id)).recordNumber).toBe("0001");
    expect(
      (await createRecord(otherOrganization.id, "orgBAdmin")).recordNumber,
    ).toBe("0001");
    const archive = await invokeV2Api(
      `/api/v2/projects/${first.id}/records/${concurrent[1].id}/archive`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(archive.status).toBe(200);
    expect((await createRecord(first.id, "admin", "Fourth")).recordNumber).toBe(
      "0004",
    );
  });

  it("bootstraps after numeric legacy records and preserves nonnumeric legacy values", async () => {
    const project = await createProject("P-REC-LEGACY");
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, status, discipline, created_by, created_at, updated_at) VALUES ('legacy-numeric', 'org-a', ?, 'document', '0041', 'Numeric legacy', 'active', 'ARCH', 'user-admin', ?, ?)",
        )
        .bind(project.id, now, now),
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, status, discipline, created_by, created_at, updated_at) VALUES ('legacy-alpha', 'org-a', ?, 'document', 'A-900', 'Alpha legacy', 'active', 'ARCH', 'user-admin', ?, ?)",
        )
        .bind(project.id, now, now),
    ]);
    const generated = await createRecord(project.id);
    expect(generated.recordNumber).toBe("0042");
    const legacy = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/legacy-alpha`,
      request("admin"),
      dependencies(),
    );
    await expect(legacy.json()).resolves.toMatchObject({
      data: { recordNumber: "A-900", discipline: "ARCH" },
    });
    const unchangedLegacy = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/legacy-alpha`,
      request("admin", "PATCH", { title: "Updated legacy" }),
      dependencies(),
    );
    expect(unchangedLegacy.status).toBe(200);
    await expect(unchangedLegacy.json()).resolves.toMatchObject({
      data: {
        recordNumber: "A-900",
        discipline: "ARCH",
        title: "Updated legacy",
      },
    });
  });

  it("rejects protected fields and uncontrolled discipline values", async () => {
    const first = await createProject("P-REC-VALIDATION");
    const record = await createRecord(first.id);
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
    const clientNumber = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", {
        recordType: "document",
        recordNumber: "9999",
        title: "Client numbered",
      }),
      dependencies(),
    );
    expect(clientNumber.status).toBe(400);
    const updateNumber = await invokeV2Api(
      `/api/v2/projects/${first.id}/records/${record.id}`,
      request("admin", "PATCH", { recordNumber: "9999" }),
      dependencies(),
    );
    expect(updateNumber.status).toBe(400);
    const invalidDiscipline = await invokeV2Api(
      `/api/v2/projects/${first.id}/records`,
      request("admin", "POST", {
        recordType: "document",
        title: "Invalid discipline",
        discipline: "Architecture",
      }),
      dependencies(),
    );
    expect(invalidDiscipline.status).toBe(400);
    const invalidDisciplineUpdate = await invokeV2Api(
      `/api/v2/projects/${first.id}/records/${record.id}`,
      request("admin", "PATCH", { discipline: "Architecture" }),
      dependencies(),
    );
    expect(invalidDisciplineUpdate.status).toBe(400);
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

    const rollbackRecord = await createRecord(
      project.id,
      "admin",
      "Rollback target",
    );
    expect(rollbackRecord.recordNumber).toBe("0002");
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
      expect(stored?.title).toBe("Rollback target");
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
