import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { ProjectRfisReadModelService } from "../../src/application/read-models/project-rfis-service";
import { RfiWorkspaceReadModelService } from "../../src/application/read-models/rfi-workspace-service";
import { RfiAttachmentService } from "../../src/application/rfis/rfi-attachment-service";
import { RfiService } from "../../src/application/rfis/rfi-service";
import { RfiOfficialIssueService } from "../../src/application/rfis/rfi-official-issue-service";
import type {
  RenderedRfiArtifact,
  RfiArtifactRenderer,
} from "../../src/application/rfis/rfi-artifact-renderer";
import type { FrozenRfiRenderPayload } from "../../src/domain/rfis/official-issue";
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
import { D1ProjectContactsRepository } from "../../src/infrastructure/db/d1/project-contacts-repository";
import { D1ProjectRfisReadRepository } from "../../src/infrastructure/db/d1/project-rfis-read-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RfiAttachmentsRepository } from "../../src/infrastructure/db/d1/rfi-attachments-repository";
import { D1RfiRecordsRepository } from "../../src/infrastructure/db/d1/rfi-records-repository";
import { D1RfiResponsesRepository } from "../../src/infrastructure/db/d1/rfi-responses-repository";
import { D1RfiWorkspaceReadRepository } from "../../src/infrastructure/db/d1/rfi-workspace-read-repository";
import { D1RfiOfficialIssueRepository } from "../../src/infrastructure/db/d1/rfi-official-issue-repository";
import type {
  CommitRfiOfficialIssueInput,
  RfiOfficialCommitState,
} from "../../src/infrastructure/db/d1/rfi-official-issue-repository";
import { D1RecordRevisionsRepository } from "../../src/infrastructure/db/d1/record-revisions-repository";
import { D1RecordRevisionSequencesRepository } from "../../src/infrastructure/db/d1/record-revision-sequences-repository";
import { D1UsersRepository } from "../../src/infrastructure/db/d1/users-repository";
import { D1TemplatesRepository } from "../../src/infrastructure/db/d1/templates-repository";
import { RfiPdfArtifactRenderer } from "../../src/infrastructure/rendering/rfi-pdf-artifact-renderer";
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
    { content: ArrayBuffer; contentType: string; sha256: string }
  >();
  failPut = false;
  failHead = false;
  failDelete = false;
  corruptHead = false;
  readonly omitShaKeys = new Set<string>();
  readonly wrongShaKeys = new Set<string>();

  reset(): void {
    this.objects.clear();
    this.failPut = false;
    this.failHead = false;
    this.failDelete = false;
    this.corruptHead = false;
    this.omitShaKeys.clear();
    this.wrongShaKeys.clear();
  }

  get objectCount(): number {
    return this.objects.size;
  }

  bytes(key: string): ArrayBuffer | null {
    return this.objects.get(key)?.content ?? null;
  }

  put(
    key: string,
    content: ArrayBuffer,
    metadata: FileObjectMetadata,
  ): Promise<void> {
    if (this.failPut) return Promise.reject(new Error("forced R2 put failure"));
    if (this.objects.has(key)) {
      return Promise.reject(new Error("object exists"));
    }
    this.objects.set(key, {
      content,
      contentType: metadata.contentType,
      sha256: metadata.sha256,
    });
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
    if (this.failDelete) {
      return Promise.reject(new Error("forced R2 delete failure"));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }

  head(key: string): Promise<{ size: number; sha256?: string } | null> {
    if (this.failHead) {
      return Promise.reject(new Error("forced R2 head failure"));
    }
    const object = this.objects.get(key);
    return Promise.resolve(
      object
        ? {
            size: object.content.byteLength + (this.corruptHead ? 1 : 0),
            ...(this.omitShaKeys.has(key)
              ? {}
              : {
                  sha256: this.wrongShaKeys.has(key)
                    ? "0".repeat(64)
                    : object.sha256,
                }),
          }
        : null,
    );
  }
}

const storage = new FakeStorage();
class TestRenderer implements RfiArtifactRenderer {
  private readonly delegate = new RfiPdfArtifactRenderer();
  fail = false;
  versionOverride: string | null = null;

  get rendererVersion(): string {
    return this.versionOverride ?? this.delegate.rendererVersion;
  }

  reset(): void {
    this.fail = false;
    this.versionOverride = null;
  }

  render(payload: FrozenRfiRenderPayload): Promise<RenderedRfiArtifact> {
    if (this.fail) return Promise.reject(new Error("forced render failure"));
    return this.delegate.render(payload);
  }
}
const renderer = new TestRenderer();

const issueRepositoryControls = {
  failBeforeCommit: false,
  failAfterCommit: false,
  failInspection: false,
};

class TestOfficialIssueRepository extends D1RfiOfficialIssueRepository {
  override async commit(input: CommitRfiOfficialIssueInput): Promise<void> {
    if (issueRepositoryControls.failBeforeCommit) {
      throw new Error("forced pre-commit failure");
    }
    await super.commit(input);
    if (issueRepositoryControls.failAfterCommit) {
      throw new Error("forced ambiguous response after committed batch");
    }
  }

  override async inspectCommitState(
    input: CommitRfiOfficialIssueInput,
  ): Promise<RfiOfficialCommitState> {
    if (issueRepositoryControls.failInspection) {
      throw new Error("forced authoritative inspection failure");
    }
    return super.inspectCommitState(input);
  }
}

