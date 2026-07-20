import { beforeEach, describe, expect, it } from "vitest";

import { MembershipService } from "../../src/application/identity/membership-service";
import { OrganizationService } from "../../src/application/identity/organization-service";
import { SessionResolutionService } from "../../src/application/identity/session-resolution-service";
import {
  CloudflareAccessAuthenticationAdapter,
  type CloudflareAccessIdentityVerifier,
} from "../../src/auth/cloudflare-access-adapter";
import type { AppSession } from "../../src/auth/authentication-adapter";
import { AuthorizationError } from "../../src/domain/identity/authorization";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1UsersRepository } from "../../src/infrastructure/db/d1/users-repository";
import type { V2RouteDependencies } from "../../src/http/v2/dependencies";
import { invokeV2Api } from "../helpers/api";
import { resetIdentityFoundation, testDatabase } from "../helpers/d1";

const ACCESS_CONFIGURATION = {
  teamDomain: "https://base.cloudflareaccess.com",
  audience: "test-audience",
};

class FixtureAccessVerifier implements CloudflareAccessIdentityVerifier {
  verify(request: Request) {
    if (request.headers.get("cf-access-jwt-assertion") !== "verified-alice") {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      subject: "access|alice",
      email: "alice@base.example",
      displayName: "Alice Admin",
    });
  }
}

function makeDependencies(): V2RouteDependencies {
  const database = testDatabase();
  const users = new D1UsersRepository(database);
  const memberships = new D1MembershipsRepository(database);
  const sessions = new SessionResolutionService(users, memberships);
  return {
    authenticationAdapter: new CloudflareAccessAuthenticationAdapter(
      sessions,
      new FixtureAccessVerifier(),
      ACCESS_CONFIGURATION,
    ),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      memberships,
    ),
  };
}

