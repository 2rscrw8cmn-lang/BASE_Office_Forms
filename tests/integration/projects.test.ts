import { beforeEach, describe, expect, it } from "vitest";

import { ProjectContactService } from "../../src/application/projects/project-contact-service";
import { ProjectService } from "../../src/application/projects/project-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { OrganizationService } from "../../src/application/identity/organization-service";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectContactsRepository } from "../../src/infrastructure/db/d1/project-contacts-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import type { V2RouteDependencies } from "../../src/http/v2/dependencies";
import { invokeV2Api, jsonBody } from "../helpers/api";
import { resetIdentityFoundation, testDatabase } from "../helpers/d1";

const admin: AppSession = {
  userId: "user-admin",
  organizationId: "org-a",
  membershipRole: "org_admin",
  projectPermissions: [],
};
const documentControl: AppSession = {
  userId: "user-doc",
  organizationId: "org-a",
  membershipRole: "document_control_admin",
  projectPermissions: [],
};
const manager: AppSession = {
  userId: "user-manager",
  organizationId: "org-a",
  membershipRole: "project_manager",
  projectPermissions: [],
};
const contributor: AppSession = {
  userId: "user-contributor",
  organizationId: "org-a",
  membershipRole: "contributor",
  projectPermissions: [],
};

class FixtureAuthenticationAdapter implements AuthenticationAdapter {
  constructor(private readonly sessions: Partial<Record<string, AppSession>>) {}
  authenticate(request: Request): Promise<AuthenticationResult> {
    const session = this.sessions[request.headers.get("x-test-session") ?? ""];
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
    authenticationAdapter: new FixtureAuthenticationAdapter({
      admin,
      documentControl,
      manager,
      contributor,
    }),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    projectContacts: new ProjectContactService(
      projects,
      new D1ProjectContactsRepository(database),
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
    ...["user-admin", "user-doc", "user-manager", "user-contributor"].map(
      (id) =>
        database
          .prepare(
            "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)",
          )
          .bind(id, `identity|${id}`, `${id}@example.test`, id, now, now),
    ),
    ...[
      ["membership-admin", "user-admin", "org_admin"],
      ["membership-doc", "user-doc", "document_control_admin"],
      ["membership-manager-org", "user-manager", "project_manager"],
      ["membership-contributor", "user-contributor", "contributor"],
    ].map(([id, userId, role]) =>
      database
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, ?, 'active', ?)",
        )
        .bind(id, userId, role, now),
    ),
  ]);
}

async function createProject(
  session: string,
  projectNumber: string,
  name = "Project",
): Promise<Record<string, string>> {
  const response = await invokeV2Api(
    "/api/v2/projects",
    request(session, "POST", { projectNumber, name }),
    dependencies(),
  );
  expect(response.status).toBe(201);
  const body: { data: Record<string, string> } = await response.json();
  return body.data;
}

