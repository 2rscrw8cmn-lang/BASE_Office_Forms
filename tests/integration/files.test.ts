import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { FileService } from "../../src/application/files/file-service";
import type {
  FileObjectMetadata,
  FileStoragePort,
  StoredFileObject,
} from "../../src/application/files/file-service";
import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { RecordService } from "../../src/application/records/record-service";
import { RevisionService } from "../../src/application/revisions/revision-service";
import { sha256Hex } from "../../src/domain/files/checksum";
import { MAX_FILE_BYTES } from "../../src/domain/files/validation";
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
import { D1RevisionFilesRepository } from "../../src/infrastructure/db/d1/revision-files-repository";
import { R2FileStorage } from "../../src/infrastructure/storage/r2-file-storage";
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
  unassignedManager: {
    userId: "user-unassigned-manager",
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

/** Wraps the real (Miniflare-local, non-production) R2 storage so individual
 * tests can force a `put` or `delete` failure without touching real R2. */
class ControllableFileStorage implements FileStoragePort {
  failPut = false;
  failDelete = false;
  private readonly inner = new R2FileStorage(env.FILES);

  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void> {
    if (this.failPut) return Promise.reject(new Error("forced R2 put failure"));
    return this.inner.put(key, content, metadata);
  }

  get(key: string): Promise<StoredFileObject | null> {
    return this.inner.get(key);
  }

  delete(key: string): Promise<void> {
    if (this.failDelete)
      return Promise.reject(new Error("forced R2 delete failure"));
    return this.inner.delete(key);
  }
}

/**
 * Pins every operation to the key of the first put, so a second upload
 * collides on the create-only put and exercises the conditional-write
 * rejection end to end (normal uploads never collide because keys embed a
 * random file id). `collidedKey` exposes the real R2 key for assertions.
 */
class CollidingFileStorage implements FileStoragePort {
  collidedKey: string | null = null;
  private readonly inner = new R2FileStorage(env.FILES);

  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void> {
    this.collidedKey ??= key;
    return this.inner.put(this.collidedKey, content, metadata);
  }

  get(key: string): Promise<StoredFileObject | null> {
    return this.inner.get(this.collidedKey ?? key);
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(this.collidedKey ?? key);
  }
}

/**
 * Returns a caller-controlled stored object from `get` so download-time
 * integrity handling can be exercised with a content type and size that
 * disagree with the authoritative D1 metadata, without any real R2 access.
 */
class StubGetFileStorage implements FileStoragePort {
  constructor(
    private readonly size: number,
    private readonly contentType: string | null,
  ) {}

  put(): Promise<void> {
    return Promise.resolve();
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  get(): Promise<StoredFileObject | null> {
    const body = new Response("stub object body").body;
    if (!body) throw new Error("Expected a readable body.");
    return Promise.resolve({
      body,
      size: this.size,
      httpEtag: null,
      contentType: this.contentType,
    });
  }
}

function dependencies(storage?: FileStoragePort): V2RouteDependencies {
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
  const revisions = new D1RecordRevisionsRepository(
    database,
    revisionSequences,
  );
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    records: new RecordService(projects, records),
    revisions: new RevisionService(projects, records, revisions),
    files: new FileService(
      projects,
      records,
      revisions,
      new D1RevisionFilesRepository(database),
      storage ?? new R2FileStorage(env.FILES),
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

function uploadRequest(session: string, formData: FormData): RequestInit {
  return {
    method: "POST",
    headers: { "x-test-session": session },
    body: formData,
  };
}

function fileFormData(
  content: BlobPart,
  filename = "plan.pdf",
  type = "application/pdf",
): FormData {
  const formData = new FormData();
  formData.append("file", new File([content], filename, { type }));
  return formData;
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

async function jsonError(
  response: Response,
): Promise<{ code: string; message: string }> {
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("error" in body)
  ) {
    throw new Error("Expected an API error response.");
  }
  return (body as { error: { code: string; message: string } }).error;
}

interface ApiProject {
  id: string;
}
interface ApiRecord {
  id: string;
}
interface ApiRevision {
  id: string;
  status: string;
}
interface ApiFile {
  id: string;
  organizationId: string;
  projectId: string;
  recordId: string;
  revisionId: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  storageKey?: string;
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

async function assignProjectMember(
  projectId: string,
  userId: string,
  role: "project_manager" | "contributor" | "viewer",
): Promise<void> {
  const database = testDatabase();
  const now = new Date().toISOString();
  await database
    .prepare(
      "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, ?, ?, 'active', ?)",
    )
    .bind(`membership-${projectId}-${userId}`, projectId, userId, role, now)
    .run();
}

async function createRecord(projectId: string): Promise<ApiRecord> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records`,
    request("admin", "POST", {
      recordType: "drawing",
      title: "Floor Plan",
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  return jsonData<ApiRecord>(response);
}

async function createDraft(
  projectId: string,
  recordId: string,
): Promise<ApiRevision> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records/${recordId}/revisions`,
    request("admin", "POST", { changeSummary: "Initial issue" }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  return jsonData<ApiRevision>(response);
}

function filesPath(
  projectId: string,
  recordId: string,
  revisionId: string,
  suffix = "",
): string {
  return `/api/v2/projects/${projectId}/records/${recordId}/revisions/${revisionId}/files${suffix}`;
}

async function upload(
  projectId: string,
  recordId: string,
  revisionId: string,
  formData: FormData,
  session = "admin",
  storage?: FileStoragePort,
): Promise<Response> {
  return invokeV2Api(
    filesPath(projectId, recordId, revisionId),
    uploadRequest(session, formData),
    dependencies(storage),
  );
}

describe("files foundation API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("reports current schema version 13", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);
  });

  it("uploads a file, persists metadata and the file.uploaded event, and downloads exact bytes", async () => {
    const project = await createProject("P-FILES-1");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const bytes = new TextEncoder().encode("%PDF-1.4 fixture content");

    const response = await upload(
      project.id,
      record.id,
      revision.id,
      fileFormData(bytes, "Floor Plan.pdf", "application/pdf"),
    );
    expect(response.status).toBe(201);
    const file = await jsonData<ApiFile>(response);
    expect(file).toMatchObject({
      organizationId: "org-a",
      projectId: project.id,
      recordId: record.id,
      revisionId: revision.id,
      originalFilename: "Floor Plan.pdf",
      mediaType: "application/pdf",
      byteSize: bytes.byteLength,
      uploadedBy: "user-admin",
    });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.storageKey).toBeUndefined();
    expect(JSON.stringify(file)).not.toContain("storageKey");
    expect(JSON.stringify(file)).not.toContain("organizations/org-a");

    const event = await testDatabase()
      .prepare(
        "SELECT action, object_type, prior_state_json FROM activity_events WHERE object_id = ?",
      )
      .bind(file.id)
      .first<{
        action: string;
        object_type: string;
        prior_state_json: string | null;
      }>();
    expect(event).toMatchObject({
      action: "file.uploaded",
      object_type: "file",
      prior_state_json: null,
    });

    const detail = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}`),
      request("admin"),
      dependencies(),
    );
    expect(detail.status).toBe(200);
    expect(await jsonData<ApiFile>(detail)).toMatchObject({
      id: file.id,
      originalFilename: "Floor Plan.pdf",
    });

    const list = await invokeV2Api(
      filesPath(project.id, record.id, revision.id),
      request("admin"),
      dependencies(),
    );
    expect(list.status).toBe(200);
    const listBody = await jsonData<ApiFile[]>(list);
    expect(listBody.map((entry) => entry.id)).toEqual([file.id]);

    const download = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}/content`),
      request("admin"),
      dependencies(),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Type")).toBe("application/pdf");
    expect(download.headers.get("Content-Length")).toBe(
      String(bytes.byteLength),
    );
    expect(download.headers.get("Content-Disposition")).toContain(
      'filename="Floor Plan.pdf"',
    );
    expect(download.headers.get("Cache-Control")).toBe("private, no-store");
    const downloaded = new Uint8Array(await download.arrayBuffer());
    expect(Array.from(downloaded)).toEqual(Array.from(bytes));
  });

  it("allows duplicate filenames and checksums while keeping storage keys unique", async () => {
    const project = await createProject("P-FILES-2");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const bytes = new TextEncoder().encode("identical content");

    const first = await jsonData<ApiFile>(
      await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData(bytes, "same.pdf"),
      ),
    );
    const second = await jsonData<ApiFile>(
      await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData(bytes, "same.pdf"),
      ),
    );
    expect(first.id).not.toBe(second.id);
    expect(first.sha256).toBe(second.sha256);
    expect(first.originalFilename).toBe(second.originalFilename);

    const keys = await testDatabase()
      .prepare("SELECT storage_key FROM revision_files WHERE id IN (?, ?)")
      .bind(first.id, second.id)
      .all<{ storage_key: string }>();
    const storageKeys = keys.results.map((row) => row.storage_key);
    expect(new Set(storageKeys).size).toBe(2);
  });

  it("rejects invalid uploads", async () => {
    const project = await createProject("P-FILES-3");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);

    const noFile = new FormData();
    noFile.append("notes", "no file here");
    expect(
      (await upload(project.id, record.id, revision.id, noFile)).status,
    ).toBe(400);

    const twoFiles = new FormData();
    twoFiles.append(
      "file",
      new File(["a"], "a.pdf", { type: "application/pdf" }),
    );
    twoFiles.append(
      "file",
      new File(["b"], "b.pdf", { type: "application/pdf" }),
    );
    expect(
      (await upload(project.id, record.id, revision.id, twoFiles)).status,
    ).toBe(400);

    const unexpectedField = fileFormData("content");
    unexpectedField.append("extra", "not allowed");
    expect(
      (await upload(project.id, record.id, revision.id, unexpectedField))
        .status,
    ).toBe(400);

    const zeroByte = fileFormData(new Uint8Array(0), "empty.pdf");
    expect(
      (await upload(project.id, record.id, revision.id, zeroByte)).status,
    ).toBe(400);

    const tooLarge = fileFormData(
      new Uint8Array(MAX_FILE_BYTES + 1),
      "big.bin",
      "application/octet-stream",
    );
    expect(
      (await upload(project.id, record.id, revision.id, tooLarge)).status,
    ).toBe(400);

    const blankFilename = new FormData();
    blankFilename.append(
      "file",
      new File(["a"], "", { type: "application/pdf" }),
    );
    expect(
      (await upload(project.id, record.id, revision.id, blankFilename)).status,
    ).toBe(400);

    const invalidMediaType = fileFormData(
      "content",
      "file.pdf",
      "not-a-media-type",
    );
    expect(
      (await upload(project.id, record.id, revision.id, invalidMediaType))
        .status,
    ).toBe(400);
  });

  it("allows uploads to draft, published, and superseded revisions but rejects archived records; reads remain allowed under archived records", async () => {
    const project = await createProject("P-FILES-4");
    const record = await createRecord(project.id);
    const draft = await createDraft(project.id, record.id);

    expect(
      (
        await upload(
          project.id,
          record.id,
          draft.id,
          fileFormData("draft content"),
        )
      ).status,
    ).toBe(201);

    const publishResponse = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions/${draft.id}/publish`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(publishResponse.status).toBe(200);
    expect(
      (
        await upload(
          project.id,
          record.id,
          draft.id,
          fileFormData("published content"),
        )
      ).status,
    ).toBe(201);

    const next = await createDraft(project.id, record.id);
    const supersedeResponse = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/revisions/${next.id}/publish`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(supersedeResponse.status).toBe(200);
    const supersededFile = await upload(
      project.id,
      record.id,
      draft.id,
      fileFormData("superseded content"),
    );
    expect(supersededFile.status).toBe(201);

    const archiveResponse = await invokeV2Api(
      `/api/v2/projects/${project.id}/records/${record.id}/archive`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(archiveResponse.status).toBe(200);

    expect(
      (
        await upload(
          project.id,
          record.id,
          draft.id,
          fileFormData("after archive"),
        )
      ).status,
    ).toBe(409);

    const listAfterArchive = await invokeV2Api(
      filesPath(project.id, record.id, draft.id),
      request("admin"),
      dependencies(),
    );
    expect(listAfterArchive.status).toBe(200);
    expect((await jsonData<ApiFile[]>(listAfterArchive)).length).toBe(3);
  });

  it("authorizes uploads for org_admin, document_control_admin, and an assigned project manager only", async () => {
    const project = await createProject("P-FILES-5");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    await assignProjectMember(project.id, "user-manager", "project_manager");
    await assignProjectMember(project.id, "user-contributor", "contributor");
    await assignProjectMember(project.id, "user-viewer", "viewer");

    expect(
      (
        await upload(
          project.id,
          record.id,
          revision.id,
          fileFormData("a"),
          "documentControl",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await upload(
          project.id,
          record.id,
          revision.id,
          fileFormData("b"),
          "manager",
        )
      ).status,
    ).toBe(201);
    // A project_manager with no membership on this project can't even see
    // it, matching established project-visibility behavior -- not-found,
    // not merely forbidden.
    expect(
      (
        await upload(
          project.id,
          record.id,
          revision.id,
          fileFormData("c"),
          "unassignedManager",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await upload(
          project.id,
          record.id,
          revision.id,
          fileFormData("d"),
          "contributor",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await upload(
          project.id,
          record.id,
          revision.id,
          fileFormData("e"),
          "viewer",
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await invokeV2Api(
          filesPath(project.id, record.id, revision.id),
          request("contributor"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await invokeV2Api(
          filesPath(project.id, record.id, revision.id),
          request("viewer"),
          dependencies(),
        )
      ).status,
    ).toBe(200);
  });

  it("keeps tenant, project, record, revision, and file URL isolation", async () => {
    const project = await createProject("P-FILES-6");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const file = await jsonData<ApiFile>(
      await upload(project.id, record.id, revision.id, fileFormData("x")),
    );
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-files-b', 'org-b', 'P-FILES-B', 'Other', 'planning', 'America/New_York', ?, ?)",
        )
        .bind(now, now),
      testDatabase()
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, title, status, created_by, created_at, updated_at) VALUES ('record-files-b', 'org-b', 'project-files-b', 'document', 'Other', 'active', 'user-org-b', ?, ?)",
        )
        .bind(now, now),
    ]);

    expect(
      (
        await invokeV2Api(
          filesPath("project-files-b", "record-files-b", revision.id),
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          filesPath(`not-${project.id}`, record.id, revision.id),
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          filesPath(project.id, `not-${record.id}`, revision.id),
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          filesPath(project.id, record.id, `not-${revision.id}`, `/${file.id}`),
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await invokeV2Api(
          filesPath(project.id, record.id, revision.id, "/not-a-real-file"),
          request("admin"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
  });

  it("never exposes the storage key in any JSON response", async () => {
    const project = await createProject("P-FILES-7");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const uploadResponse = await upload(
      project.id,
      record.id,
      revision.id,
      fileFormData("secret bytes"),
    );
    const uploadText = await uploadResponse.clone().text();
    expect(uploadText).not.toContain("storageKey");
    expect(uploadText).not.toContain("organizations/org-a/projects");

    const file = await jsonData<ApiFile>(uploadResponse);
    const listResponse = await invokeV2Api(
      filesPath(project.id, record.id, revision.id),
      request("admin"),
      dependencies(),
    );
    expect(await listResponse.text()).not.toContain("storageKey");

    const detailResponse = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}`),
      request("admin"),
      dependencies(),
    );
    expect(await detailResponse.text()).not.toContain("storageKey");
  });

  it("creates no D1 row or activity event when the R2 write fails", async () => {
    const project = await createProject("P-FILES-8");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const storage = new ControllableFileStorage();
    storage.failPut = true;

    const response = await upload(
      project.id,
      record.id,
      revision.id,
      fileFormData("will not be stored"),
      "admin",
      storage,
    );
    expect(response.status).toBe(502);
    expect((await jsonError(response)).code).toBe("FILE_STORAGE_UNAVAILABLE");

    const rows = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?",
      )
      .bind(revision.id)
      .first<{ count: number }>();
    expect(rows?.count).toBe(0);
    const events = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'file.uploaded'",
      )
      .first<{ count: number }>();
    expect(events?.count).toBe(0);
  });

  it("deletes the R2 object when the D1 file insert fails after a successful R2 write", async () => {
    const project = await createProject("P-FILES-9");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const database = testDatabase();

    await database
      .prepare(
        "CREATE TRIGGER fail_file_insert BEFORE INSERT ON revision_files BEGIN SELECT RAISE(ABORT, 'forced file insert failure'); END",
      )
      .run();
    const storage = new ControllableFileStorage();
    try {
      const response = await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData("orphan candidate"),
        "admin",
        storage,
      );
      expect(response.status).toBe(500);
      expect((await jsonError(response)).code).toBe("FILE_UPLOAD_FAILED");
    } finally {
      await database.prepare("DROP TRIGGER IF EXISTS fail_file_insert").run();
    }

    const rows = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?",
      )
      .bind(revision.id)
      .first<{ count: number }>();
    expect(rows?.count).toBe(0);
  });

  it("rolls back the D1 file row and deletes the R2 object when the activity event insert fails", async () => {
    const project = await createProject("P-FILES-10");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const database = testDatabase();

    await database
      .prepare(
        "CREATE TRIGGER fail_file_activity BEFORE INSERT ON activity_events WHEN NEW.action = 'file.uploaded' BEGIN SELECT RAISE(ABORT, 'forced file activity failure'); END",
      )
      .run();
    const storage = new ControllableFileStorage();
    try {
      const response = await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData("orphan candidate two"),
        "admin",
        storage,
      );
      expect(response.status).toBe(500);
      expect((await jsonError(response)).code).toBe("FILE_UPLOAD_FAILED");
    } finally {
      await database.prepare("DROP TRIGGER IF EXISTS fail_file_activity").run();
    }

    const rows = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?",
      )
      .bind(revision.id)
      .first<{ count: number }>();
    expect(rows?.count).toBe(0);
  });

  it("surfaces compensation failure accurately when the R2 delete also fails", async () => {
    const project = await createProject("P-FILES-11");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const database = testDatabase();

    await database
      .prepare(
        "CREATE TRIGGER fail_file_insert_2 BEFORE INSERT ON revision_files BEGIN SELECT RAISE(ABORT, 'forced file insert failure'); END",
      )
      .run();
    const storage = new ControllableFileStorage();
    storage.failDelete = true;
    try {
      const response = await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData("undeletable orphan"),
        "admin",
        storage,
      );
      expect(response.status).toBe(500);
      const error = await jsonError(response);
      expect(error.code).toBe("FILE_UPLOAD_FAILED");
      expect(error.message).toMatch(/could not be removed/);
    } finally {
      await database.prepare("DROP TRIGGER IF EXISTS fail_file_insert_2").run();
    }

    const rows = await database
      .prepare(
        "SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?",
      )
      .bind(revision.id)
      .first<{ count: number }>();
    expect(rows?.count).toBe(0);
  });

  it("returns an internal consistency error rather than 404 when the R2 object is missing for existing D1 metadata", async () => {
    const project = await createProject("P-FILES-12");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const file = await jsonData<ApiFile>(
      await upload(project.id, record.id, revision.id, fileFormData("x")),
    );

    const storageKeyRow = await testDatabase()
      .prepare("SELECT storage_key FROM revision_files WHERE id = ?")
      .bind(file.id)
      .first<{ storage_key: string }>();
    if (!storageKeyRow) throw new Error("Expected a persisted file row.");
    await env.FILES.delete(storageKeyRow.storage_key);

    const response = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}/content`),
      request("admin"),
      dependencies(),
    );
    expect(response.status).toBe(500);
    expect((await jsonError(response)).code).toBe("FILE_OBJECT_MISSING");
  });

  it("refuses to overwrite an existing R2 object and preserves the original bytes", async () => {
    const storage = new R2FileStorage(env.FILES);
    const key = `test-overwrite/${crypto.randomUUID()}`;
    const first = new TextEncoder().encode("original bytes");
    const second = new TextEncoder().encode(
      "REPLACEMENT bytes, different length",
    );
    const metadata = (sha256: string): FileObjectMetadata => ({
      contentType: "application/octet-stream",
      originalFilename: "f.bin",
      organizationId: "org-a",
      projectId: "project",
      recordId: "record",
      revisionId: "revision",
      fileId: "file",
      sha256,
    });

    await expect(
      storage.put(key, first.buffer, metadata(await sha256Hex(first.buffer))),
    ).resolves.toBeUndefined();
    await expect(
      storage.put(key, second.buffer, metadata(await sha256Hex(second.buffer))),
    ).rejects.toThrow();

    const object = await storage.get(key);
    if (!object) throw new Error("Expected the original object to remain.");
    const stored = new Uint8Array(
      await new Response(object.body).arrayBuffer(),
    );
    expect(new TextDecoder().decode(stored)).toBe("original bytes");
    await env.FILES.delete(key);
  });

  it("creates no additional D1 row, event, or object bytes when the conditional put collides", async () => {
    const project = await createProject("P-FILES-13");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const storage = new CollidingFileStorage();

    const firstResponse = await upload(
      project.id,
      record.id,
      revision.id,
      fileFormData("first upload content"),
      "admin",
      storage,
    );
    expect(firstResponse.status).toBe(201);

    const secondResponse = await upload(
      project.id,
      record.id,
      revision.id,
      fileFormData("second upload content that must not overwrite"),
      "admin",
      storage,
    );
    expect(secondResponse.status).toBe(502);
    expect((await jsonError(secondResponse)).code).toBe(
      "FILE_STORAGE_UNAVAILABLE",
    );

    const rows = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?",
      )
      .bind(revision.id)
      .first<{ count: number }>();
    expect(rows?.count).toBe(1);
    const events = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE action = 'file.uploaded'",
      )
      .first<{ count: number }>();
    expect(events?.count).toBe(1);

    const collidedKey = storage.collidedKey;
    if (!collidedKey)
      throw new Error("Expected the first put to record a key.");
    const object = await env.FILES.get(collidedKey);
    if (!object) throw new Error("Expected the first object to remain.");
    const stored = await object.text();
    expect(stored).toBe("first upload content");
    await env.FILES.delete(collidedKey);
  });

  it("returns an integrity error rather than streaming when the stored object size disagrees with the metadata", async () => {
    const project = await createProject("P-FILES-14");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const bytes = new TextEncoder().encode("abcd");
    const file = await jsonData<ApiFile>(
      await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData(bytes, "doc.pdf", "application/pdf"),
      ),
    );

    const mismatched = new StubGetFileStorage(
      file.byteSize + 100,
      "application/pdf",
    );
    const response = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}/content`),
      request("admin"),
      dependencies(mismatched),
    );
    expect(response.status).toBe(500);
    expect((await jsonError(response)).code).toBe("FILE_OBJECT_INTEGRITY");
  });

  it("sets Content-Type from the persisted metadata, not from the stored R2 object", async () => {
    const project = await createProject("P-FILES-15");
    const record = await createRecord(project.id);
    const revision = await createDraft(project.id, record.id);
    const bytes = new TextEncoder().encode("abcd");
    const file = await jsonData<ApiFile>(
      await upload(
        project.id,
        record.id,
        revision.id,
        fileFormData(bytes, "doc.pdf", "application/pdf"),
      ),
    );

    const wrongType = new StubGetFileStorage(file.byteSize, "text/html");
    const response = await invokeV2Api(
      filesPath(project.id, record.id, revision.id, `/${file.id}/content`),
      request("admin"),
      dependencies(wrongType),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });
});