async function seedFoundation(): Promise<{
  alice: AppSession;
  bobUserId: string;
}> {
  const database = testDatabase();
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at)
         VALUES (?, ?, ?, 'active', '{}', ?, ?)`,
      )
      .bind("org-a", "Organization A", "organization-a", now, now),
    database
      .prepare(
        `INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at)
         VALUES (?, ?, ?, 'active', '{}', ?, ?)`,
      )
      .bind("org-b", "Organization B", "organization-b", now, now),
  ]);

  const users = new D1UsersRepository(database);
  const memberships = new D1MembershipsRepository(database);
  const alice = await users.upsertExternalIdentity({
    subject: "access|alice",
    email: "alice@base.example",
    displayName: "Alice Admin",
  });
  const bob = await users.upsertExternalIdentity({
    subject: "access|bob",
    email: "bob@other.example",
    displayName: "Bob Other Tenant",
  });
  await memberships.create({
    organizationId: "org-a",
    userId: alice.id,
    role: "org_admin",
  });
  await memberships.create({
    organizationId: "org-b",
    userId: bob.id,
    role: "viewer",
  });
  return {
    alice: {
      userId: alice.id,
      organizationId: "org-a",
      membershipRole: "org_admin",
      projectPermissions: [],
    },
    bobUserId: bob.id,
  };
}

describe("identity and tenant foundation", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
  });

  it("resolves a verified Access identity to one application user and active membership", async () => {
    const { alice } = await seedFoundation();
    const response = await invokeV2Api(
      "/api/v2/session",
      {
        headers: {
          "cf-access-jwt-assertion": "verified-alice",
          "cf-access-authenticated-user-email": "attacker@other.example",
        },
      },
      makeDependencies(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        user: { id: alice.userId },
        organization: { id: "org-a", name: "Organization A" },
        membership: { role: "org_admin" },
      },
    });
  });

  it("derives the organization solely from the authenticated membership", async () => {
    await seedFoundation();
    const dependencies = makeDependencies();
    const headers = {
      "cf-access-jwt-assertion": "verified-alice",
      "x-organization-id": "org-b",
    };

    const organization = await invokeV2Api(
      "/api/v2/organizations/current?organizationId=org-b",
      { headers },
      dependencies,
    );
    expect(organization.status).toBe(200);
    await expect(organization.json()).resolves.toMatchObject({
      data: { id: "org-a", name: "Organization A" },
    });

    const members = await invokeV2Api(
      "/api/v2/members?organizationId=org-b",
      { headers },
      dependencies,
    );
    expect(members.status).toBe(200);
    const memberBody = await members.json();
    expect(memberBody).toMatchObject({
      data: [
        {
          email: "alice@base.example",
          role: "org_admin",
        },
      ],
    });
    expect(JSON.stringify(memberBody)).not.toContain("bob@other.example");
  });

  it("returns stable authentication and membership errors", async () => {
    await seedFoundation();
    const dependencies = makeDependencies();

    const unauthenticated = await invokeV2Api(
      "/api/v2/session",
      {},
      dependencies,
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const invalid = await invokeV2Api(
      "/api/v2/session",
      { headers: { "cf-access-jwt-assertion": "forged" } },
      dependencies,
    );
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const database = testDatabase();
    const users = new D1UsersRepository(database);
    await users.upsertExternalIdentity({
      subject: "access|unassigned",
      email: "unassigned@base.example",
      displayName: "Unassigned User",
    });
    const unassignedAdapter = new CloudflareAccessAuthenticationAdapter(
      new SessionResolutionService(
        users,
        new D1MembershipsRepository(database),
      ),
      {
        verify() {
          return Promise.resolve({
            subject: "access|unassigned",
            email: "unassigned@base.example",
            displayName: "Unassigned User",
          });
        },
      },
      ACCESS_CONFIGURATION,
    );
    const unassigned = await invokeV2Api(
      "/api/v2/session",
      { headers: { "cf-access-jwt-assertion": "verified-unassigned" } },
      { ...dependencies, authenticationAdapter: unassignedAdapter },
    );
    expect(unassigned.status).toBe(403);
    await expect(unassigned.json()).resolves.toMatchObject({
      error: { code: "MEMBERSHIP_REQUIRED" },
    });

    await database
      .prepare(
        "UPDATE organization_memberships SET status = 'disabled' WHERE organization_id = ?",
      )
      .bind("org-a")
      .run();
    const inactiveMembership = await invokeV2Api(
      "/api/v2/session",
      { headers: { "cf-access-jwt-assertion": "verified-alice" } },
      dependencies,
    );
    expect(inactiveMembership.status).toBe(403);
    await expect(inactiveMembership.json()).resolves.toMatchObject({
      error: { code: "MEMBERSHIP_INACTIVE" },
    });
  });

  it("requires organization selection when a user has multiple active memberships", async () => {
    await seedFoundation();
    const database = testDatabase();
    const users = new D1UsersRepository(database);
    const memberships = new D1MembershipsRepository(database);
    const alice = await users.upsertExternalIdentity({
      subject: "access|alice",
      email: "alice@base.example",
      displayName: "Alice Admin",
    });
    await memberships.create({
      organizationId: "org-b",
      userId: alice.id,
      role: "viewer",
    });

    const response = await invokeV2Api(
      "/api/v2/session",
      { headers: { "cf-access-jwt-assertion": "verified-alice" } },
      makeDependencies(),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORGANIZATION_SELECTION_REQUIRED" },
    });
  });

  it("allows only org admins to create memberships and appends an immutable activity event", async () => {
    const { alice, bobUserId } = await seedFoundation();
    const database = testDatabase();
    const service = new MembershipService(
      new D1MembershipsRepository(database),
    );

    await expect(
      service.addMember(
        { ...alice, membershipRole: "contributor" },
        { userId: bobUserId, role: "viewer", correlationId: "req_denied" },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const membership = await service.addMember(alice, {
      userId: bobUserId,
      role: "viewer",
      correlationId: "req_membership_created",
    });
    expect(membership.organizationId).toBe("org-a");

    const event = await database
      .prepare(
        "SELECT action, organization_id, object_id FROM activity_events WHERE correlation_id = ?",
      )
      .bind("req_membership_created")
      .first<{ action: string; organization_id: string; object_id: string }>();
    expect(event).toEqual({
      action: "membership.created",
      organization_id: "org-a",
      object_id: membership.id,
    });
    await expect(
      database.prepare("UPDATE activity_events SET action = 'changed'").run(),
    ).rejects.toThrow(/append-only/);
  });
});
