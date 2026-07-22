import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { ProjectRfisReadModelService } from "../../src/application/read-models/project-rfis-service";
import { RfiWorkspaceReadModelService } from "../../src/application/read-models/rfi-workspace-service";
import { RfiAttachmentService } from "../../src/application/rfis/rfi-attachment-service";
import { RfiService } from "../../src/application/rfis/rfi-service";
import { RfiTemplateBindingService } from "../../src/application/rfis/rfi-template-binding-service";
import type {
  FileObjectMetadata,
  FileStoragePort,
  StoredFileObject,
} from "../../src/application/files/file-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectRfisReadRepository } from "../../src/infrastructure/db/d1/project-rfis-read-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RfiAttachmentsRepository } from "../../src/infrastructure/db/d1/rfi-attachments-repository";
import { D1RfiNumberSequencesRepository } from "../../src/infrastructure/db/d1/rfi-number-sequences-repository";
import { D1RfiRecordsRepository } from "../../src/infrastructure/db/d1/rfi-records-repository";
import { D1RfiResponsesRepository } from "../../src/infrastructure/db/d1/rfi-responses-repository";
import { D1RfiWorkspaceReadRepository } from "../../src/infrastructure/db/d1/rfi-workspace-read-repository";
import { D1TemplatesRepository } from "../../src/infrastructure/db/d1/templates-repository";
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

// In-memory storage fake shared across a test's requests so an uploaded
// attachment can be downloaded again.
class FakeStorage implements FileStoragePort {
  private readonly objects = new Map<
    string,
    { content: ArrayBuffer; contentType: string }
  >();

  reset(): void {
    this.objects.clear();
  }

  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void> {
    if (this.objects.has(key)) {
      return Promise.reject(new Error("object exists"));
    }
    this.objects.set(key, { content, contentType: metadata.contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<StoredFileObject | null> {
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      body: new Response(object.content).body as ReadableStream,
      size: object.content.byteLength,
      httpEtag: `"${key}"`,
      contentType: object.contentType,
    });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

const storage = new FakeStorage();

function dependencies(): V2RouteDependencies {
  const database = testDatabase();
  const projects = new ProjectService(
    new D1ProjectsRepository(database),
    new D1ProjectMembershipsRepository(database),
  );
  const responses = new D1RfiResponsesRepository(database);
  const attachmentsRepo = new D1RfiAttachmentsRepository(database);
  const records = new D1RfiRecordsRepository(
    database,
    new D1RfiNumberSequencesRepository(database),
    responses,
  );
  const templateBinding = new RfiTemplateBindingService(
    new D1TemplatesRepository(database),
  );
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    rfis: new RfiService(
      projects,
      records,
      responses,
      attachmentsRepo,
      templateBinding,
    ),
    rfiAttachments: new RfiAttachmentService(
      projects,
      records,
      attachmentsRepo,
      storage,
    ),
    projectRfis: new ProjectRfisReadModelService(
      projects,
      new D1ProjectRfisReadRepository(database),
    ),
    rfiWorkspace: new RfiWorkspaceReadModelService(
      projects,
      records,
      attachmentsRepo,
      responses,
      new D1RfiWorkspaceReadRepository(database),
      templateBinding,
    ),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
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

async function seed(): Promise<void> {
  const database = testDatabase();
  const now = new Date().toISOString();
  const seededSessions = Object.entries(sessions).filter(
    (entry): entry is [string, AppSession] => entry[1] !== undefined,
  );
  await database.batch([
    database
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'active', '{}', ?, ?)",
      )
      .bind("org-a", "Organization A", "organization-a", now, now),
    database
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES (?, ?, ?, 'active', '{}', ?, ?)",
      )
      .bind("org-b", "Organization B", "organization-b", now, now),
    ...seededSessions.map(([name, session]) =>
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
    ),
    ...seededSessions.map(([, session]) =>
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
    ),
    // A member of org-b so the b-tenant template can be seeded/owned if needed.
    database
      .prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-b', 'identity|b', 'b@example.test', 'B User', 'active', ?, ?)",
      )
      .bind(now, now),
    database
      .prepare(
        "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES ('membership-b', 'org-b', 'user-b', 'org_admin', 'active', ?)",
      )
      .bind(now),
  ]);
}

interface ApiProject {
  id: string;
  projectNumber: string;
}
interface ApiRfi {
  id: string;
  rfiNumber: string | null;
  status: string;
  subject: string;
  templateVersionId: string | null;
  lockVersion: number;
}

