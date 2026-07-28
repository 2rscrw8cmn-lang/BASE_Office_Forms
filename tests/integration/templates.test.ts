import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { TemplateService } from "../../src/application/templates/template-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
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
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    templates: new TemplateService(new D1TemplatesRepository(database)),
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
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
        )
        .bind(
          `membership-${session.userId}`,
          session.organizationId,
          session.userId,
          session.membershipRole,
          now,
        ),
    ]),
  ]);
}

interface ApiTemplateVersion {
  id: string;
  versionNumber: number;
  definition: Record<string, unknown>;
  publishedAt: string;
  publishedBy: string;
}
interface ApiTemplate {
  id: string;
  key: string;
  name: string;
  kind: string;
  publishedVersion: ApiTemplateVersion;
}

const submittalDefinition = {
  kind: "form",
  title: "Submittal / Transmittal",
  sections: [{ name: "Details", fields: [["Project", 1]] }],
};

async function publishTemplate(
  key: string,
  body: Record<string, unknown> = {},
  session = "admin",
): Promise<Response> {
  return invokeV2Api(
    `/api/v2/templates/${key}`,
    request(session, "PUT", {
      name: "Submittal / Transmittal",
      kind: "form",
      definition: submittalDefinition,
      ...body,
    }),
    dependencies(),
  );
}

describe("templates foundation API", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("creates a template on first publish and reports schema version 13", async () => {
    const version = await testDatabase()
      .prepare("SELECT schema_version FROM app_meta WHERE id = 1")
      .first<{ schema_version: number }>();
    expect(version?.schema_version).toBe(13);

    const response = await publishTemplate("submittal");
    expect(response.status).toBe(200);
    const body = await jsonData<ApiTemplate>(response);
    expect(body).toMatchObject({
      key: "submittal",
      name: "Submittal / Transmittal",
      kind: "form",
      publishedVersion: { versionNumber: 1, definition: submittalDefinition },
    });

    const get = await invokeV2Api(
      "/api/v2/templates/submittal",
      request("admin"),
      dependencies(),
    );
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({
      data: { key: "submittal", publishedVersion: { versionNumber: 1 } },
    });
  });

  it("returns 404 for a template that has never been published", async () => {
    const response = await invokeV2Api(
      "/api/v2/templates/does-not-exist",
      request("admin"),
      dependencies(),
    );
    expect(response.status).toBe(404);
  });

  it("republishing bumps the version number and retires the prior version", async () => {
    const first = await jsonData<ApiTemplate>(
      await publishTemplate("submittal"),
    );
    expect(first.publishedVersion.versionNumber).toBe(1);

    const revisedDefinition = {
      ...submittalDefinition,
      sections: [{ name: "Details", fields: [["Project", 2]] }],
    };
    const second = await jsonData<ApiTemplate>(
      await publishTemplate("submittal", { definition: revisedDefinition }),
    );
    expect(second.publishedVersion.versionNumber).toBe(2);
    expect(second.publishedVersion.definition).toEqual(revisedDefinition);
    expect(second.id).toBe(first.id);

    const priorVersionRow = await testDatabase()
      .prepare("SELECT status FROM template_versions WHERE id = ?")
      .bind(first.publishedVersion.id)
      .first<{ status: string }>();
    expect(priorVersionRow?.status).toBe("retired");

    const publishedCount = await testDatabase()
      .prepare(
        "SELECT COUNT(*) AS count FROM template_versions WHERE template_id = ? AND status = 'published'",
      )
      .bind(first.id)
      .first<{ count: number }>();
    expect(publishedCount?.count).toBe(1);

    const events = await testDatabase()
      .prepare(
        "SELECT action FROM activity_events WHERE object_id IN (?, ?) ORDER BY created_at ASC, rowid ASC",
      )
      .bind(first.publishedVersion.id, second.publishedVersion.id)
      .all<{ action: string }>();
    expect(events.results.map((event) => event.action)).toEqual([
      "template.version.published",
      "template.version.retired",
      "template.version.published",
    ]);
  });

  it("rejects a renderer definition that fails schema validation", async () => {
    const response = await publishTemplate("submittal", {
      definition: { kind: "form" },
    });
    expect(response.status).toBe(400);
  });

  it("allows org_admin and document_control_admin to publish, denies other roles", async () => {
    expect(
      (await publishTemplate("submittal", {}, "documentControl")).status,
    ).toBe(200);
    expect((await publishTemplate("submittal", {}, "manager")).status).toBe(
      403,
    );
    expect((await publishTemplate("submittal", {}, "contributor")).status).toBe(
      403,
    );
  });

  it("lets any authenticated member read templates", async () => {
    await publishTemplate("submittal");
    const asContributor = await invokeV2Api(
      "/api/v2/templates/submittal",
      request("contributor"),
      dependencies(),
    );
    expect(asContributor.status).toBe(200);
    const list = await invokeV2Api(
      "/api/v2/templates",
      request("contributor"),
      dependencies(),
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      data: [{ key: "submittal" }],
    });
  });

  it("keeps templates isolated per organization", async () => {
    await publishTemplate("submittal");
    const fromOrgB = await invokeV2Api(
      "/api/v2/templates/submittal",
      request("orgBAdmin"),
      dependencies(),
    );
    expect(fromOrgB.status).toBe(404);

    const orgBPublish = await publishTemplate("submittal", {}, "orgBAdmin");
    expect(orgBPublish.status).toBe(200);
    const orgBBody = await jsonData<ApiTemplate>(orgBPublish);

    const orgAAfter = await jsonData<ApiTemplate>(
      await invokeV2Api(
        "/api/v2/templates/submittal",
        request("admin"),
        dependencies(),
      ),
    );
    expect(orgAAfter.id).not.toBe(orgBBody.id);
    expect(orgAAfter.publishedVersion.versionNumber).toBe(1);
  });
});
