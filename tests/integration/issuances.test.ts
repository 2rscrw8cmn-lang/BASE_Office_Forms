import { beforeEach, describe, expect, it } from "vitest";

import {
  IssuanceService,
  type IssuanceStoragePort,
} from "../../src/application/issuances/issuance-service";
import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1IssuancesRepository } from "../../src/infrastructure/db/d1/issuances-repository";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectIssuanceSequencesRepository } from "../../src/infrastructure/db/d1/project-issuance-sequences-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RecordRevisionSequencesRepository } from "../../src/infrastructure/db/d1/record-revision-sequences-repository";
import { D1RecordRevisionsRepository } from "../../src/infrastructure/db/d1/record-revisions-repository";
import { D1RecordsRepository } from "../../src/infrastructure/db/d1/records-repository";
import { D1RevisionFilesRepository } from "../../src/infrastructure/db/d1/revision-files-repository";
import { D1UsersRepository } from "../../src/infrastructure/db/d1/users-repository";
import type { V2RouteDependencies } from "../../src/http/v2/dependencies";
import { invokeV2Api } from "../helpers/api";
import { resetIdentityFoundation, testDatabase } from "../helpers/d1";

const sessions: Record<string, AppSession> = {
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
  unassignedManager: {
    userId: "user-unassigned",
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
  outsider: {
    userId: "user-outsider",
    organizationId: "org-b",
    membershipRole: "org_admin",
    projectPermissions: [],
  },
};

class FixtureAuthenticationAdapter implements AuthenticationAdapter {
  authenticate(request: Request): Promise<AuthenticationResult> {
    const key = request.headers.get("x-test-session") ?? "";
    const session = Object.entries(sessions).find(
      ([name]) => name === key,
    )?.[1];
    return Promise.resolve(
      session
        ? { authenticated: true, session }
        : { authenticated: false, reason: "MISSING_CREDENTIALS" },
    );
  }
}

class HeadOnlyStorage implements IssuanceStoragePort {
  readonly objects = new Map<string, number>();
  readonly headCalls: string[] = [];
  failure: Error | null = null;

  head(key: string): Promise<{ size: number } | null> {
    this.headCalls.push(key);
    if (this.failure) return Promise.reject(this.failure);
    const size = this.objects.get(key);
    return Promise.resolve(size === undefined ? null : { size });
  }
}

function dependencies(storage: IssuanceStoragePort): V2RouteDependencies {
  const database = testDatabase();
  const projects = new ProjectService(
    new D1ProjectsRepository(database),
    new D1ProjectMembershipsRepository(database),
  );
  const records = new D1RecordsRepository(database);
  const revisions = new D1RecordRevisionsRepository(
    database,
    new D1RecordRevisionSequencesRepository(database),
  );
  const files = new D1RevisionFilesRepository(database);
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    issuances: new IssuanceService(
      projects,
      records,
      revisions,
      files,
      new D1IssuancesRepository(
        database,
        new D1ProjectIssuanceSequencesRepository(database),
      ),
      new D1UsersRepository(database),
      storage,
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

function createPath(
  recordId = "record-a",
  revisionId = "revision-published",
  projectId = "project-a",
): string {
  return `/api/v2/projects/${projectId}/records/${recordId}/revisions/${revisionId}/issuances`;
}

function listPath(projectId = "project-a"): string {
  return `/api/v2/projects/${projectId}/issuances`;
}

async function jsonData<T>(response: Response): Promise<T> {
  const body: { data: T } = await response.json();
  return body.data;
}

async function errorCode(response: Response): Promise<string> {
  const body: { error: { code: string } } = await response.json();
  return body.error.code;
}

interface ApiIssuanceFile {
  fileId: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  displayOrder: number;
  storageKey?: string;
}

interface ApiIssuance {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  issueNumber: string;
  issueSequence: number;
  purpose: string;
  notes: string | null;
  issuedBy: string;
  issuedAt: string;
  files: ApiIssuanceFile[];
  revisionSnapshot?: unknown;
  storageKey?: string;
}

async function issue(
  storage: IssuanceStoragePort,
  options: {
    session?: string;
    projectId?: string;
    recordId?: string;
    revisionId?: string;
    purpose?: string;
    notes?: unknown;
    fileIds?: unknown;
    extra?: Record<string, unknown>;
  } = {},
): Promise<Response> {
  return invokeV2Api(
    createPath(options.recordId, options.revisionId, options.projectId),
    request(options.session ?? "admin", "POST", {
      purpose: options.purpose ?? "for_construction",
      ...(options.notes === undefined ? {} : { notes: options.notes }),
      fileIds: options.fileIds ?? ["file-a-1"],
      ...options.extra,
    }),
    dependencies(storage),
  );
}

async function seedHierarchy(): Promise<void> {
  const database = testDatabase();
  const now = "2026-07-20T12:00:00.000Z";
  await database.batch([
    database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-a', 'org-a', 'P-A', 'Project A', 'active', 'America/New_York', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-b', 'org-a', 'P-B', 'Project B', 'active', 'America/New_York', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-outside', 'org-b', 'P-OUT', 'Outside', 'active', 'America/New_York', ?, ?)",
      )
      .bind(now, now),
  ]);
  await database.batch([
    ...["manager", "contributor", "viewer"].map((name) =>
      database
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', 'project-a', ?, ?, 'active', ?)",
        )
        .bind(
          `project-membership-${name}`,
          sessions[name].userId,
          sessions[name].membershipRole,
          now,
        ),
    ),
    database
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, title, description, status, created_by, created_at, updated_at) VALUES ('record-a', 'org-a', 'project-a', 'drawing', 'Original title', 'Original description', 'active', 'user-admin', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-other', 'org-a', 'project-a', 'document', 'Other record', 'active', 'user-admin', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-project-b', 'org-a', 'project-b', 'document', 'Project B record', 'active', 'user-admin', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-outside', 'org-b', 'project-outside', 'document', 'Outside record', 'active', 'user-outsider', ?, ?)",
      )
      .bind(now, now),
  ]);
  await database.batch([
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, revision_label, title, description, discipline, source, change_summary, status, created_by, created_at) VALUES ('revision-published', 'org-a', 'project-a', 'record-a', 1, 'A', 'Issued title', 'Issued description', 'Architectural', 'Design team', 'Initial issue', 'published', 'user-admin', ?)",
      )
      .bind(now),
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-draft', 'org-a', 'project-a', 'record-a', 2, 'Draft title', 'Draft change', 'draft', 'user-admin', ?)",
      )
      .bind(now),
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-superseded', 'org-a', 'project-a', 'record-a', 3, 'Old title', 'Old change', 'superseded', 'user-admin', ?)",
      )
      .bind(now),
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-other', 'org-a', 'project-a', 'record-other', 1, 'Other title', 'Initial', 'published', 'user-admin', ?)",
      )
      .bind(now),
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-project-b', 'org-a', 'project-b', 'record-project-b', 1, 'Project B title', 'Initial', 'published', 'user-admin', ?)",
      )
      .bind(now),
    database
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, title, change_summary, status, created_by, created_at) VALUES ('revision-outside', 'org-b', 'project-outside', 'record-outside', 1, 'Outside title', 'Initial', 'published', 'user-outsider', ?)",
      )
      .bind(now),
  ]);

  const files = [
    [
      "file-a-1",
      "org-a",
      "project-a",
      "record-a",
      "revision-published",
      "private/a-1",
      "one.pdf",
      11,
      "a",
    ],
    [
      "file-a-2",
      "org-a",
      "project-a",
      "record-a",
      "revision-published",
      "private/a-2",
      "two.pdf",
      22,
      "b",
    ],
    [
      "file-draft",
      "org-a",
      "project-a",
      "record-a",
      "revision-draft",
      "private/draft",
      "draft.pdf",
      33,
      "c",
    ],
    [
      "file-other",
      "org-a",
      "project-a",
      "record-other",
      "revision-other",
      "private/other",
      "other.pdf",
      44,
      "d",
    ],
    [
      "file-project-b",
      "org-a",
      "project-b",
      "record-project-b",
      "revision-project-b",
      "private/project-b",
      "project-b.pdf",
      55,
      "e",
    ],
    [
      "file-outside",
      "org-b",
      "project-outside",
      "record-outside",
      "revision-outside",
      "private/outside",
      "outside.pdf",
      66,
      "f",
    ],
  ] as const;
  await database.batch(
    files.map(
      ([
        id,
        organizationId,
        projectId,
        recordId,
        revisionId,
        key,
        name,
        size,
        digest,
      ]) =>
        database
          .prepare(
            `INSERT INTO revision_files
            (id, organization_id, project_id, record_id, revision_id, storage_key,
             original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?)`,
          )
          .bind(
            id,
            organizationId,
            projectId,
            recordId,
            revisionId,
            key,
            name,
            size,
            digest.repeat(64),
            organizationId === "org-b" ? "user-outsider" : "user-admin",
            now,
          ),
    ),
  );
}