describe("project directory API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("scopes projects to organizations while allowing the same project number in different organizations", async () => {
    const created = await createProject(
      "admin",
      "P-100",
      "Organization A Project",
    );
    const database = testDatabase();
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES (?, 'org-b', 'P-100', 'Organization B Project', 'planning', 'America/New_York', ?, ?)",
      )
      .bind("project-b", now, now)
      .run();

    const list = await invokeV2Api(
      "/api/v2/projects",
      request("admin"),
      dependencies(),
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      data: [{ id: created.id, projectNumber: "P-100" }],
    });

    const duplicate = await invokeV2Api(
      "/api/v2/projects",
      request("admin", "POST", { projectNumber: "P-100", name: "Duplicate" }),
      dependencies(),
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NUMBER_CONFLICT" },
    });

    const denied = await invokeV2Api(
      "/api/v2/projects",
      request("contributor", "POST", {
        projectNumber: "P-105",
        name: "Denied",
      }),
      dependencies(),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("conceals projects outside the organization and unassigned project routes", async () => {
    const project = await createProject("admin", "P-101");
    const database = testDatabase();
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES ('project-b', 'org-b', 'P-201', 'Other', 'planning', 'America/New_York', ?, ?)",
      )
      .bind(now, now)
      .run();

    const outside = await invokeV2Api(
      "/api/v2/projects/project-b",
      request("admin"),
      dependencies(),
    );
    const missing = await invokeV2Api(
      "/api/v2/projects/missing",
      request("admin"),
      dependencies(),
    );
    expect(outside.status).toBe(404);
    expect(await outside.json()).toMatchObject({
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "The requested project was not found.",
      },
    });
    expect(await missing.json()).toMatchObject({
      error: {
        code: "PROJECT_NOT_FOUND",
        message: "The requested project was not found.",
      },
    });

    const unassigned = await invokeV2Api(
      `/api/v2/projects/${project.id}`,
      request("contributor"),
      dependencies(),
    );
    expect(unassigned.status).toBe(404);
    await expect(unassigned.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });
  });

  it("enforces project-manager assignment and omits archived projects from normal lists", async () => {
    const project = await createProject("admin", "P-102");
    const denied = await invokeV2Api(
      `/api/v2/projects/${project.id}`,
      request("manager", "PATCH", { name: "No access" }),
      dependencies(),
    );
    expect(denied.status).toBe(404);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND" },
    });

    const now = new Date().toISOString();
    await testDatabase()
      .prepare(
        "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?, 'org-a', ?, 'user-manager', 'project_manager', 'active', ?)",
      )
      .bind("membership-manager", project.id, now)
      .run();
    const permitted = await invokeV2Api(
      `/api/v2/projects/${project.id}`,
      request("manager", "PATCH", { name: "Assigned manager project" }),
      dependencies(),
    );
    expect(permitted.status).toBe(200);

    await testDatabase()
      .prepare(
        "UPDATE projects SET archived_at = ?, status = 'archived' WHERE id = ?",
      )
      .bind(now, project.id)
      .run();
    const list = await invokeV2Api(
      "/api/v2/projects",
      request("admin"),
      dependencies(),
    );
    await expect(list.json()).resolves.toMatchObject({ data: [] });
  });

  it("requires project members to belong to the project's organization", async () => {
    const project = await createProject("admin", "P-102A");
    const database = testDatabase();
    const now = new Date().toISOString();
    await database
      .prepare(
        "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES ('user-external', 'identity|external', 'external@example.test', 'External', 'active', ?, ?)",
      )
      .bind(now, now)
      .run();

    await expect(
      database
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES ('membership-external', 'org-a', ?, 'user-external', 'viewer', 'active', ?)",
        )
        .bind(project.id, now)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("strictly scopes contacts to their parent project and appends project and contact activity", async () => {
    const first = await createProject("admin", "P-103", "First");
    const second = await createProject("admin", "P-104", "Second");
    const renamed = await invokeV2Api(
      `/api/v2/projects/${first.id}`,
      request("admin", "PATCH", { name: "First renamed" }),
      dependencies(),
    );
    expect(renamed.status).toBe(200);
    const contactResponse = await invokeV2Api(
      `/api/v2/projects/${second.id}/contacts`,
      request("documentControl", "POST", {
        contactName: "  Jane Architect  ",
        contactType: "architect",
        email: " JANE@EXAMPLE.TEST ",
      }),
      dependencies(),
    );
    expect(contactResponse.status).toBe(201);
    const contactPayload = await jsonBody(contactResponse);
    const contactData = contactPayload.data;
    if (
      !contactData ||
      typeof contactData !== "object" ||
      Array.isArray(contactData)
    ) {
      throw new Error("Expected a project contact response.");
    }
    const contact = contactData as Record<string, string>;
    expect(contact.email).toBe("jane@example.test");

    const updated = await invokeV2Api(
      `/api/v2/projects/${second.id}/contacts/${contact.id}`,
      request("documentControl", "PATCH", { phone: "555-0100" }),
      dependencies(),
    );
    expect(updated.status).toBe(200);

    const wrongParent = await invokeV2Api(
      `/api/v2/projects/${first.id}/contacts/${contact.id}`,
      request("documentControl", "PATCH", { phone: "555-0100" }),
      dependencies(),
    );
    expect(wrongParent.status).toBe(404);
    await expect(wrongParent.json()).resolves.toMatchObject({
      error: { code: "PROJECT_CONTACT_NOT_FOUND" },
    });

    const events = await testDatabase()
      .prepare(
        "SELECT action FROM activity_events WHERE organization_id = 'org-a' ORDER BY created_at ASC",
      )
      .all<{ action: string }>();
    expect(events.results.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "project.created",
        "project.updated",
        "project_contact.created",
        "project_contact.updated",
      ]),
    );
  });
});