interface RfiRowLite {
  id: string;
  rfiNumber: string | null;
  subject: string;
  lockVersion: number;
  capabilities: { updateDraft: boolean };
}
interface ListModel {
  project: { projectNumber: string; name: string };
  rfis: RfiRowLite[];
  capabilities: { createRfi: boolean };
}
interface WorkspaceModel {
  rfi: {
    status: string;
    rfiNumber: string | null;
    subject: string;
    drawingReferences: string | null;
  };
  project: { name: string; projectNumber: string };
  organization: { name: string | null };
  template: { key: string; name: string; definition: { kind: string } } | null;
  attachments: {
    supporting_attachment: unknown[];
    reference_drawing: unknown[];
  };
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
  const body: { data: ApiProject } = await response.json();
  return body.data;
}

async function createDraft(
  projectId: string,
  subject = "Clarify footing detail",
): Promise<ApiRfi> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/rfis`,
    request("admin", "POST", {
      subject,
      question: "Please confirm the required footing detail.",
      contractorSuggestion: "Use detail S-4.",
      responsibleParty: "Architect",
      requestedResponseDate: "2026-08-01",
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  const body: { data: ApiRfi } = await response.json();
  return body.data;
}

async function issue(projectId: string, rfiId: string): Promise<Response> {
  return invokeV2Api(
    `/api/v2/projects/${projectId}/rfis/${rfiId}/issue`,
    request("admin", "POST"),
    dependencies(),
  );
}

function patch(
  projectId: string,
  rfiId: string,
  body: unknown,
  session = "admin",
): Promise<Response> {
  return invokeV2Api(
    `/api/v2/projects/${projectId}/rfis/${rfiId}`,
    request(session, "PATCH", body),
    dependencies(),
  );
}

async function workspace(
  projectId: string,
  rfiId: string,
  session = "admin",
): Promise<WorkspaceModel> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/rfis/${rfiId}/workspace`,
    request(session),
    dependencies(),
  );
  const body = await readJson<{ data: WorkspaceModel }>(response);
  return body.data;
}