function populateStorage(storage: HeadOnlyStorage): void {
  storage.objects.set("private/a-1", 11);
  storage.objects.set("private/a-2", 22);
  storage.objects.set("private/draft", 33);
  storage.objects.set("private/other", 44);
  storage.objects.set("private/project-b", 55);
  storage.objects.set("private/outside", 66);
}

async function count(table: string): Promise<number> {
  const row = await testDatabase()
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .first<{ count: number }>();
  return row?.count ?? -1;
}

describe("issuance foundation", () => {
  let storage: HeadOnlyStorage;

  beforeEach(async () => {
    await resetIdentityFoundation();
    // Organizations must precede users' membership rows.
    const database = testDatabase();
    const now = "2026-07-20T12:00:00.000Z";
    await database.batch([
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-a', 'Org A', 'org-a', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
      database
        .prepare(
          "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-b', 'Org B', 'org-b', 'active', '{}', ?, ?)",
        )
        .bind(now, now),
    ]);
    const users = Object.entries(sessions).map(([name, session]) =>
      database
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
        )
        .bind(
          session.userId,
          `identity|${name}`,
          `${name}@example.test`,
          `${name} display`,
          now,
          now,
        ),
    );
    await database.batch(users);
    const memberships = Object.entries(sessions).map(([name, session]) =>
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
        )
        .bind(
          `membership-${name}`,
          session.organizationId,
          session.userId,
          session.membershipRole,
          now,
        ),
    );
    await database.batch(memberships);
    await seedHierarchy();
    storage = new HeadOnlyStorage();
    populateStorage(storage);
  });

  it("issues selected files in request order, snapshots history, numbers project-wide, and reads newest first", async () => {
    const firstResponse = await issue(storage, {
      fileIds: ["file-a-2", "file-a-1"],
      notes: "Issued set",
    });
    expect(firstResponse.status).toBe(201);
    const first = await jsonData<ApiIssuance>(firstResponse);
    expect(first.issueNumber).toBe("ISS-001");
    expect(first.issueSequence).toBe(1);
    expect(first.files.map((file) => [file.fileId, file.displayOrder])).toEqual(
      [
        ["file-a-2", 0],
        ["file-a-1", 1],
      ],
    );
    expect(firstResponse.headers.get("content-type")).toContain("json");
    expect(JSON.stringify(first)).not.toContain("storageKey");
    expect(first.revisionSnapshot).toBeUndefined();

    const secondResponse = await issue(storage, {
      recordId: "record-other",
      revisionId: "revision-other",
      fileIds: ["file-other"],
      purpose: "for_review",
    });
    const second = await jsonData<ApiIssuance>(secondResponse);
    expect(second.issueNumber).toBe("ISS-002");

    const listResponse = await invokeV2Api(
      listPath(),
      request("viewer"),
      dependencies(storage),
    );
    expect(listResponse.status).toBe(200);
    const list =
      await jsonData<
        Array<{ id: string; issueNumber: string; fileCount: number }>
      >(listResponse);
    expect(list.map((item) => item.issueNumber)).toEqual([
      "ISS-002",
      "ISS-001",
    ]);
    expect(list[1].fileCount).toBe(2);

    const detailResponse = await invokeV2Api(
      `${listPath()}/${first.id}`,
      request("contributor"),
      dependencies(storage),
    );
    const detailText = await detailResponse.clone().text();
    const detail = await jsonData<ApiIssuance>(detailResponse);
    expect(detail.files.map((file) => file.fileId)).toEqual([
      "file-a-2",
      "file-a-1",
    ]);
    expect(detailText).not.toContain("storage_key");

    const row = await testDatabase()
      .prepare("SELECT revision_snapshot_json FROM issuances WHERE id = ?")
      .bind(first.id)
      .first<{ revision_snapshot_json: string }>();
    const snapshot = JSON.parse(
      row?.revision_snapshot_json ?? "null",
    ) as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      id: "revision-published",
      organizationId: "org-a",
      projectId: "project-a",
      recordId: "record-a",
      revisionNumber: 1,
      status: "published",
      title: "Issued title",
      createdBy: "user-admin",
      issuedByDisplayName: "admin display",
    });
    const event = await testDatabase()
      .prepare(
        "SELECT prior_state_json, new_state_json, metadata_json FROM activity_events WHERE action = 'issuance.created' AND object_id = ?",
      )
      .bind(first.id)
      .first<{
        prior_state_json: string | null;
        new_state_json: string;
        metadata_json: string;
      }>();
    expect(event?.prior_state_json).toBeNull();
    expect(JSON.parse(event?.metadata_json ?? "null")).toEqual({});
    const eventState = JSON.parse(event?.new_state_json ?? "null") as {
      issueNumber: string;
      files: Array<{ fileId: string }>;
    };
    expect(eventState.issueNumber).toBe("ISS-001");
    expect(eventState.files.map((file) => file.fileId)).toEqual([
      "file-a-2",
      "file-a-1",
    ]);
  });

  it("rejects malformed create bodies and controlled-purpose violations", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        { purpose: "for_review", fileIds: [], extra: true },
        "VALIDATION_FAILED",
      ],
      [{ fileIds: ["file-a-1"] }, "VALIDATION_FAILED"],
      [{ purpose: "invalid", fileIds: ["file-a-1"] }, "VALIDATION_FAILED"],
      [{ purpose: "for_review", fileIds: [] }, "VALIDATION_FAILED"],
      [
        { purpose: "for_review", fileIds: ["file-a-1", "file-a-1"] },
        "VALIDATION_FAILED",
      ],
      [{ purpose: "for_review", fileIds: [" "] }, "VALIDATION_FAILED"],
      [
        { purpose: "other", notes: " ", fileIds: ["file-a-1"] },
        "VALIDATION_FAILED",
      ],
    ];
    for (const [body, expectedCode] of cases) {
      const response = await invokeV2Api(
        createPath(),
        request("admin", "POST", body),
        dependencies(storage),
      );
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe(expectedCode);
    }
    expect(await count("issuances")).toBe(0);
  });

  it("rejects draft, superseded, archived, mismatched-hierarchy, and cross-tenant issuance attempts", async () => {
    const draft = await issue(storage, {
      revisionId: "revision-draft",
      fileIds: ["file-draft"],
    });
    expect(draft.status).toBe(409);
    expect(await errorCode(draft)).toBe("ISSUANCE_INELIGIBLE");
    const superseded = await issue(storage, {
      revisionId: "revision-superseded",
      fileIds: ["file-a-1"],
    });
    expect(superseded.status).toBe(409);

    await testDatabase()
      .prepare(
        "UPDATE records SET status = 'archived', archived_at = ? WHERE id = 'record-a'",
      )
      .bind(new Date().toISOString())
      .run();
    const archived = await issue(storage);
    expect(archived.status).toBe(409);
    await testDatabase()
      .prepare(
        "UPDATE records SET status = 'active', archived_at = NULL WHERE id = 'record-a'",
      )
      .run();

    const mismatchedRevision = await issue(storage, {
      recordId: "record-other",
      revisionId: "revision-published",
      fileIds: ["file-a-1"],
    });
    expect(mismatchedRevision.status).toBe(404);
    expect(await errorCode(mismatchedRevision)).toBe("REVISION_NOT_FOUND");

    for (const fileId of [
      "file-draft",
      "file-other",
      "file-project-b",
      "file-outside",
    ]) {
      const response = await issue(storage, { fileIds: [fileId] });
      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("ISSUANCE_INELIGIBLE");
    }
    const crossTenant = await issue(storage, { session: "outsider" });
    expect(crossTenant.status).toBe(404);
    expect(await errorCode(crossTenant)).toBe("PROJECT_NOT_FOUND");
    expect(await count("issuances")).toBe(0);
  });

  it("preflights R2 with head only and consumes no number on missing, mismatched, or failed storage", async () => {
    storage.objects.delete("private/a-1");
    const missing = await issue(storage);
    expect(missing.status).toBe(500);
    expect(await errorCode(missing)).toBe("ISSUANCE_FILE_OBJECT_MISSING");
    expect(storage.headCalls).toEqual(["private/a-1"]);

    storage.objects.set("private/a-1", 999);
    const mismatched = await issue(storage);
    expect(mismatched.status).toBe(500);
    expect(await errorCode(mismatched)).toBe("ISSUANCE_FILE_OBJECT_INTEGRITY");

    storage.objects.set("private/a-1", 11);
    storage.failure = new Error("forced head failure");
    const unavailable = await issue(storage);
    expect(unavailable.status).toBe(502);
    expect(await errorCode(unavailable)).toBe("ISSUANCE_STORAGE_UNAVAILABLE");

    expect(await count("issuances")).toBe(0);
    expect(await count("issuance_files")).toBe(0);
    expect(await count("project_issuance_sequences")).toBe(0);
    const events = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'issuance.created'",
      )
      .first<{ count: number }>();
    expect(events?.count).toBe(0);
  });

  it("enforces issue and read authorization by organization role and project assignment", async () => {
    for (const session of ["admin", "documentControl", "manager"]) {
      const response = await issue(storage, { session });
      expect(response.status).toBe(201);
    }
    for (const session of ["contributor", "viewer"]) {
      const response = await issue(storage, { session });
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("AUTHORIZATION_DENIED");
      const list = await invokeV2Api(
        listPath(),
        request(session),
        dependencies(storage),
      );
      expect(list.status).toBe(200);
    }
    const unassigned = await issue(storage, { session: "unassignedManager" });
    expect(unassigned.status).toBe(404);
    const unassignedRead = await invokeV2Api(
      listPath(),
      request("unassignedManager"),
      dependencies(storage),
    );
    expect(unassignedRead.status).toBe(404);
  });

  it.each([
    ["issuance insert", "issuances", "forced_issuance_insert"],
    ["issuance file insert", "issuance_files", "forced_issuance_file_insert"],
    ["activity insert", "activity_events", "forced_issuance_activity"],
  ])(
    "rolls back sequence and every issuance row when the %s fails",
    async (_label, table, trigger) => {
      const database = testDatabase();
      const when =
        table === "activity_events"
          ? " WHEN NEW.action = 'issuance.created'"
          : "";
      await database
        .prepare(
          `CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table}${when} BEGIN SELECT RAISE(ABORT, 'forced issuance failure'); END`,
        )
        .run();
      try {
        const response = await issue(storage);
        expect(response.status).toBe(500);
        expect(await errorCode(response)).toBe("ISSUANCE_PERSISTENCE_FAILED");
      } finally {
        await database.prepare(`DROP TRIGGER IF EXISTS ${trigger}`).run();
      }
      expect(await count("issuances")).toBe(0);
      expect(await count("issuance_files")).toBe(0);
      expect(await count("project_issuance_sequences")).toBe(0);
      const events = await database
        .prepare(
          "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'issuance.created'",
        )
        .first<{ count: number }>();
      expect(events?.count).toBe(0);
    },
  );

  it("allocates unique sequential project numbers for concurrent requests", async () => {
    const responses = await Promise.all([
      issue(storage),
      issue(storage, { fileIds: ["file-a-2"], purpose: "for_review" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const created = await Promise.all(
      responses.map((response) => jsonData<ApiIssuance>(response)),
    );
    expect(created.map((item) => item.issueNumber).sort()).toEqual([
      "ISS-001",
      "ISS-002",
    ]);
    expect(await count("issuances")).toBe(2);
    expect(await count("issuance_files")).toBe(2);
  });

  it("keeps historical reads and snapshots unchanged after record, revision, project, and membership changes", async () => {
    const created = await jsonData<ApiIssuance>(await issue(storage));
    const database = testDatabase();
    const before = await database
      .prepare("SELECT revision_snapshot_json FROM issuances WHERE id = ?")
      .bind(created.id)
      .first<{ revision_snapshot_json: string }>();
    await database.batch([
      database.prepare(
        "UPDATE records SET status = 'archived', title = 'Changed record', archived_at = '2026-07-21T00:00:00.000Z' WHERE id = 'record-a'",
      ),
      database.prepare(
        "UPDATE record_revisions SET status = 'superseded', title = 'Changed revision' WHERE id = 'revision-published'",
      ),
      database.prepare(
        "UPDATE projects SET name = 'Changed project' WHERE id = 'project-a'",
      ),
      database.prepare(
        "UPDATE project_memberships SET status = 'disabled' WHERE project_id = 'project-a' AND user_id = 'user-manager'",
      ),
    ]);
    const response = await invokeV2Api(
      `${listPath()}/${created.id}`,
      request("admin"),
      dependencies(storage),
    );
    expect(response.status).toBe(200);
    expect((await jsonData<ApiIssuance>(response)).issueNumber).toBe("ISS-001");
    const after = await database
      .prepare("SELECT revision_snapshot_json FROM issuances WHERE id = ?")
      .bind(created.id)
      .first<{ revision_snapshot_json: string }>();
    expect(after?.revision_snapshot_json).toBe(before?.revision_snapshot_json);
  });
});
