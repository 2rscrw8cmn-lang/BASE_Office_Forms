import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { RfiService } from "../../src/application/rfis/rfi-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RfiNumberSequencesRepository } from "../../src/infrastructure/db/d1/rfi-number-sequences-repository";
import { D1RfiRecordsRepository } from "../../src/infrastructure/db/d1/rfi-records-repository";
import { D1RfiResponsesRepository } from "../../src/infrastructure/db/d1/rfi-responses-repository";
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
  const responses = new D1RfiResponsesRepository(database);
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    rfis: new RfiService(
      projects,
      new D1RfiRecordsRepository(
        database,
        new D1RfiNumberSequencesRepository(database),
        responses,
      ),
      responses,
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
  ]);
}

interface ApiProject {
  id: string;
}

interface ApiRfi {
  id: string;
  rfiNumber: string | null;
  status: string;
  title: string;
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
  title = "Clarify footing detail",
): Promise<ApiRfi> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/rfis`,
    request("admin", "POST", {
      title,
      question: "Please confirm the required footing detail.",
      suggestedResolution: "Use detail S-4.",
      submittedBy: "General Contractor",
      assignedTo: "Architect",
      dueDate: "2026-08-01",
      costImpact: "Unknown",
      scheduleImpact: "None",
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

describe("RFI foundation API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("creates and edits drafts, with schema version 7", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(7);
    const project = await createProject("P-RFI-1");
    const draft = await createDraft(project.id);
    expect(draft).toMatchObject({
      status: "draft",
      rfiNumber: null,
      title: "Clarify footing detail",
    });
    const update = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}`,
      request("documentControl", "PATCH", { title: "Clarify revised footing" }),
      dependencies(),
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      data: { title: "Clarify revised footing", rfiNumber: null },
    });
  });

  it("issues permanently numbered RFIs and rejects repeated issue or post-issue editing", async () => {
    const project = await createProject("P-RFI-2");
    const draft = await createDraft(project.id);
    const issued = await issue(project.id, draft.id);
    expect(issued.status).toBe(200);
    await expect(issued.json()).resolves.toMatchObject({
      data: { status: "issued", rfiNumber: "RFI-001" },
    });
    const again = await issue(project.id, draft.id);
    expect(again.status).toBe(409);
    const edit = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}`,
      request("admin", "PATCH", { title: "No longer editable" }),
      dependencies(),
    );
    expect(edit.status).toBe(409);
  });

  it("uses project-scoped, concurrent-safe sequences", async () => {
    const firstProject = await createProject("P-RFI-3A");
    const secondProject = await createProject("P-RFI-3B");
    const first = await createDraft(firstProject.id, "First");
    const second = await createDraft(firstProject.id, "Second");
    const otherProject = await createDraft(secondProject.id, "Other project");
    const issued = await Promise.all([
      issue(firstProject.id, first.id),
      issue(firstProject.id, second.id),
      issue(secondProject.id, otherProject.id),
    ]);
    const payloads: { data: { rfiNumber: string } }[] = await Promise.all(
      issued.map(async (response) => response.json()),
    );
    expect(
      payloads
        .slice(0, 2)
        .map((payload) => payload.data.rfiNumber)
        .sort(),
    ).toEqual(["RFI-001", "RFI-002"]);
    expect(payloads[2].data.rfiNumber).toBe("RFI-001");
  });

  it("responds, closes, reopens, and records the required activity events", async () => {
    const project = await createProject("P-RFI-4");
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
        status: "answered",
        response: { response: "Use detail S-4 as suggested." },
      },
    });
    const closed = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/close`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(closed.status).toBe(200);
    const reopened = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}/reopen`,
      request("admin", "POST"),
      dependencies(),
    );
    expect(reopened.status).toBe(200);
    await expect(reopened.json()).resolves.toMatchObject({
      data: { status: "answered" },
    });
    const detail = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis/${draft.id}`,
      request("admin"),
      dependencies(),
    );
    await expect(detail.json()).resolves.toMatchObject({
      data: { responses: [{ respondedBy: "Architect" }] },
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

  it("rolls back a response and lifecycle transition when its activity event fails", async () => {
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
        .prepare("SELECT status, answered_at FROM rfi_records WHERE id = ?")
        .bind(draft.id)
        .first<{ status: string; answered_at: string | null }>();
      expect(rfi).toEqual({ status: "issued", answered_at: null });
      const responses = await database
        .prepare("SELECT COUNT(*) AS count FROM rfi_responses WHERE rfi_id = ?")
        .bind(draft.id)
        .first<{ count: number }>();
      expect(responses?.count).toBe(0);
      const auditEvents = await database
        .prepare(
          "SELECT COUNT(*) AS count FROM activity_events WHERE object_id = ? AND action = 'rfi.responded'",
        )
        .bind(draft.id)
        .first<{ count: number }>();
      expect(auditEvents?.count).toBe(0);
    } finally {
      await database
        .prepare("DROP TRIGGER IF EXISTS fail_rfi_responded_activity")
        .run();
    }
  });

  it("rejects responses and closure before their required prior transitions", async () => {
    const project = await createProject("P-RFI-5");
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

  it("enforces tenant isolation and project-role authorization", async () => {
    const project = await createProject("P-RFI-6");
    const draft = await createDraft(project.id);
    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-b', 'org-b', 'P-B', 'Other', 'planning', 'America/New_York', ?, ?)",
      )
      .bind(now, now)
      .run();
    await testDatabase()
      .prepare(
        "INSERT INTO rfi_records (id, organization_id, project_id, status, title, question, created_at, updated_at) VALUES ('rfi-b', 'org-b', 'project-b', 'draft', 'Other', 'Other question', ?, ?)",
      )
      .bind(now, now)
      .run();
    const tenantDenied = await invokeV2Api(
      "/api/v2/projects/project-b/rfis/rfi-b",
      request("admin"),
      dependencies(),
    );
    expect(tenantDenied.status).toBe(404);

    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-contributor', 'contributor', 'active', ?)",
      )
      .bind("member-contributor", project.id, now)
      .run();
    const contributorDenied = await invokeV2Api(
      `/api/v2/projects/${project.id}/rfis`,
      request("contributor", "POST", { title: "Denied", question: "Denied" }),
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