function dependencies(): V2RouteDependencies {
  const database = testDatabase();
  const projects = new ProjectService(
    new D1ProjectsRepository(database),
    new D1ProjectMembershipsRepository(database),
  );
  const responses = new D1RfiResponsesRepository(database);
  const attachmentsRepo = new D1RfiAttachmentsRepository(database);
  const records = new D1RfiRecordsRepository(database, responses);
  const officialIssues = new TestOfficialIssueRepository(database);
  const templateBinding = new RfiTemplateBindingService(
    new D1TemplatesRepository(database),
  );
  const revisions = new D1RecordRevisionsRepository(
    database,
    new D1RecordRevisionSequencesRepository(database),
  );
  const officialIssuer = new RfiOfficialIssueService(
    projects,
    records,
    revisions,
    attachmentsRepo,
    new D1ProjectContactsRepository(database),
    templateBinding,
    new D1UsersRepository(database),
    officialIssues,
    storage,
    renderer,
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
      new D1ProjectContactsRepository(database),
      officialIssuer,
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
      officialIssues,
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
  responsiblePartyId?: string | null;
  responsibleParty?: string | null;
  draftRevisionId?: string;
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
  responsibleContacts: { id: string; name: string }[];
}
interface WorkspaceModel {
  rfi: {
    status: string;
    rfiNumber: string | null;
    subject: string;
    drawingReferences: string | null;
    responsiblePartyId?: string | null;
  };
  project: { name: string; projectNumber: string };
  organization: { name: string | null };
  template: { key: string; name: string; definition: { kind: string } } | null;
  attachments: {
    supporting_attachment: { revisionLabel: string }[];
    reference_drawing: { revisionLabel: string }[];
  };
  officialIssue?: {
    officialDisplayNumber: string;
    responseDueDate: string;
    issuedRevision: { userFacingVersion: string };
    officialArtifact: { fileId: string; sha256: string };
    includedFiles: { fileId: string }[];
    recipients: { to: { contactName: string }[]; cc: unknown[] };
  } | null;
  currentVersion?: { id: string; label: string; status: string };
  capabilities?: { issue: boolean; recordResponse: boolean };
}

async function createProject(number: string): Promise<ApiProject> {
  const response = await invokeV2Api(
    "/api/v2/projects",
    request("admin", "POST", {
      projectNumber: number,
      name: `Project ${number}`,
      status: "active",
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
      responsiblePartyId: null,
      requestedResponseDate: "2026-08-01",
    }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  const body: { data: ApiRfi } = await response.json();
  return body.data;
}

async function issue(
  projectId: string,
  rfiId: string,
  body: unknown = {
    recipientProjectContactIds: ["contact-recipient"],
    ccProjectContactIds: [],
    responseDueDate: "2026-08-01",
    includedFileIds: [],
    deliveryMode: "record_only",
  },
  options: { key?: string; session?: string } = {},
): Promise<Response> {
  const base = request(options.session ?? "admin", "POST", body);
  return invokeV2Api(
    `/api/v2/projects/${projectId}/rfis/${rfiId}/issue`,
    {
      ...base,
      headers: {
        ...(base.headers as Record<string, string>),
        "idempotency-key": options.key ?? "issue-key-1",
      },
    },
    dependencies(),
  );
}

async function seedProjectContact(
  projectId: string,
  id: string,
  name: string,
  archived = false,
): Promise<void> {
  const now = new Date().toISOString();
  await testDatabase()
    .prepare(
      `INSERT INTO project_contacts
        (id, organization_id, project_id, company_name, contact_name,
         contact_type, email, created_at, updated_at, archived_at)
       VALUES (?, 'org-a', ?, 'Design Co', ?, 'architect', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      name,
      `${id}@example.test`,
      now,
      now,
      archived ? now : null,
    )
    .run();
}

async function prepareIssuableRfi(
  number: string,
  options: { upload?: boolean; contactId?: string } = {},
): Promise<{
  project: ApiProject;
  draft: ApiRfi;
  fileId: string | null;
  contactId: string;
}> {
  const project = await createProject(number);
  const draft = await createDraft(project.id);
  const contactId = options.contactId ?? "contact-recipient";
  await seedProjectContact(project.id, contactId, "Project Architect");
  const assigned = await patch(project.id, draft.id, {
    responsiblePartyId: contactId,
    lockVersion: draft.lockVersion,
  });
  expect(assigned.status).toBe(200);
  const file = options.upload
    ? await uploadRfiFile(project.id, draft.id)
    : null;
  const ready = await invokeV2Api(
    `/api/v2/projects/${project.id}/rfis/${draft.id}/ready`,
    request("admin", "POST"),
    dependencies(),
  );
  expect(ready.status).toBe(200);
  return { project, draft, fileId: file?.id ?? null, contactId };
}

async function prepareRfiInProject(
  project: ApiProject,
  contactId: string,
  subject: string,
): Promise<ApiRfi> {
  const draft = await createDraft(project.id, subject);
  await seedProjectContact(project.id, contactId, `${subject} Architect`);
  const assigned = await patch(project.id, draft.id, {
    responsiblePartyId: contactId,
    lockVersion: draft.lockVersion,
  });
  expect(assigned.status).toBe(200);
  const ready = await invokeV2Api(
    `/api/v2/projects/${project.id}/rfis/${draft.id}/ready`,
    request("admin", "POST"),
    dependencies(),
  );
  expect(ready.status).toBe(200);
  return draft;
}

function issueBody(contactId: string, includedFileIds: string[] = []) {
  return {
    recipientProjectContactIds: [contactId],
    ccProjectContactIds: [],
    responseDueDate: "2026-08-01",
    includedFileIds,
    deliveryMode: "record_only",
  };
}

async function uploadRfiFile(
  projectId: string,
  rfiId: string,
  name = "support.pdf",
): Promise<{ id: string; revisionId: string }> {
  const form = new FormData();
  form.append("role", "supporting_attachment");
  form.append(
    "file",
    new File([new Uint8Array([1, 3, 5, 7, 9])], name, {
      type: "application/pdf",
    }),
  );
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/rfis/${rfiId}/attachments`,
    { method: "POST", headers: { "x-test-session": "admin" }, body: form },
    dependencies(),
  );
  expect(response.status).toBe(201);
  const body = await readJson<{
    data: { id: string; revisionId: string };
  }>(response);
  return body.data;
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
    renderer.reset();
    issueRepositoryControls.failBeforeCommit = false;
    issueRepositoryControls.failAfterCommit = false;
    issueRepositoryControls.failInspection = false;
    await seed();
  });

  it("applies RFI official issuance migration 0015 (schema version 13)", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);
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
    expect(model.currentVersion).toMatchObject({ status: "draft" });

    const spine = await testDatabase()
      .prepare(
        `SELECT record.id, record.record_type_key, record.workflow_status,
           details.record_id AS details_id, revision.record_id AS revision_record_id
         FROM records record
         JOIN rfi_details details ON details.record_id = record.id
         JOIN record_revisions revision ON revision.id = record.current_revision_id
         WHERE record.id = ? AND record.organization_id = 'org-a'`,
      )
      .bind(draft.id)
      .first<{
        id: string;
        record_type_key: string;
        workflow_status: string;
        details_id: string;
        revision_record_id: string;
      }>();
    expect(spine).toEqual({
      id: draft.id,
      record_type_key: "rfi",
      workflow_status: "draft",
      details_id: draft.id,
      revision_record_id: draft.id,
    });
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
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        `INSERT INTO project_contacts
          (id, organization_id, project_id, contact_name, contact_type, created_at, updated_at)
         VALUES ('contact-engineer', 'org-a', ?, 'Structural Engineer', 'engineer', ?, ?)`,
      )
      .bind(project.id, now, now)
      .run();

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
      responsiblePartyId: "contact-engineer",
      lockVersion: afterSubject.data.lockVersion,
    });
    expect(responsiblePatch.status).toBe(200);
    const afterResp: { data: ApiRfi & { responsibleParty: string } } =
      await responsiblePatch.json();
    expect(afterResp.data.responsibleParty).toBe("Structural Engineer");
    expect(afterResp.data.responsiblePartyId).toBe("contact-engineer");

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

  it("rejects responsible contacts from another project", async () => {
    const project = await createProject("P-RFI-CONTACT-A");
    const other = await createProject("P-RFI-CONTACT-B");
    const draft = await createDraft(project.id);
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        `INSERT INTO project_contacts
          (id, organization_id, project_id, contact_name, contact_type, created_at, updated_at)
         VALUES ('contact-other', 'org-a', ?, 'Other Architect', 'architect', ?, ?)`,
      )
      .bind(other.id, now, now)
      .run();
    const response = await patch(project.id, draft.id, {
      responsiblePartyId: "contact-other",
      lockVersion: draft.lockVersion,
    });
    expect(response.status).toBe(400);
    const stored = await testDatabase()
      .prepare(
        "SELECT current_responsible_contact_id FROM records WHERE id = ?",
      )
      .bind(draft.id)
      .first<{ current_responsible_contact_id: string | null }>();
    expect(stored?.current_responsible_contact_id).toBeNull();
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
    const uploaded: { data: { id: string; role: string; revisionId: string } } =
      await upload.json();
    expect(uploaded.data.role).toBe("reference_drawing");
    expect(uploaded.data.revisionId).toBe(draft.draftRevisionId);

    const association = await testDatabase()
      .prepare(
        `SELECT record_id, revision_id, role, original_filename, sha256
         FROM revision_files WHERE id = ?`,
      )
      .bind(uploaded.data.id)
      .first<{
        record_id: string;
        revision_id: string;
        role: string;
        original_filename: string;
        sha256: string;
      }>();
    expect(association).toMatchObject({
      record_id: draft.id,
      revision_id: draft.draftRevisionId,
      role: "reference_drawing",
      original_filename: "detail.pdf",
    });
    expect(association?.sha256).toHaveLength(64);

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
    await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/void`,
      request("admin", "POST"),
      dependencies(),
    );
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

  it("issues a ready RFI as one immutable revision/artifact/issuance transaction", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-ISSUE");
    await seedProjectContact(project.id, "contact-cc", "Owner Representative");
    const issued = await issue(project.id, draft.id, {
      recipientProjectContactIds: ["contact-recipient"],
      ccProjectContactIds: ["contact-cc"],
      responseDueDate: "2026-08-01",
      includedFileIds: [],
      deliveryMode: "record_only",
    });
    expect(issued.status).toBe(200);
    const body = await readJson<{
      data: {
        rfiId: string;
        officialDisplayNumber: string;
        status: string;
        issuedRevision: {
          id: string;
          internalRevisionNumber: number;
          userFacingVersion: string;
        };
        issuance: { id: string; issueNumber: string };
        officialArtifact: {
          fileId: string;
          mediaType: string;
          sha256: string;
          byteSize: number;
        };
        recipients: { to: { contactName: string }[]; cc: unknown[] };
        capabilities: { issue: boolean; recordResponse: boolean };
      };
    }>(issued);
    expect(body.data).toMatchObject({
      rfiId: draft.id,
      officialDisplayNumber: "RFI-001",
      status: "open",
      issuedRevision: {
        id: draft.draftRevisionId,
        internalRevisionNumber: 1,
        userFacingVersion: "Original Issue",
      },
      recipients: {
        to: [{ contactName: "Project Architect" }],
        cc: [{ contactName: "Owner Representative" }],
      },
      capabilities: { issue: false, recordResponse: true },
    });
    expect(body.data.issuance.issueNumber).toBe("ISS-001");
    expect(body.data.officialArtifact.mediaType).toBe("application/pdf");
    expect(body.data.officialArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.data.officialArtifact.byteSize).toBeGreaterThan(0);
    expect(storage.objectCount).toBe(1);
    const download = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/attachments/${body.data.officialArtifact.fileId}/content`,
      request("admin"),
      dependencies(),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect((await download.arrayBuffer()).byteLength).toBe(
      body.data.officialArtifact.byteSize,
    );

    const record = await testDatabase()
      .prepare(
        `SELECT record_number, sequence_no, workflow_status, issued_at,
                current_revision_id
         FROM records WHERE id = ?`,
      )
      .bind(draft.id)
      .first<{
        record_number: string;
        sequence_no: number;
        workflow_status: string;
        issued_at: string;
        current_revision_id: string;
      }>();
    expect(record).toMatchObject({
      record_number: "RFI-001",
      sequence_no: 1,
      workflow_status: "open",
      current_revision_id: draft.draftRevisionId,
    });
    expect(record?.issued_at).toBeTruthy();
    const counts = await testDatabase()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM rfi_official_issues WHERE rfi_id = ?) issue_count,
          (SELECT COUNT(*) FROM issuances WHERE record_id = ?) issuance_count,
          (SELECT COUNT(*) FROM revision_files
           WHERE record_id = ? AND role = 'generated_artifact') artifact_count,
          (SELECT COUNT(*) FROM rfi_issue_recipients
           WHERE rfi_id = ?) recipient_count,
          (SELECT COUNT(*) FROM activity_events
           WHERE object_id = ? AND action = 'rfi.issued') activity_count`,
      )
      .bind(draft.id, draft.id, draft.id, draft.id, draft.id)
      .first<Record<string, number>>();
    expect(counts).toEqual({
      issue_count: 1,
      issuance_count: 1,
      artifact_count: 1,
      recipient_count: 2,
      activity_count: 1,
    });

    const postIssueEdit = await patch(project.id, draft.id, {
      subject: "Must not mutate",
      lockVersion: 3,
    });
    expect(postIssueEdit.status).toBe(409);
  });

  it("replays the same idempotency key without duplicating official state", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-ISSUE-RETRY");
    const first = await issue(project.id, draft.id, undefined, {
      key: "stable-key",
    });
    const replay = await issue(project.id, draft.id, undefined, {
      key: "stable-key",
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const firstBody = await readJson<{ data: unknown }>(first);
    const replayBody = await readJson<{ data: unknown }>(replay);
    expect(replayBody.data).toEqual(firstBody.data);
    const sequence = await testDatabase()
      .prepare(
        `SELECT last_number FROM project_record_type_sequences
         WHERE organization_id = 'org-a' AND project_id = ? AND record_type_key = 'rfi'`,
      )
      .bind(project.id)
      .first<{ last_number: number }>();
    expect(sequence?.last_number).toBe(1);
    const counts = await testDatabase()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM record_revisions WHERE record_id = ?) revisions,
          (SELECT COUNT(*) FROM issuances WHERE record_id = ?) issuances,
          (SELECT COUNT(*) FROM activity_events
           WHERE object_id = ? AND action = 'rfi.issued') activities`,
      )
      .bind(draft.id, draft.id, draft.id)
      .first<Record<string, number>>();
    expect(counts).toEqual({ revisions: 1, issuances: 1, activities: 1 });
    expect(storage.objectCount).toBe(1);
  });

  it("reloads complete, safe official-issue evidence from the workspace", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-EVIDENCE", {
      upload: true,
    });
    expect(
      (
        await issue(
          prepared.project.id,
          prepared.draft.id,
          issueBody("contact-recipient", [prepared.fileId as string]),
          { key: "evidence-key" },
        )
      ).status,
    ).toBe(200);

    const model = await workspace(prepared.project.id, prepared.draft.id);
    expect(model.currentVersion).toEqual({
      id: prepared.draft.draftRevisionId,
      label: "Original Issue",
      status: "published",
    });
    expect(model.attachments.supporting_attachment[0]?.revisionLabel).toBe(
      "Original Issue",
    );
    expect(model.officialIssue).toMatchObject({
      officialDisplayNumber: "RFI-001",
      responseDueDate: "2026-08-01",
      issuedRevision: { userFacingVersion: "Original Issue" },
      includedFiles: [{ fileId: prepared.fileId }],
      recipients: { to: [{ contactName: "Project Architect" }] },
    });
    expect(model.officialIssue?.officialArtifact.fileId).toBe(
      `${prepared.draft.id}:official-rfi-pdf`,
    );
    expect(model.officialIssue).not.toHaveProperty("artifactStorageKey");
    expect(JSON.stringify(model.officialIssue)).not.toContain("storageKey");
  });

  it("rejects a reused idempotency key when the request changes", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-IDEMPOTENCY");
    expect(
      (
        await issue(project.id, draft.id, undefined, {
          key: "changed-key",
        })
      ).status,
    ).toBe(200);
    const changed = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-09-02",
        includedFileIds: [],
        deliveryMode: "record_only",
      },
      { key: "changed-key" },
    );
    expect(changed.status).toBe(409);
    expect(
      (await readJson<{ error: { code: string } }>(changed)).error.code,
    ).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("never replays an idempotency result across RFI or project scope", async () => {
    const project = await createProject("P-RFI-IDEM-SCOPE");
    const first = await prepareRfiInProject(
      project,
      "contact-idem-first",
      "First scoped RFI",
    );
    const second = await prepareRfiInProject(
      project,
      "contact-idem-second",
      "Second scoped RFI",
    );
    expect(
      (
        await issue(project.id, first.id, issueBody("contact-idem-first"), {
          key: "resource-scoped-key",
        })
      ).status,
    ).toBe(200);
    const sameProject = await issue(
      project.id,
      second.id,
      issueBody("contact-idem-first"),
      { key: "resource-scoped-key" },
    );
    expect(sameProject.status).toBe(409);
    expect(
      (await readJson<{ error: { code: string } }>(sameProject)).error.code,
    ).toBe("IDEMPOTENCY_KEY_REUSED");

    const otherProject = await createProject("P-RFI-IDEM-SCOPE-OTHER");
    const other = await prepareRfiInProject(
      otherProject,
      "contact-idem-other",
      "Other-project RFI",
    );
    const acrossProjects = await issue(
      otherProject.id,
      other.id,
      issueBody("contact-idem-first"),
      { key: "resource-scoped-key" },
    );
    expect(acrossProjects.status).toBe(409);
    expect(
      (await readJson<{ error: { code: string } }>(acrossProjects)).error.code,
    ).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("does not disclose another project's replay to an authorized manager", async () => {
    const first = await prepareIssuableRfi("P-RFI-IDEM-MANAGER-A", {
      contactId: "contact-idem-manager-a",
    });
    expect(
      (
        await issue(
          first.project.id,
          first.draft.id,
          issueBody(first.contactId),
          { key: "manager-isolation-key" },
        )
      ).status,
    ).toBe(200);
    const second = await prepareIssuableRfi("P-RFI-IDEM-MANAGER-B", {
      contactId: "contact-idem-manager-b",
    });
    await testDatabase()
      .prepare(
        `INSERT INTO project_memberships
          (id, organization_id, project_id, user_id, role, status, created_at)
         VALUES (?, 'org-a', ?, 'user-manager', 'project_manager', 'active', ?)`,
      )
      .bind(
        "member-idem-manager-b",
        second.project.id,
        new Date().toISOString(),
      )
      .run();
    const response = await issue(
      second.project.id,
      second.draft.id,
      issueBody(second.contactId),
      { key: "manager-isolation-key", session: "manager" },
    );
    expect(response.status).toBe(409);
    const error = await readJson<{ error: { code: string }; data?: unknown }>(
      response,
    );
    expect(error.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(error).not.toHaveProperty("data");
  });

  it("keeps identical idempotency keys isolated between organizations", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-IDEM-ORG");
    expect(
      (
        await issue(prepared.project.id, prepared.draft.id, undefined, {
          key: "organization-isolation-key",
        })
      ).status,
    ).toBe(200);
    const repository = new D1RfiOfficialIssueRepository(testDatabase());
    expect(
      await repository.findIdempotentResult(
        "org-b",
        "project-b",
        "rfi-b",
        "organization-isolation-key",
      ),
    ).toBeNull();
  });

  it("requires the idempotency header and record_only delivery", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-REQUEST");
    const missing = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/issue`,
      request("admin", "POST", {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-08-01",
        includedFileIds: [],
        deliveryMode: "record_only",
      }),
      dependencies(),
    );
    expect(missing.status).toBe(400);
    expect(
      (await readJson<{ error: { code: string } }>(missing)).error.code,
    ).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const tooLong = await issue(project.id, draft.id, undefined, {
      key: "x".repeat(201),
    });
    expect(tooLong.status).toBe(400);
    expect(
      (await readJson<{ error: { code: string } }>(tooLong)).error.code,
    ).toBe("VALIDATION_FAILED");

    const unsupported = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-08-01",
        includedFileIds: [],
        deliveryMode: "email",
      },
      { key: "unsupported-delivery" },
    );
    expect(unsupported.status).toBe(400);

    const invalidDate = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-02-31",
        includedFileIds: [],
        deliveryMode: "record_only",
      },
      { key: "invalid-date" },
    );
    expect(invalidDate.status).toBe(400);

    const emptyRecipients = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: [],
        ccProjectContactIds: [],
        responseDueDate: "2026-08-01",
        includedFileIds: [],
        deliveryMode: "record_only",
      },
      { key: "empty-recipients" },
    );
    expect(emptyRecipients.status).toBe(400);

    const overlappingRouting = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: ["contact-recipient"],
        responseDueDate: "2026-08-01",
        includedFileIds: [],
        deliveryMode: "record_only",
      },
      { key: "overlapping-routing" },
    );
    expect(overlappingRouting.status).toBe(400);
  });

  it("requires strict readiness, complete content, responsibility, and the exact published template", async () => {
    const project = await createProject("P-RFI-ELIGIBILITY");
    const draft = await createDraft(project.id);
    await seedProjectContact(project.id, "contact-recipient", "Architect");

    expect((await issue(project.id, draft.id)).status).toBe(409);

    const assigned = await patch(project.id, draft.id, {
      responsiblePartyId: "contact-recipient",
      lockVersion: draft.lockVersion,
    });
    expect(assigned.status).toBe(200);
    const ready = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/ready`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(ready.status).toBe(200);
    await testDatabase()
      .prepare(
        "UPDATE template_versions SET status = 'retired' WHERE id = ? AND organization_id = 'org-a'",
      )
      .bind(draft.templateVersionId)
      .run();
    const retiredTemplate = await issue(project.id, draft.id, undefined, {
      key: "retired-template",
    });
    expect(retiredTemplate.status).toBe(422);
    expect(storage.objectCount).toBe(0);
  });

  it("rejects void, closed, already-issued, incomplete, and unresolved RFI state", async () => {
    const nonReadyStates = ["void", "closed"] as const;
    for (const status of nonReadyStates) {
      const prepared = await prepareIssuableRfi(`P-RFI-STATE-${status}`, {
        contactId: `contact-${status}`,
      });
      await testDatabase()
        .prepare("UPDATE records SET workflow_status = ? WHERE id = ?")
        .bind(status, prepared.draft.id)
        .run();
      expect(
        (
          await issue(
            prepared.project.id,
            prepared.draft.id,
            issueBody(prepared.contactId),
            { key: `state-${status}` },
          )
        ).status,
      ).toBe(409);
    }

    for (const [name, sql] of [
      ["title", "UPDATE records SET title = '' WHERE id = ?"],
      ["question", "UPDATE rfi_details SET question = '' WHERE record_id = ?"],
      [
        "responsibility",
        "UPDATE records SET current_responsible_contact_id = NULL WHERE id = ?",
      ],
    ] as const) {
      const prepared = await prepareIssuableRfi(`P-RFI-INCOMPLETE-${name}`, {
        contactId: `contact-incomplete-${name}`,
      });
      await testDatabase().prepare(sql).bind(prepared.draft.id).run();
      expect(
        (
          await issue(
            prepared.project.id,
            prepared.draft.id,
            issueBody(prepared.contactId),
            { key: `incomplete-${name}` },
          )
        ).status,
      ).toBe(422);
    }

    const issued = await prepareIssuableRfi("P-RFI-ALREADY-ISSUED", {
      contactId: "contact-already-issued",
    });
    expect(
      (
        await issue(
          issued.project.id,
          issued.draft.id,
          issueBody(issued.contactId),
          { key: "already-first" },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await issue(
          issued.project.id,
          issued.draft.id,
          issueBody(issued.contactId),
          { key: "already-second" },
        )
      ).status,
    ).toBe(409);
  });

  it("validates recipient project scope, active state, and selected revision files", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-RELATIONS");
    const other = await createProject("P-RFI-RELATIONS-OTHER");
    await seedProjectContact(other.id, "contact-other-project", "Other");
    const otherDraft = await createDraft(other.id, "Other project RFI");
    const otherFile = await uploadRfiFile(other.id, otherDraft.id);
    await seedProjectContact(project.id, "contact-archived", "Archived", true);

    for (const [key, contactId] of [
      ["cross-project", "contact-other-project"],
      ["archived", "contact-archived"],
    ] as const) {
      const response = await issue(
        project.id,
        draft.id,
        {
          recipientProjectContactIds: [contactId],
          ccProjectContactIds: [],
          responseDueDate: "2026-08-01",
          includedFileIds: [],
          deliveryMode: "record_only",
        },
        { key },
      );
      expect(response.status).toBe(422);
    }

    const objectsBefore = storage.objectCount;
    const badFile = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-08-01",
        includedFileIds: [otherFile.id],
        deliveryMode: "record_only",
      },
      { key: "bad-file" },
    );
    expect(badFile.status).toBe(422);
    expect(storage.objectCount).toBe(objectsBefore);
  });

  it("snapshots included files and rejects missing or mismatched R2 objects", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-FILES", { upload: true });
    const { project, draft, fileId } = prepared;
    const success = await issue(
      project.id,
      draft.id,
      {
        recipientProjectContactIds: ["contact-recipient"],
        ccProjectContactIds: [],
        responseDueDate: "2026-08-01",
        includedFileIds: [fileId],
        deliveryMode: "record_only",
      },
      { key: "file-success" },
    );
    expect(success.status).toBe(200);
    const result = await readJson<{
      data: {
        includedFiles: {
          fileId: string;
          role: string;
          originalFilename: string;
          mediaType: string;
          byteSize: number;
          sha256: string;
        }[];
      };
    }>(success);
    expect(result.data.includedFiles).toHaveLength(1);
    expect(result.data.includedFiles[0]).toMatchObject({
      fileId,
      role: "supporting_attachment",
      originalFilename: "support.pdf",
      mediaType: "application/pdf",
      byteSize: 5,
    });
    expect(result.data.includedFiles[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    const snapshots = await testDatabase()
      .prepare(
        `SELECT snapshot_kind, COUNT(*) count
         FROM rfi_issue_file_snapshots
         WHERE rfi_id = ? GROUP BY snapshot_kind ORDER BY snapshot_kind`,
      )
      .bind(draft.id)
      .all<{ snapshot_kind: string; count: number }>();
    expect(snapshots.results).toEqual([
      { snapshot_kind: "included", count: 1 },
      { snapshot_kind: "official_artifact", count: 1 },
    ]);

    const missingPrepared = await prepareIssuableRfi("P-RFI-FILE-MISSING", {
      upload: true,
      contactId: "contact-recipient-missing",
    });
    const row = await testDatabase()
      .prepare("SELECT storage_key FROM revision_files WHERE id = ?")
      .bind(missingPrepared.fileId)
      .first<{ storage_key: string }>();
    await storage.delete(row?.storage_key ?? "");
    const missing = await issue(
      missingPrepared.project.id,
      missingPrepared.draft.id,
      issueBody(missingPrepared.contactId, [missingPrepared.fileId as string]),
      { key: "file-missing" },
    );
    expect(missing.status).toBe(503);

    for (const variant of [
      "missing-sha",
      "wrong-sha",
      "head-failure",
    ] as const) {
      const candidate = await prepareIssuableRfi(`P-RFI-FILE-${variant}`, {
        upload: true,
        contactId: `contact-${variant}`,
      });
      const candidateRow = await testDatabase()
        .prepare("SELECT storage_key FROM revision_files WHERE id = ?")
        .bind(candidate.fileId)
        .first<{ storage_key: string }>();
      const key = candidateRow?.storage_key ?? "";
      if (variant === "missing-sha") storage.omitShaKeys.add(key);
      if (variant === "wrong-sha") storage.wrongShaKeys.add(key);
      if (variant === "head-failure") storage.failHead = true;
      const objectCountBeforeIssue = storage.objectCount;
      try {
        const rejected = await issue(
          candidate.project.id,
          candidate.draft.id,
          issueBody(candidate.contactId, [candidate.fileId as string]),
          { key: `strict-sha-${variant}` },
        );
        expect(rejected.status, variant).toBe(503);
        expect(storage.objectCount, variant).toBe(objectCountBeforeIssue);
      } finally {
        storage.failHead = false;
        storage.omitShaKeys.delete(key);
        storage.wrongShaKeys.delete(key);
      }
    }
  });

  it("prevents simultaneous issue requests from creating duplicate official state", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-CONCURRENT");
    const responses = await Promise.all([
      issue(project.id, draft.id, undefined, { key: "concurrent-a" }),
      issue(project.id, draft.id, undefined, { key: "concurrent-b" }),
    ]);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    const counts = await testDatabase()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM rfi_official_issues WHERE rfi_id = ?) issues,
          (SELECT COUNT(*) FROM issuances WHERE record_id = ?) issuances,
          (SELECT COUNT(*) FROM activity_events
           WHERE object_id = ? AND action = 'rfi.issued') activities`,
      )
      .bind(draft.id, draft.id, draft.id)
      .first<Record<string, number>>();
    expect(counts).toEqual({ issues: 1, issuances: 1, activities: 1 });
    expect(storage.objectCount).toBe(1);
  });

  it("serializes concurrent project numbering without reusing or skipping a committed number", async () => {
    const project = await createProject("P-RFI-NUMBER-CONCURRENT");
    const firstDraft = await prepareRfiInProject(
      project,
      "contact-number-a",
      "First concurrent RFI",
    );
    const secondDraft = await prepareRfiInProject(
      project,
      "contact-number-b",
      "Second concurrent RFI",
    );
    const attempts = await Promise.all([
      issue(project.id, firstDraft.id, issueBody("contact-number-a"), {
        key: "number-a",
      }),
      issue(project.id, secondDraft.id, issueBody("contact-number-b"), {
        key: "number-b",
      }),
    ]);
    expect(attempts.filter((response) => response.status === 200)).toHaveLength(
      1,
    );
    const failedIndex = attempts.findIndex(
      (response) => response.status !== 200,
    );
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    const failedDraft = failedIndex === 0 ? firstDraft : secondDraft;
    const failedContact =
      failedIndex === 0 ? "contact-number-a" : "contact-number-b";
    const retry = await issue(
      project.id,
      failedDraft.id,
      issueBody(failedContact),
      { key: failedIndex === 0 ? "number-a" : "number-b" },
    );
    expect(retry.status).toBe(200);

    const numbers = await testDatabase()
      .prepare(
        `SELECT record_number FROM records
         WHERE project_id = ? AND record_type_key = 'rfi'
         ORDER BY sequence_no`,
      )
      .bind(project.id)
      .all<{ record_number: string }>();
    expect(numbers.results.map((row) => row.record_number)).toEqual([
      "RFI-001",
      "RFI-002",
    ]);
    const sequence = await testDatabase()
      .prepare(
        `SELECT last_number FROM project_record_type_sequences
         WHERE organization_id = 'org-a' AND project_id = ?
           AND record_type_key = 'rfi'`,
      )
      .bind(project.id)
      .first<{ last_number: number }>();
    expect(sequence?.last_number).toBe(2);
    expect(storage.objectCount).toBe(2);
  });

  it("compensates the R2 artifact when any guarded D1 issue boundary fails", async () => {
    const boundaries = [
      {
        name: "sequence",
        sql: `CREATE TRIGGER fail_rfi_issue_boundary
              BEFORE UPDATE ON project_record_type_sequences
              BEGIN SELECT RAISE(ABORT, 'forced sequence failure'); END`,
      },
      {
        name: "revision",
        sql: `CREATE TRIGGER fail_rfi_issue_boundary
              BEFORE UPDATE ON record_revisions
              WHEN NEW.status = 'published'
              BEGIN SELECT RAISE(ABORT, 'forced revision failure'); END`,
      },
      {
        name: "issuance",
        sql: `CREATE TRIGGER fail_rfi_issue_boundary
              BEFORE INSERT ON issuances
              BEGIN SELECT RAISE(ABORT, 'forced issuance failure'); END`,
      },
      {
        name: "recipient",
        sql: `CREATE TRIGGER fail_rfi_issue_boundary
              BEFORE INSERT ON rfi_issue_recipients
              BEGIN SELECT RAISE(ABORT, 'forced recipient failure'); END`,
      },
      {
        name: "activity",
        sql: `CREATE TRIGGER fail_rfi_issue_boundary
              BEFORE INSERT ON activity_events
              WHEN NEW.action = 'rfi.issued'
              BEGIN SELECT RAISE(ABORT, 'forced activity failure'); END`,
      },
    ];

    for (const boundary of boundaries) {
      const { project, draft } = await prepareIssuableRfi(
        `P-RFI-FAIL-${boundary.name}`,
        { contactId: `contact-${boundary.name}` },
      );
      await testDatabase().prepare(boundary.sql).run();
      try {
        const response = await issue(
          project.id,
          draft.id,
          issueBody(`contact-${boundary.name}`),
          { key: `failure-${boundary.name}` },
        );
        expect(response.status, boundary.name).toBe(503);
        expect(storage.objectCount, boundary.name).toBe(0);
        const state = await testDatabase()
          .prepare(
            `SELECT workflow_status, record_number, issued_at
             FROM records WHERE id = ?`,
          )
          .bind(draft.id)
          .first<{
            workflow_status: string;
            record_number: string | null;
            issued_at: string | null;
          }>();
        expect(state, boundary.name).toEqual({
          workflow_status: "ready_to_issue",
          record_number: null,
          issued_at: null,
        });
      } finally {
        await testDatabase()
          .prepare("DROP TRIGGER IF EXISTS fail_rfi_issue_boundary")
          .run();
      }
    }
  });

  it("recovers a committed result after an ambiguous batch response", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-COMMIT-AMBIGUOUS");
    issueRepositoryControls.failAfterCommit = true;
    const response = await issue(
      prepared.project.id,
      prepared.draft.id,
      undefined,
      { key: "ambiguous-committed-key" },
    );
    expect(response.status).toBe(200);
    expect(storage.objectCount).toBe(1);
    const counts = await testDatabase()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM rfi_official_issues WHERE rfi_id = ?) issues,
          (SELECT COUNT(*) FROM revision_files
           WHERE record_id = ? AND role = 'generated_artifact') files`,
      )
      .bind(prepared.draft.id, prepared.draft.id)
      .first<{ issues: number; files: number }>();
    expect(counts).toEqual({ issues: 1, files: 1 });
  });

  it("deletes only after a failed commit is authoritatively absent", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-COMMIT-ABSENT");
    issueRepositoryControls.failBeforeCommit = true;
    const response = await issue(
      prepared.project.id,
      prepared.draft.id,
      undefined,
      { key: "definitely-absent-key" },
    );
    expect(response.status).toBe(503);
    expect(storage.objectCount).toBe(0);
    expect(
      await testDatabase()
        .prepare("SELECT COUNT(*) count FROM rfi_artifact_orphans")
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
  });

  it("retains the artifact and records reconciliation when commit state is unavailable", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-COMMIT-UNKNOWN");
    issueRepositoryControls.failBeforeCommit = true;
    issueRepositoryControls.failInspection = true;
    const response = await issue(
      prepared.project.id,
      prepared.draft.id,
      undefined,
      { key: "unknown-commit-key" },
    );
    expect(response.status).toBe(500);
    expect(
      (await readJson<{ error: { code: string } }>(response)).error.code,
    ).toBe("RFI_ARTIFACT_RECONCILIATION_REQUIRED");
    expect(storage.objectCount).toBe(1);
    const reconciliation = await testDatabase()
      .prepare(
        `SELECT reconciliation_kind, reconciliation_status
         FROM rfi_artifact_orphans WHERE rfi_id = ?`,
      )
      .bind(prepared.draft.id)
      .first<{
        reconciliation_kind: string;
        reconciliation_status: string;
      }>();
    expect(reconciliation).toEqual({
      reconciliation_kind: "commit_outcome_unknown",
      reconciliation_status: "pending",
    });
  });

  it("never deletes a committed artifact when authoritative reload is unavailable", async () => {
    const prepared = await prepareIssuableRfi("P-RFI-RELOAD-UNKNOWN");
    issueRepositoryControls.failInspection = true;
    const response = await issue(
      prepared.project.id,
      prepared.draft.id,
      undefined,
      { key: "committed-reload-failure-key" },
    );
    expect(response.status).toBe(500);
    expect(storage.objectCount).toBe(1);
    const references = await testDatabase()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM rfi_official_issues WHERE rfi_id = ?) issues,
          (SELECT COUNT(*) FROM revision_files
           WHERE record_id = ? AND role = 'generated_artifact') revisions,
          (SELECT COUNT(*) FROM issuance_files WHERE record_id = ?) issuances,
          (SELECT COUNT(*) FROM rfi_issue_file_snapshots
           WHERE rfi_id = ? AND snapshot_kind = 'official_artifact') snapshots`,
      )
      .bind(
        prepared.draft.id,
        prepared.draft.id,
        prepared.draft.id,
        prepared.draft.id,
      )
      .first<Record<string, number>>();
    expect(references).toEqual({
      issues: 1,
      revisions: 1,
      issuances: 1,
      snapshots: 1,
    });
  });

  it("fails safely before D1 for render, R2 write, and R2 verification errors", async () => {
    const renderCase = await prepareIssuableRfi("P-RFI-RENDER-FAIL");
    renderer.fail = true;
    expect(
      (
        await issue(renderCase.project.id, renderCase.draft.id, undefined, {
          key: "render-fail",
        })
      ).status,
    ).toBe(503);
    expect(storage.objectCount).toBe(0);
    renderer.fail = false;

    const putCase = await prepareIssuableRfi("P-RFI-PUT-FAIL", {
      contactId: "contact-put-fail",
    });
    storage.failPut = true;
    expect(
      (
        await issue(
          putCase.project.id,
          putCase.draft.id,
          issueBody(putCase.contactId),
          { key: "put-fail" },
        )
      ).status,
    ).toBe(503);
    expect(storage.objectCount).toBe(0);
    storage.failPut = false;

    const verifyCase = await prepareIssuableRfi("P-RFI-VERIFY-FAIL", {
      contactId: "contact-verify-fail",
    });
    storage.corruptHead = true;
    expect(
      (
        await issue(
          verifyCase.project.id,
          verifyCase.draft.id,
          issueBody(verifyCase.contactId),
          { key: "verify-fail" },
        )
      ).status,
    ).toBe(503);
    expect(storage.objectCount).toBe(0);
    storage.corruptHead = false;

    const headCase = await prepareIssuableRfi("P-RFI-HEAD-FAIL", {
      contactId: "contact-head-fail",
    });
    storage.failHead = true;
    expect(
      (
        await issue(
          headCase.project.id,
          headCase.draft.id,
          issueBody(headCase.contactId),
          { key: "head-fail" },
        )
      ).status,
    ).toBe(503);
    expect(storage.objectCount).toBe(0);
    storage.failHead = false;
  });

  it("durably records an orphan when R2 compensation deletion fails", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-ORPHAN");
    await testDatabase()
      .prepare(
        `CREATE TRIGGER fail_rfi_issue_commit
         BEFORE INSERT ON rfi_official_issues
         BEGIN SELECT RAISE(ABORT, 'forced commit failure'); END`,
      )
      .run();
    storage.failDelete = true;
    try {
      const response = await issue(project.id, draft.id, undefined, {
        key: "orphan-key",
      });
      expect(response.status).toBe(500);
      const orphan = await testDatabase()
        .prepare(
          `SELECT reconciliation_status, artifact_byte_size
           FROM rfi_artifact_orphans WHERE rfi_id = ?`,
        )
        .bind(draft.id)
        .first<{
          reconciliation_status: string;
          artifact_byte_size: number;
        }>();
      expect(orphan?.reconciliation_status).toBe("pending");
      expect(orphan?.artifact_byte_size).toBeGreaterThan(0);
      expect(storage.objectCount).toBe(1);
    } finally {
      storage.failDelete = false;
      await testDatabase()
        .prepare("DROP TRIGGER IF EXISTS fail_rfi_issue_commit")
        .run();
    }
  });

  it("keeps the frozen artifact and snapshots unchanged after source edits", async () => {
    const { project, draft } = await prepareIssuableRfi("P-RFI-IMMUTABLE");
    const response = await issue(project.id, draft.id, undefined, {
      key: "immutable-key",
    });
    expect(response.status).toBe(200);
    const issueRow = await testDatabase()
      .prepare(
        `SELECT artifact_storage_key, artifact_sha256, render_payload_json,
                template_definition_json
         FROM rfi_official_issues WHERE rfi_id = ?`,
      )
      .bind(draft.id)
      .first<{
        artifact_storage_key: string;
        artifact_sha256: string;
        render_payload_json: string;
        template_definition_json: string;
      }>();
    const recipientBefore = await testDatabase()
      .prepare(
        `SELECT contact_name_snapshot, email_snapshot
         FROM rfi_issue_recipients WHERE rfi_id = ?`,
      )
      .bind(draft.id)
      .first<Record<string, string>>();
    const bytesBefore = storage.bytes(issueRow?.artifact_storage_key ?? "");

    await testDatabase()
      .prepare(
        `UPDATE projects SET name = 'Changed Project', updated_at = ?
         WHERE id = ?`,
      )
      .bind(new Date().toISOString(), project.id)
      .run();
    await testDatabase()
      .prepare(
        `UPDATE project_contacts
         SET contact_name = 'Changed Contact', email = 'changed@example.test',
             updated_at = ?
         WHERE id = 'contact-recipient'`,
      )
      .bind(new Date().toISOString())
      .run();
    await testDatabase()
      .prepare(
        `UPDATE rfi_details SET question = 'Changed question'
         WHERE record_id = ?`,
      )
      .bind(draft.id)
      .run();
    const version = await testDatabase()
      .prepare(
        `SELECT template_id, version_number, definition_json
         FROM template_versions WHERE id = ?`,
      )
      .bind(draft.templateVersionId)
      .first<{
        template_id: string;
        version_number: number;
        definition_json: string;
      }>();
    const now = new Date().toISOString();
    await testDatabase().batch([
      testDatabase()
        .prepare("UPDATE template_versions SET status = 'retired' WHERE id = ?")
        .bind(draft.templateVersionId),
      testDatabase()
        .prepare(
          `INSERT INTO template_versions
            (id, organization_id, template_id, version_number, definition_json,
             status, created_by, created_at, published_at, published_by)
           VALUES (?, 'org-a', ?, ?, ?, 'published', 'user-admin', ?, ?, 'user-admin')`,
        )
        .bind(
          "template-version-after-rfi-issue",
          version?.template_id,
          (version?.version_number ?? 0) + 1,
          version?.definition_json,
          now,
          now,
        ),
    ]);
    renderer.versionOverride = "future-renderer/v99";

    const issueAfter = await testDatabase()
      .prepare(
        `SELECT artifact_storage_key, artifact_sha256, render_payload_json,
                template_definition_json
         FROM rfi_official_issues WHERE rfi_id = ?`,
      )
      .bind(draft.id)
      .first<typeof issueRow>();
    const recipientAfter = await testDatabase()
      .prepare(
        `SELECT contact_name_snapshot, email_snapshot
         FROM rfi_issue_recipients WHERE rfi_id = ?`,
      )
      .bind(draft.id)
      .first<Record<string, string>>();
    expect(issueAfter).toEqual(issueRow);
    expect(recipientAfter).toEqual(recipientBefore);
    expect(storage.bytes(issueRow?.artifact_storage_key ?? "")).toEqual(
      bytesBefore,
    );
    await expect(
      testDatabase()
        .prepare(
          "UPDATE rfi_official_issues SET response_due_date = '2027-01-01' WHERE rfi_id = ?",
        )
        .bind(draft.id)
        .run(),
    ).rejects.toThrow(/immutable/);
    await expect(
      testDatabase()
        .prepare(
          "UPDATE rfi_issue_recipients SET contact_name_snapshot = 'Mutated' WHERE rfi_id = ?",
        )
        .bind(draft.id)
        .run(),
    ).rejects.toThrow(/immutable/);
    await expect(
      testDatabase()
        .prepare("UPDATE record_revisions SET title = 'Mutated' WHERE id = ?")
        .bind(draft.draftRevisionId)
        .run(),
    ).rejects.toThrow(/immutable/);
    await expect(
      testDatabase()
        .prepare("UPDATE records SET record_number = 'RFI-999' WHERE id = ?")
        .bind(draft.id)
        .run(),
    ).rejects.toThrow(/immutable/);
  });

  it("hides incomplete issue and response capabilities from the workspace", async () => {
    const project = await createProject("P-RFI-CAPS");
    const draft = await createDraft(project.id);
    const model = await workspace(project.id, draft.id);
    expect(model.capabilities).toMatchObject({
      issue: false,
      recordResponse: false,
    });
  });

  it("rolls back record, details, and revision when creation activity fails", async () => {
    const project = await createProject("P-RFI-AUDIT");
    const database = testDatabase();
    await database
      .prepare(
        `CREATE TRIGGER fail_rfi_created_activity
         BEFORE INSERT ON activity_events
         WHEN NEW.action = 'rfi.created'
         BEGIN SELECT RAISE(ABORT, 'forced RFI audit failure'); END`,
      )
      .run();
    try {
      await expect(
        invokeV2Api(
          `/api/v2/projects/${project.id}/rfis`,
          request("admin", "POST", {
            subject: "Must roll back",
            question: "Was the record rolled back?",
          }),
          dependencies(),
        ),
      ).rejects.toThrow(/forced RFI audit failure/);
      const records = await database
        .prepare(
          "SELECT COUNT(*) AS count FROM records WHERE project_id = ? AND record_type_key = 'rfi'",
        )
        .bind(project.id)
        .first<{ count: number }>();
      expect(records?.count).toBe(0);
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_rfi_created_activity")
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

  it("enforces project-role authorization before official issue validation", async () => {
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

    const viewerDenied = await issue(project.id, draft.id, undefined, {
      key: "viewer-key",
      session: "viewer",
    });
    expect(viewerDenied.status).toBe(404);

    const unauthenticated = await issue(project.id, draft.id, undefined, {
      key: "unauthenticated-key",
      session: "",
    });
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await issue("project-b", "other-rfi", undefined, {
      key: "cross-tenant-key",
    });
    expect(crossTenant.status).toBe(404);

    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-manager', 'project_manager', 'active', ?)",
      )
      .bind("member-manager", project.id, now)
      .run();
    const managerAllowed = await issue(project.id, draft.id, undefined, {
      key: "manager-key",
      session: "manager",
    });
    expect(managerAllowed.status).toBe(409);
    const managerError = await readJson<{ error: { code: string } }>(
      managerAllowed,
    );
    expect(managerError.error.code).toBe("RFI_ILLEGAL_TRANSITION");
  });
});