describe("RFI register & workspace (Slice 1)", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    storage.reset();
    await seed();
  });

  it("applies migration 0013 (schema version 11)", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(11);
  });

  it("creates an unnumbered draft bound to the default BASE RFI template", async () => {
    const project = await createProject("P-RFI-1");
    const draft = await createDraft(project.id);
    expect(draft).toMatchObject({ status: "draft", rfiNumber: null });
    expect(draft.templateVersionId).toBeTruthy();

    const template = await testDatabase()
      .prepare(
        "SELECT key, kind FROM templates WHERE organization_id = 'org-a'",
      )
      .first<{ key: string; kind: string }>();
    expect(template).toEqual({ key: "base-rfi", kind: "form" });

    const model = await workspace(project.id, draft.id);
    expect(model.template?.key).toBe("base-rfi");
    expect(typeof model.template?.name).toBe("string");
    expect(model.template?.definition.kind).toBe("form");
    expect(model.rfi.rfiNumber).toBeNull();
  });

  it("returns one register read model with rows and capabilities", async () => {
    const project = await createProject("P-RFI-2");
    await createDraft(project.id, "First");
    await createDraft(project.id, "Second");
    const response = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis`,
      request("admin"),
      dependencies(),
    );
    expect(response.status).toBe(200);
    const body = await readJson<{ data: ListModel }>(response);
    expect(body.data.rfis).toHaveLength(2);
    expect(body.data.capabilities.createRfi).toBe(true);
    expect(body.data.project.projectNumber).toBe("P-RFI-2");
    for (const row of body.data.rfis) {
      expect(row.rfiNumber).toBeNull();
      expect(typeof row.lockVersion).toBe("number");
      expect(row.capabilities.updateDraft).toBe(true);
    }
  });

  it("isolates the register across organizations and projects", async () => {
    const projectA = await createProject("P-RFI-3A");
    const projectB = await createProject("P-RFI-3B");
    await createDraft(projectA.id, "A only");
    const now = new Date().toISOString();
    // Cross-tenant project + RFI in org-b.
    await testDatabase()
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-b', 'org-b', 'P-B', 'Other', 'planning', 'America/New_York', ?, ?)",
      )
      .bind(now, now)
      .run();

    // Project isolation: projectB has no RFIs even though projectA does.
    const other = await invokeV2Api(
      `/api/v2/projects/${projectB.id}/rfis`,
      request("admin"),
      dependencies(),
    );
    const otherBody = await readJson<{ data: ListModel }>(other);
    expect(otherBody.data.rfis).toHaveLength(0);

    // Organization isolation: org-a admin cannot see org-b's project at all.
    const crossTenant = await invokeV2Api(
      "/api/v2/projects/project-b/rfis",
      request("admin"),
      dependencies(),
    );
    expect(crossTenant.status).toBe(404);
  });

  it("populates project + organization context from the project record, not the RFI", async () => {
    const project = await createProject("P-RFI-CTX");
    const draft = await createDraft(project.id);
    const model = await workspace(project.id, draft.id);
    expect(model.project.name).toBe("Project P-RFI-CTX");
    expect(model.project.projectNumber).toBe("P-RFI-CTX");
    expect(model.organization.name).toBe("Organization A");
  });

  it("edits short draft fields inline and keeps official number null", async () => {
    const project = await createProject("P-RFI-4");
    const draft = await createDraft(project.id);

    const subjectPatch = await patch(project.id, draft.id, {
      subject: "Revised footing",
      lockVersion: draft.lockVersion,
    });
    expect(subjectPatch.status).toBe(200);
    const afterSubject: { data: ApiRfi } = await subjectPatch.json();
    expect(afterSubject.data.subject).toBe("Revised footing");
    expect(afterSubject.data.rfiNumber).toBeNull();
    expect(afterSubject.data.lockVersion).toBe(draft.lockVersion + 1);

    const responsiblePatch = await patch(project.id, draft.id, {
      responsibleParty: "Structural Engineer",
      lockVersion: afterSubject.data.lockVersion,
    });
    expect(responsiblePatch.status).toBe(200);
    const afterResp: { data: ApiRfi & { responsibleParty: string } } =
      await responsiblePatch.json();
    expect(afterResp.data.responsibleParty).toBe("Structural Engineer");

    const datePatch = await patch(project.id, draft.id, {
      requestedResponseDate: "2026-09-15",
      lockVersion: afterResp.data.lockVersion,
    });
    expect(datePatch.status).toBe(200);
    const afterDate: { data: { requestedResponseDate: string } } =
      await datePatch.json();
    expect(afterDate.data.requestedResponseDate).toBe("2026-09-15");
  });

  it("edits full draft fields and reload retains them (table and detail share data)", async () => {
    const project = await createProject("P-RFI-FULL");
    const draft = await createDraft(project.id);
    const update = await patch(project.id, draft.id, {
      subject: "Full edit subject",
      question: "Full edit question?",
      contractorSuggestion: "Suggested approach",
      drawingReferences: "A-101, A-102",
      specificationReferences: "03 30 00",
      lockVersion: draft.lockVersion,
    });
    expect(update.status).toBe(200);

    const model = await workspace(project.id, draft.id);
    expect(model.rfi.subject).toBe("Full edit subject");
    expect(model.rfi.drawingReferences).toBe("A-101, A-102");

    const list = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis`,
      request("admin"),
      dependencies(),
    );
    const listBody = await readJson<{ data: ListModel }>(list);
    expect(listBody.data.rfis[0].subject).toBe("Full edit subject");
  });

  it("rejects a stale optimistic-concurrency update with 409", async () => {
    const project = await createProject("P-RFI-LOCK");
    const draft = await createDraft(project.id);
    const first = await patch(project.id, draft.id, {
      subject: "Winner",
      lockVersion: draft.lockVersion,
    });
    expect(first.status).toBe(200);
    const stale = await patch(project.id, draft.id, {
      subject: "Loser",
      lockVersion: draft.lockVersion,
    });
    expect(stale.status).toBe(409);
    const body = await readJson<{ error: { code: string } }>(stale);
    expect(body.error.code).toBe("RFI_VERSION_CONFLICT");
  });

  it("cannot arbitrarily patch status", async () => {
    const project = await createProject("P-RFI-STATUS");
    const draft = await createDraft(project.id);
    const attempt = await patch(project.id, draft.id, {
      status: "open",
      lockVersion: draft.lockVersion,
    });
    // The status field is ignored; only whitelisted draft fields update.
    expect(attempt.status).toBe(200);
    const model = await workspace(project.id, draft.id);
    expect(model.rfi.status).toBe("draft");
  });

  it("records granular activity for creation and field edits", async () => {
    const project = await createProject("P-RFI-ACT");
    const draft = await createDraft(project.id);
    await patch(project.id, draft.id, {
      subject: "Edited",
      lockVersion: draft.lockVersion,
    });
    const events = await testDatabase()
      .prepare(
        "SELECT action, metadata_json FROM activity_events WHERE object_id = ? ORDER BY created_at ASC",
      )
      .bind(draft.id)
      .all<{ action: string; metadata_json: string }>();
    const actions = events.results.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(["rfi.created", "rfi.updated"]),
    );
    const updated = events.results.find((e) => e.action === "rfi.updated");
    expect(updated).toBeDefined();
    const meta: unknown = JSON.parse(updated?.metadata_json ?? "{}");
    const changed = (meta as { changedFields?: string[] }).changedFields ?? [];
    expect(changed).toContain("subject");
  });

  it("associates supporting attachments with an explicit role and the exact RFI", async () => {
    const project = await createProject("P-RFI-ATT");
    const draft = await createDraft(project.id);
    const form = new FormData();
    form.append("role", "reference_drawing");
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3, 4])], "detail.pdf", {
        type: "application/pdf",
      }),
    );
    const upload = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/attachments`,
      { method: "POST", headers: { "x-test-session": "admin" }, body: form },
      dependencies(),
    );
    expect(upload.status).toBe(201);
    const uploaded: { data: { id: string; role: string } } =
      await upload.json();
    expect(uploaded.data.role).toBe("reference_drawing");

    const model = await workspace(project.id, draft.id);
    expect(model.attachments.reference_drawing).toHaveLength(1);
    expect(model.attachments.supporting_attachment).toHaveLength(0);

    // The content is downloadable and associated with this exact RFI.
    const download = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/attachments/${uploaded.data.id}/content`,
      request("admin"),
      dependencies(),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");

    const activity = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM activity_events WHERE object_id = ? AND action = 'rfi.attachment_added'",
      )
      .bind(draft.id)
      .first<{ count: number }>();
    expect(activity?.count).toBe(1);
  });

  it("rejects attachments once the RFI leaves the draft/ready context", async () => {
    const project = await createProject("P-RFI-ATT2");
    const draft = await createDraft(project.id);
    await issue(project.id, draft.id);
    const form = new FormData();
    form.append("role", "supporting_attachment");
    form.append(
      "file",
      new File([new Uint8Array([9])], "late.pdf", { type: "application/pdf" }),
    );
    const upload = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/attachments`,
      { method: "POST", headers: { "x-test-session": "admin" }, body: form },
      dependencies(),
    );
    expect(upload.status).toBe(409);
  });

  it("denies draft edits from non-managers and enforces tenancy", async () => {
    const project = await createProject("P-RFI-DENY");
    const draft = await createDraft(project.id);
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-contributor', 'contributor', 'active', ?)",
      )
      .bind("member-contributor", project.id, now)
      .run();
    const denied = await patch(
      project.id,
      draft.id,
      { subject: "Nope", lockVersion: draft.lockVersion },
      "contributor",
    );
    expect(denied.status).toBe(403);

    // A cross-tenant RFI id is a generic not-found.
    const crossTenant = await invokeV2Api(
      "/api/v2/projects/project-b/rfis/whatever/workspace",
      request("admin"),
      dependencies(),
    );
    expect(crossTenant.status).toBe(404);
  });

  it("issues permanently numbered RFIs (draft → open) and blocks post-issue edits", async () => {
    const project = await createProject("P-RFI-ISSUE");
    const draft = await createDraft(project.id);
    const issued = await issue(project.id, draft.id);
    expect(issued.status).toBe(200);
    await expect(issued.json()).resolves.toMatchObject({
      data: { status: "open", rfiNumber: "RFI-001" },
    });
    const again = await issue(project.id, draft.id);
    expect(again.status).toBe(409);
    const edit = await patch(project.id, draft.id, {
      subject: "No longer editable",
      lockVersion: draft.lockVersion,
    });
    expect(edit.status).toBe(409);
  });

  it("uses project-scoped, concurrent-safe issue numbering", async () => {
    const first = await createProject("P-RFI-SEQ-A");
    const second = await createProject("P-RFI-SEQ-B");
    const a1 = await createDraft(first.id, "First");
    const a2 = await createDraft(first.id, "Second");
    const b1 = await createDraft(second.id, "Other");
    const issued = await Promise.all([
      issue(first.id, a1.id),
      issue(first.id, a2.id),
      issue(second.id, b1.id),
    ]);
    const payloads: { data: { rfiNumber: string } }[] = await Promise.all(
      issued.map((response) =>
        readJson<{ data: { rfiNumber: string } }>(response),
      ),
    );
    expect(
      payloads
        .slice(0, 2)
        .map((payload) => payload.data.rfiNumber)
        .sort(),
    ).toEqual(["RFI-001", "RFI-002"]);
    expect(payloads[2].data.rfiNumber).toBe("RFI-001");
  });

  it("responds, closes, reopens with binding states and required activity", async () => {
    const project = await createProject("P-RFI-RESP");
    const draft = await createDraft(project.id);
    await issue(project.id, draft.id);
    const response = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/respond`,
      request("admin", "POST", {
        response: "Use detail S-4 as suggested.",
        respondedBy: "Architect",
      }),
      dependencies(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "response_received",
        response: { response: "Use detail S-4 as suggested." },
      },
    });
    const closed = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/close`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(closed.status).toBe(200);
    await expect(closed.json()).resolves.toMatchObject({
      data: { status: "closed" },
    });
    const reopened = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/reopen`,
      request("admin", "POST"),
      dependencies(),
    );
    await expect(reopened.json()).resolves.toMatchObject({
      data: { status: "open" },
    });
    const events = await testDatabase()
      .prepare(
        "SELECT action FROM activity_events WHERE object_id = ? ORDER BY created_at ASC",
      )
      .bind(draft.id)
      .all<{ action: string }>();
    expect(events.results.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "rfi.created",
        "rfi.issued",
        "rfi.responded",
        "rfi.closed",
        "rfi.reopened",
      ]),
    );
  });

  it("rolls back a response and its transition when the activity event fails", async () => {
    const project = await createProject("P-RFI-AUDIT");
    const draft = await createDraft(project.id);
    await issue(project.id, draft.id);
    const database = testDatabase();
    await database
      .prepare(
        `CREATE TRIGGER fail_rfi_responded_activity
         BEFORE INSERT ON activity_events
         WHEN NEW.action = 'rfi.responded'
         BEGIN SELECT RAISE(ABORT, 'forced RFI audit failure'); END`,
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/rfis/${draft.id}/respond`,
          request("admin", "POST", { response: "This must roll back." }),
          dependencies(),
        ),
      ).rejects.toThrow(/forced RFI audit failure/);
      const rfi = await database
        .prepare(
          "SELECT status, response_received_at FROM rfi_records WHERE id = ?",
        )
        .bind(draft.id)
        .first<{ status: string; response_received_at: string | null }>();
      expect(rfi).toEqual({ status: "open", response_received_at: null });
      const responses = await database
        .prepare("SELECT COUNT(*) AS count FROM rfi_responses WHERE rfi_id = ?")
        .bind(draft.id)
        .first<{ count: number }>();
      expect(responses?.count).toBe(0);
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_rfi_responded_activity")
        .run();
    }
  });

  it("rejects responses and closure before their required prior transitions", async () => {
    const project = await createProject("P-RFI-EARLY");
    const draft = await createDraft(project.id);
    const response = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/respond`,
      request("admin", "POST", { response: "Too early" }),
      dependencies(),
    );
    expect(response.status).toBe(409);
    const close = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/close`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(close.status).toBe(409);
  });

  it("enforces project-role authorization for create and issue", async () => {
    const project = await createProject("P-RFI-ROLE");
    const draft = await createDraft(project.id);
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-contributor', 'contributor', 'active', ?)",
      )
      .bind("member-contributor", project.id, now)
      .run();
    const contributorDenied = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis`,
      request("contributor", "POST", { subject: "Denied", question: "Denied" }),
      dependencies(),
    );
    expect(contributorDenied.status).toBe(403);

    const viewerDenied = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/issue`,
      request("viewer", "POST"),
      dependencies(),
    );
    expect(viewerDenied.status).toBe(404);

    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-manager', 'project_manager', 'active', ?)",
      )
      .bind("member-manager", project.id, now)
      .run();
    const managerAllowed = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/issue`,
      request("manager", "POST"),
      dependencies(),
    );
    expect(managerAllowed.status).toBe(200);
  });
});
