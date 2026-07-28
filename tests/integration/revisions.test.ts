import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { RecordService } from "../../src/application/records/record-service";
import { RevisionService } from "../../src/application/revisions/revision-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RecordRevisionSequencesRepository } from "../../src/infrastructure/db/d1/record-revision-sequences-repository";
import { D1RecordRevisionsRepository } from "../../src/infrastructure/db/d1/record-revisions-repository";
import { D1RecordsRepository } from "../../src/infrastructure/db/d1/records-repository";
import { D1ProjectRecordSequencesRepository } from "../../src/infrastructure/db/d1/project-record-sequences-repository";
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
  const records = new D1RecordsRepository(
    database,
    new D1ProjectRecordSequencesRepository(database),
  );
  const revisionSequences = new D1RecordRevisionSequencesRepository(database);
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    records: new RecordService(projects, records),
    revisions: new RevisionService(
      projects,
      records,
      new D1RecordRevisionsRepository(database, revisionSequences),
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
  projectId: string;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  status: string;
  currentRevisionId: string | null;
}
interface ApiRevision {
  id: string;
  recordId: string;
  revisionNumber: number;
  revisionLabel: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  source: string | null;
  changeSummary: string;
  status: string;
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

async function createRecord(projectId: string): Promise<ApiRecord> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records`,
    request("admin", "POST", {
      recordType: "drawing",
      title: "  Floor Plan  ",
      description: " Level one ",
      discipline: "architectural",
      source: " Consultant ",
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  return jsonData<ApiRecord>(response);
}

async function createDraft(
  projectId: string,
  recordId: string,
  body: Record<string, unknown> = {},
  session = "admin",
): Promise<Response> {
  return invokeV2Api(
    `/api/v2/projects/${projectId}/records/${recordId}/revisions`,
    request(session, "POST", { changeSummary: "Initial issue", ...body }),
    dependencies(),
  );
}

async function publish(
  projectId: string,
  recordId: string,
  revisionId: string,
  session = "admin",
): Promise<Response> {
  return invokeV2Api(
    `/api/v2/projects/${projectId}/records/${recordId}/revisions/${revisionId}/publish`,
    request(session, "POST"),
    dependencies(),
  );
}

describe("revisions foundation API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("creates draft revisions with defaults, overrides, permanent numbering, and lists newest first", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);

    const project = await createProject("P-REV-1");
    const record = await createRecord(project.id);

    const first = await createDraft(project.id, record.id, {
      revisionLabel: "  P0  ",
    });
    expect(first.status).toBe(201);
    const firstBody = await jsonData<ApiRevision>(first);
    expect(firstBody).toMatchObject({
      revisionNumber: 1,
      revisionLabel: "P0",
      title: "Floor Plan",
      description: "Level one",
      discipline: "architectural",
      source: "Consultant",
      changeSummary: "Initial issue",
      status: "draft",
    });

    const second = await createDraft(project.id, record.id, {
      title: "Floor Plan Revised",
      discipline: null,
      changeSummary: "Updated dimensions",
    });
    expect(second.status).toBe(201);
    const secondBody = await jsonData<ApiRevision>(second);
    expect(secondBody).toMatchObject({
      revisionNumber: 2,
      revisionLabel: null,
      title: "Floor Plan Revised",
      description: "Level one",
      discipline: null,
      source: "Consultant",
      changeSummary: "Updated dimensions",
      status: "draft",
    });

    const blankLabel = await createDraft(project.id, record.id, {
      revisionLabel: "   ",
    });
    expect((await jsonData<ApiRevision>(blankLabel)).revisionLabel).toBeNull();

    const list = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions`,
      request("admin"),
      dependencies(),
    );
    expect(list.status).toBe(200);
    const listBody = await jsonData<ApiRevision[]>(list);
    expect(listBody.map((revision) => revision.revisionNumber)).toEqual([
      3, 2, 1,
    ]);

    const detail = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions/${firstBody.id}`,
      request("admin"),
      dependencies(),
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      data: { revisionNumber: 1, revisionLabel: "P0" },
    });

    const updatedRecord = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}`,
      request("admin", "PATCH", { title: "Later Renamed Record" }),
      dependencies(),
    );
    expect(updatedRecord.status).toBe(200);
    const untouched = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions/${firstBody.id}`,
      request("admin"),
      dependencies(),
    );
    await expect(untouched.json()).resolves.toMatchObject({
      data: { title: "Floor Plan" },
    });

    const missingChangeSummary = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions`,
      request("admin", "POST", {}),
      dependencies(),
    );
    expect(missingChangeSummary.status).toBe(400);
  });

  it("allows the same revision numbers across different records and is concurrency-safe", async () => {
    const project = await createProject("P-REV-2");
    const recordA = await createRecord(project.id);
    const recordB = await createRecord(project.id);

    const results = await Promise.all([
      createDraft(project.id, recordA.id, { changeSummary: "A1" }),
      createDraft(project.id, recordA.id, { changeSummary: "A2" }),
      createDraft(project.id, recordB.id, { changeSummary: "B1" }),
    ]);
    const bodies = await Promise.all(
      results.map((r) => jsonData<ApiRevision>(r)),
    );
    expect(
      bodies
        .slice(0, 2)
        .map((revision) => revision.revisionNumber)
        .sort(),
    ).toEqual([1, 2]);
    expect(bodies[2].revisionNumber).toBe(1);
  });

  it("publishes the first and later revisions, superseding the previous published revision", async () => {
    const project = await createProject("P-REV-3");
    const record = await createRecord(project.id);
    const first = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id),
    );

    const publishedFirst = await publish(project.id, record.id, first.id);
    expect(publishedFirst.status).toBe(200);
    await expect(publishedFirst.json()).resolves.toMatchObject({
      data: { status: "published" },
    });

    const recordAfterFirstPublish = await jsonData<ApiRecord>(
      await invokeV2Api(
        `/api/v2/projects/${project.id}/records/${record.id}`,
        request("admin"),
        dependencies(),
      ),
    );
    expect(recordAfterFirstPublish.currentRevisionId).toBe(first.id);

    const repeatPublish = await publish(project.id, record.id, first.id);
    expect(repeatPublish.status).toBe(409);

    const second = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id, {
        changeSummary: "Revised details",
      }),
    );
    const publishedSecond = await publish(project.id, record.id, second.id);
    expect(publishedSecond.status).toBe(200);

    const recordAfterSecondPublish = await jsonData<ApiRecord>(
      await invokeV2Api(
        `/api/v2/projects/${project.id}/records/${record.id}`,
        request("admin"),
        dependencies(),
      ),
    );
    expect(recordAfterSecondPublish.currentRevisionId).toBe(second.id);

    const firstAfterSupersede = await jsonData<ApiRevision>(
      await invokeV2Api(
        `/api/v2/projects/${project.id}/records/${record.id}/revisions/${first.id}`,
        request("admin"),
        dependencies(),
      ),
    );
    expect(firstAfterSupersede.status).toBe("superseded");

    const republishSuperseded = await publish(project.id, record.id, first.id);
    expect(republishSuperseded.status).toBe(409);

    const events = await testDatabase()
      .prepare(
        "SELECT action FROM activity_events WHERE object_id IN (?, ?) ORDER BY created_at ASC, rowid ASC",
      )
      .bind(first.id, second.id)
      .all<{ action: string }>();
    expect(events.results.map((event) => event.action)).toEqual([
      "revision.created",
      "revision.published",
      "revision.created",
      "revision.superseded",
      "revision.published",
    ]);
  });

  it("allows only one of two concurrent publishes for the same record to succeed", async () => {
    const project = await createProject("P-REV-CONCURRENT");
    const record = await createRecord(project.id);
    const draftA = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id, { changeSummary: "A" }),
    );
    const draftB = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id, { changeSummary: "B" }),
    );

    const [responseA, responseB] = await Promise.all([
      publish(project.id, record.id, draftA.id),
      publish(project.id, record.id, draftB.id),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const database = testDatabase();
    const rows = await database
      .prepare(
        "SELECT id, status FROM record_revisions WHERE record_id = ? ORDER BY revision_number ASC",
      )
      .bind(record.id)
      .all<{ id: string; status: string }>();
    const published = rows.results.filter((row) => row.status === "published");
    const stillDraft = rows.results.filter((row) => row.status === "draft");
    expect(published.length).toBe(1);
    expect(stillDraft.length).toBe(1);
    expect([draftA.id, draftB.id]).toContain(published[0].id);
    expect([draftA.id, draftB.id]).toContain(stillDraft[0].id);
    expect(published[0].id).not.toBe(stillDraft[0].id);

    const recordRow = await database
      .prepare("SELECT current_revision_id FROM records WHERE id = ?")
      .bind(record.id)
      .first<{ current_revision_id: string | null }>();
    expect(recordRow?.current_revision_id).toBe(published[0].id);

    const publishedEventCount = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE object_id IN (?, ?) AND action = 'revision.published'",
      )
      .bind(draftA.id, draftB.id)
      .first<{ count: number }>();
    expect(publishedEventCount?.count).toBe(1);

    const createdEventCount = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE object_id IN (?, ?) AND action = 'revision.created'",
      )
      .bind(draftA.id, draftB.id)
      .first<{ count: number }>();
    expect(createdEventCount?.count).toBe(2);
  });

  it("rejects revision creation and publication for archived records", async () => {
    const project = await createProject("P-REV-4");
    const record = await createRecord(project.id);
    const draft = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id),
    );
    const archive = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/archive`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(archive.status).toBe(200);

    const createAfterArchive = await createDraft(project.id, record.id);
    expect(createAfterArchive.status).toBe(409);

    const publishAfterArchive = await publish(project.id, record.id, draft.id);
    expect(publishAfterArchive.status).toBe(409);
  });

  it("keeps tenants and project/record URLs isolated and makes contributors and viewers read-only", async () => {
    const project = await createProject("P-REV-5");
    const record = await createRecord(project.id);
    const draft = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id),
    );
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-rev-b', 'org-b', 'P-REV-B', 'Other', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-rev-b', 'org-b', 'project-rev-b', 'document', 'Other', 'active', 'user-org-b', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('contributor-rev', 'org-a', ?, 'user-contributor', 'contributor', 'active', ?)",
        )
        .bind(project.id, now),
      testDatabase()
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('viewer-rev', 'org-a', ?, 'user-viewer', 'viewer', 'active', ?)",
        )
        .bind(project.id, now),
    ]);

    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/project-rev-b/records/record-rev-b/revisions`,
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/not-${project.id}/records/${record.id}/revisions`,
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/not-${record.id}/revisions/${draft.id}`,
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);

    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/revisions`,
          request("contributor"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/revisions/${draft.id}`,
          request("viewer"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await createDraft(project.id, record.id, {}, "contributor")).status,
    ).toBe(403);
    expect(
      (await publish(project.id, record.id, draft.id, "viewer")).status,
    ).toBe(403);
  });

  it("requires a revision creator to be a member of the revision organization", async () => {
    const database = testDatabase();
    const project = await createProject("P-REV-6");
    const record = await createRecord(project.id);
    const now = new Date().toISOString();

    await expect(
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-valid-creator', 'org-a', ?, ?, 1, 'Title', 'Summary', 'draft', 'user-admin', ?)",
        )
        .bind(project.id, record.id, now)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-missing-creator', 'org-a', ?, ?, 2, 'Title', 'Summary', 'draft', 'missing-user', ?)",
        )
        .bind(project.id, record.id, now)
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare(
          "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-cross-org-creator', 'org-a', ?, ?, 3, 'Title', 'Summary', 'draft', 'user-org-b', ?)",
        )
        .bind(project.id, record.id, now)
        .run(),
    ).rejects.toThrow();
  });

  it("enforces that records.current_revision_id references a revision belonging to the same organization and record", async () => {
    const database = testDatabase();
    const project = await createProject("P-REV-7");
    const recordA = await createRecord(project.id);
    const recordB = await createRecord(project.id);
    const revisionA = await jsonData<ApiRevision>(
      await createDraft(project.id, recordA.id),
    );

    await expect(
      database
        .prepare("UPDATE records SET current_revision_id = ? WHERE id = ?")
        .bind(revisionA.id, recordA.id)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      database
        .prepare(
          "UPDATE records SET current_revision_id = 'does-not-exist' WHERE id = ?",
        )
        .bind(recordA.id)
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare("UPDATE records SET current_revision_id = ? WHERE id = ?")
        .bind(revisionA.id, recordB.id)
        .run(),
    ).rejects.toThrow();

    await expect(
      database
        .prepare("UPDATE records SET current_revision_id = NULL WHERE id = ?")
        .bind(recordA.id)
        .run(),
    ).resolves.toBeDefined();
  });

  it("writes accurate activity events atomically and rolls back when audit inserts fail", async () => {
    const database = testDatabase();
    const project = await createProject("P-REV-8");
    const record = await createRecord(project.id);

    await database
      .prepare(
        "CREATE TRIGGER fail_revision_created_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'revision.created' BEGIN SELECT RAISE(ABORT, 'forced revision created audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/revisions`,
          request("admin", "POST", { changeSummary: "Rollback" }),
          dependencies(),
        ),
      ).rejects.toThrow(/forced revision created audit failure/);
      const count = await database
        .prepare(
          "SELECT COUNT(*) AS count FROM record_revisions WHERE record_id = ?",
        )
        .bind(record.id)
        .first<{ count: number }>();
      expect(count?.count).toBe(0);
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_revision_created_activity")
        .run();
    }

    const draft = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id),
    );

    await database
      .prepare(
        "CREATE TRIGGER fail_revision_published_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'revision.published' BEGIN SELECT RAISE(ABORT, 'forced revision published audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/revisions/${draft.id}/publish`,
          request("admin", "POST"),
          dependencies(),
        ),
      ).rejects.toThrow(/forced revision published audit failure/);
      const stored = await database
        .prepare("SELECT status FROM record_revisions WHERE id = ?")
        .bind(draft.id)
        .first<{ status: string }>();
      expect(stored?.status).toBe("draft");
      const recordRow = await database
        .prepare("SELECT current_revision_id FROM records WHERE id = ?")
        .bind(record.id)
        .first<{ current_revision_id: string | null }>();
      expect(recordRow?.current_revision_id).toBeNull();
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_revision_published_activity")
        .run();
    }

    const publishedDraft = await publish(project.id, record.id, draft.id);
    expect(publishedDraft.status).toBe(200);
    const nextDraft = await jsonData<ApiRevision>(
      await createDraft(project.id, record.id, {
        changeSummary: "Next revision",
      }),
    );

    await database
      .prepare(
        "CREATE TRIGGER fail_revision_superseded_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'revision.superseded' BEGIN SELECT RAISE(ABORT, 'forced revision superseded audit failure'); END",
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/records/${record.id}/revisions/${nextDraft.id}/publish`,
          request("admin", "POST"),
          dependencies(),
        ),
      ).rejects.toThrow(/forced revision superseded audit failure/);
      const priorPublished = await database
        .prepare("SELECT status FROM record_revisions WHERE id = ?")
        .bind(draft.id)
        .first<{ status: string }>();
      expect(priorPublished?.status).toBe("published");
      const nextStatus = await database
        .prepare("SELECT status FROM record_revisions WHERE id = ?")
        .bind(nextDraft.id)
        .first<{ status: string }>();
      expect(nextStatus?.status).toBe("draft");
      const recordRow = await database
        .prepare("SELECT current_revision_id FROM records WHERE id = ?")
        .bind(record.id)
        .first<{ current_revision_id: string | null }>();
      expect(recordRow?.current_revision_id).toBe(draft.id);
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_revision_superseded_activity")
        .run();
    }
  });

  it("preserves existing record data through the schema rebuild", async () => {
    const database = testDatabase();
    const project = await createProject("P-REV-9");
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, description, status, discipline, source, created_by, created_at, updated_at) VALUES ('legacy-record', 'org-a', ?, 'document', 'LEGACY-1', 'Legacy Record', 'Pre-existing', 'active', 'Structural', 'Field', 'user-admin', ?, ?)",
      )
      .bind(project.id, now, now)
      .run();
    const row = await database
      .prepare(
        "SELECT record_type, record_number, title, description, status, discipline, source, current_revision_id FROM records WHERE id = 'legacy-record'",
      )
      .first<{
        record_type: string;
        record_number: string;
        title: string;
        description: string;
        status: string;
        discipline: string;
        source: string;
        current_revision_id: string | null;
      }>();
    expect(row).toEqual({
      record_type: "document",
      record_number: "LEGACY-1",
      title: "Legacy Record",
      description: "Pre-existing",
      status: "active",
      discipline: "Structural",
      source: "Field",
      current_revision_id: null,
    });
  });
});
