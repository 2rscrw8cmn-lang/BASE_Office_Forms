import { beforeEach, describe, expect, it } from "vitest";

import { ProjectService } from "../../src/application/projects/project-service";
import { DashboardReadModelService } from "../../src/application/read-models/dashboard-service";
import { ProjectOverviewReadModelService } from "../../src/application/read-models/project-overview-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { OrganizationService } from "../../src/application/identity/organization-service";
import { D1DashboardReadRepository } from "../../src/infrastructure/db/d1/dashboard-read-repository";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectOverviewReadRepository } from "../../src/infrastructure/db/d1/project-overview-read-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import type { V2RouteDependencies } from "../../src/http/v2/dependencies";
import { invokeV2Api } from "../helpers/api";
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
const contributor: AppSession = {
  userId: "user-contributor",
  organizationId: "org-a",
  membershipRole: "contributor",
  projectPermissions: [],
};
const otherOrgAdmin: AppSession = {
  userId: "user-b-admin",
  organizationId: "org-b",
  membershipRole: "org_admin",
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
      contributor,
      otherAdmin: otherOrgAdmin,
    }),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    dashboard: new DashboardReadModelService(
      projects,
      new D1DashboardReadRepository(database),
    ),
    projectOverview: new ProjectOverviewReadModelService(
      projects,
      new D1ProjectOverviewReadRepository(database),
    ),
  };
}

function request(session: string): RequestInit {
  return { method: "GET", headers: { "x-test-session": session } };
}

const SHA = "a".repeat(64);

async function seed(): Promise<void> {
  const db = testDatabase();
  const now = "2026-07-01T00:00:00Z";
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-a','Org A','org-a','active','{}',?,?)",
      )
      .bind(now, now),
    db
      .prepare(
        "INSERT INTO organizations (id, name, slug, status, settings_json, created_at, updated_at) VALUES ('org-b','Org B','org-b','active','{}',?,?)",
      )
      .bind(now, now),
    ...[
      ["user-admin", "org_admin", "org-a"],
      ["user-doc", "document_control_admin", "org-a"],
      ["user-manager", "project_manager", "org-a"],
      ["user-contributor", "contributor", "org-a"],
      ["user-viewer", "viewer", "org-a"],
      ["user-b-admin", "org_admin", "org-b"],
    ].flatMap(([id]) => [
      db
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES (?,?,?,?, 'active', ?, ?)",
        )
        .bind(id, `identity|${id}`, `${id}@example.test`, id, now, now),
    ]),
    ...[
      ["m-admin", "org-a", "user-admin", "org_admin"],
      ["m-doc", "org-a", "user-doc", "document_control_admin"],
      ["m-manager", "org-a", "user-manager", "project_manager"],
      ["m-contrib", "org-a", "user-contributor", "contributor"],
      ["m-viewer", "org-a", "user-viewer", "viewer"],
      ["m-b-admin", "org-b", "user-b-admin", "org_admin"],
    ].map(([id, org, user, role]) =>
      db
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?,?,?,?, 'active', ?)",
        )
        .bind(id, org, user, role, now),
    ),
  ]);

  // Projects.
  await db.batch(
    [
      ["proj-1", "org-a", "P-001", "Operations Center", "active"],
      ["proj-2", "org-a", "P-002", "Riverside Clinic", "planning"],
      ["proj-b", "org-b", "PB-001", "Other Tenant", "active"],
    ].map(([id, org, number, name, status]) =>
      db
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES (?,?,?,?,?, 'America/New_York', ?, ?)",
        )
        .bind(id, org, number, name, status, now, now),
    ),
  );

  // Project assignments: contributor/manager/viewer assigned to proj-1 only.
  await db.batch(
    [
      ["pm-manager", "org-a", "proj-1", "user-manager", "project_manager"],
      ["pm-contrib", "org-a", "proj-1", "user-contributor", "contributor"],
      ["pm-viewer", "org-a", "proj-1", "user-viewer", "viewer"],
    ].map(([id, org, project, user, role]) =>
      db
        .prepare(
          "INSERT INTO project_memberships (id, organization_id, project_id, user_id, role, status, created_at) VALUES (?,?,?,?,?, 'active', ?)",
        )
        .bind(id, org, project, user, role, now),
    ),
  );

  // Records.
  const record = (id: string, project: string, status: string, title: string) =>
    db
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, description, status, discipline, source, created_by, current_revision_id, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'drawing', ?, ?, NULL, ?, NULL, NULL, ?, NULL, ?, ?, ?)",
      )
      .bind(
        id,
        project === "proj-b" ? "org-b" : "org-a",
        project,
        `${id}-num`,
        title,
        status,
        project === "proj-b" ? "user-b-admin" : "user-admin",
        status === "archived" ? now : null,
        now,
        now,
      );
  await db.batch([
    record("rec-1", "proj-1", "active", "Foundation drawings"),
    record("rec-issued", "proj-1", "active", "Electrical drawings"),
    record("rec-nofile", "proj-1", "active", "Plumbing drawings"),
    record("rec-arch", "proj-1", "archived", "Archived drawings"),
    record("rec-2", "proj-2", "active", "Site drawings"),
    record("rec-b", "proj-b", "active", "Tenant drawings"),
  ]);

  // Revisions.
  const revision = (
    id: string,
    project: string,
    recordId: string,
    number: number,
    status: string,
    createdAt: string,
    title: string,
  ) =>
    db
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, revision_label, title, description, discipline, source, change_summary, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 'Initial', ?, 'user-admin', ?)",
      )
      .bind(
        id,
        project === "proj-b" ? "org-b" : "org-a",
        project,
        recordId,
        number,
        title,
        status,
        createdAt,
      );
  await db.batch([
    revision(
      "rev-draft",
      "proj-1",
      "rec-1",
      2,
      "draft",
      "2026-07-05T00:00:00Z",
      "Draft rev",
    ),
    revision(
      "rev-ready",
      "proj-1",
      "rec-1",
      1,
      "published",
      "2026-07-04T00:00:00Z",
      "Ready rev",
    ),
    revision(
      "rev-issued",
      "proj-1",
      "rec-issued",
      1,
      "published",
      "2026-07-03T00:00:00Z",
      "Issued rev",
    ),
    revision(
      "rev-nofile",
      "proj-1",
      "rec-nofile",
      1,
      "published",
      "2026-07-02T00:00:00Z",
      "No-file rev",
    ),
    revision(
      "rev-arch",
      "proj-1",
      "rec-arch",
      1,
      "draft",
      "2026-07-06T00:00:00Z",
      "Archived draft",
    ),
    revision(
      "rev-2",
      "proj-2",
      "rec-2",
      1,
      "published",
      "2026-07-05T00:00:00Z",
      "P2 rev",
    ),
  ]);

  // Files (rev-ready has a file; rev-issued has a file; rev-2 has a file).
  const file = (
    id: string,
    project: string,
    recordId: string,
    revisionId: string,
    uploadedAt: string,
    filename: string,
  ) =>
    db
      .prepare(
        "INSERT INTO revision_files (id, organization_id, project_id, record_id, revision_id, storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', 1024, ?, 'user-admin', ?)",
      )
      .bind(
        id,
        project === "proj-b" ? "org-b" : "org-a",
        project,
        recordId,
        revisionId,
        `storage/${id}`,
        filename,
        SHA,
        uploadedAt,
      );
  await db.batch([
    file(
      "file-ready",
      "proj-1",
      "rec-1",
      "rev-ready",
      "2026-07-20T00:00:00Z",
      "ready.pdf",
    ),
    file(
      "file-issued",
      "proj-1",
      "rec-issued",
      "rev-issued",
      "2026-07-18T00:00:00Z",
      "issued.pdf",
    ),
    file(
      "file-2",
      "proj-2",
      "rec-2",
      "rev-2",
      "2026-07-19T00:00:00Z",
      "p2.pdf",
    ),
  ]);

  // Issuance on rev-issued (so it is excluded from ready-to-issue).
  await db.batch([
    db.prepare(
      "INSERT INTO issuances (id, organization_id, project_id, record_id, revision_id, issue_number, issue_sequence, purpose, notes, revision_snapshot_json, issued_by, issued_at, correlation_id) VALUES ('iss-1','org-a','proj-1','rec-issued','rev-issued','ISS-001',1,'for_construction',NULL,'{\"revision\":\"snapshot\"}','user-admin','2026-07-21T00:00:00Z','corr-1')",
    ),
    db
      .prepare(
        "INSERT INTO issuance_files (issuance_id, organization_id, project_id, record_id, revision_id, file_id, original_filename, media_type, byte_size, sha256, storage_key, display_order) VALUES ('iss-1','org-a','proj-1','rec-issued','rev-issued','file-issued','issued.pdf','application/pdf',1024,?, 'storage/file-issued', 0)",
      )
      .bind(SHA),
  ]);

  // RFIs on proj-1.
  const rfi = (
    id: string,
    project: string,
    status: string,
    dueDate: string | null,
    createdAt: string,
  ) => {
    const organizationId = project === "proj-b" ? "org-b" : "org-a";
    return [
      db
        .prepare(
          "INSERT INTO records (id, organization_id, project_id, record_type, record_type_key, record_number, title, status, workflow_status, created_by, issued_at, returned_at, due_date, created_at, updated_at) VALUES (?, ?, ?, 'other', 'rfi', ?, ?, 'active', ?, 'user-admin', ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          organizationId,
          project,
          status === "draft" ? null : `RFI-${id}`,
          `${id} title`,
          status,
          status === "draft" ? null : createdAt,
          status === "response_received" ? createdAt : null,
          dueDate,
          createdAt,
          createdAt,
        ),
      db
        .prepare(
          "INSERT INTO rfi_details (record_id, organization_id, project_id, question, issuance_reconciliation_state) VALUES (?, ?, ?, 'Q', 'not_issued')",
        )
        .bind(id, organizationId, project),
    ];
  };
  await db.batch([
    ...rfi(
      "rfi-issued",
      "proj-1",
      "open",
      "2026-07-25",
      "2026-07-10T00:00:00Z",
    ),
    ...rfi(
      "rfi-answered",
      "proj-1",
      "response_received",
      null,
      "2026-07-09T00:00:00Z",
    ),
    ...rfi("rfi-draft", "proj-1", "draft", null, "2026-07-08T00:00:00Z"),
    ...rfi("rfi-closed", "proj-1", "closed", null, "2026-07-07T00:00:00Z"),
    ...rfi("rfi-2", "proj-2", "open", null, "2026-07-06T00:00:00Z"),
  ]);

  // Activity events: proj-1 (record + revision), proj-2, and cross-tenant proj-b.
  const activity = (
    id: string,
    org: string,
    objectType: string,
    objectId: string,
    action: string,
    createdAt: string,
  ) =>
    db
      .prepare(
        "INSERT INTO activity_events (id, organization_id, actor_user_id, actor_type, object_type, object_id, action, prior_state_json, new_state_json, metadata_json, correlation_id, created_at) VALUES (?, ?, 'user-admin', 'user', ?, ?, ?, '{\"secret\":\"prior\"}', '{\"secret\":\"new\"}', '{\"secret\":\"meta\"}', 'corr', ?)",
      )
      .bind(id, org, objectType, objectId, action, createdAt);
  await db.batch([
    activity(
      "evt-rec",
      "org-a",
      "record",
      "rec-1",
      "record.created",
      "2026-07-11T00:00:00Z",
    ),
    activity(
      "evt-rev",
      "org-a",
      "revision",
      "rev-ready",
      "revision.published",
      "2026-07-12T00:00:00Z",
    ),
    activity(
      "evt-proj",
      "org-a",
      "project",
      "proj-1",
      "project.created",
      "2026-07-01T00:00:00Z",
    ),
    activity(
      "evt-p2",
      "org-a",
      "record",
      "rec-2",
      "record.created",
      "2026-07-13T00:00:00Z",
    ),
    activity(
      "evt-b",
      "org-b",
      "record",
      "rec-b",
      "record.created",
      "2026-07-14T00:00:00Z",
    ),
  ]);
}

async function dashboardFor(session: string) {
  const response = await invokeV2Api(
    "/api/v2/dashboard",
    request(session),
    dependencies(),
  );
  expect(response.status).toBe(200);
  const body: { data: Record<string, unknown> } = await response.json();
  return body.data;
}

async function overviewFor(session: string, projectId: string) {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/overview`,
    request(session),
    dependencies(),
  );
  return response;
}

describe("dashboard read model", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("scopes org_admin and document_control_admin to every project in the organization", async () => {
    for (const session of ["admin", "documentControl"]) {
      const data = await dashboardFor(session);
      const summary = data.summary as Record<string, number>;
      expect(summary.accessibleProjectCount).toBe(2);
      // rev-draft (proj-1) is the only non-archived draft in the org.
      expect(summary.draftRevisionCount).toBe(1);
      // rev-ready (proj-1) and rev-2 (proj-2) are ready; rev-issued excluded.
      expect(summary.readyToIssueCount).toBe(2);
      // issued + answered across proj-1 and rfi-2 (proj-2, issued).
      expect(summary.activeRfiCount).toBe(3);
    }
  });

  it("limits assigned contributors to their assigned projects only", async () => {
    const data = await dashboardFor("contributor");
    const summary = data.summary as Record<string, number>;
    expect(summary.accessibleProjectCount).toBe(1);
    expect(summary.readyToIssueCount).toBe(1); // proj-1 only, not proj-2
    const ready = data.readyToIssue as Array<Record<string, string>>;
    expect(ready.every((item) => item.projectId === "proj-1")).toBe(true);
    const rfis = data.activeRfis as Array<Record<string, string>>;
    expect(rfis.every((item) => item.projectId === "proj-1")).toBe(true);
  });

  it("isolates tenants so another organization's work never appears", async () => {
    const data = await dashboardFor("otherAdmin");
    const summary = data.summary as Record<string, number>;
    expect(summary.accessibleProjectCount).toBe(1);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("proj-1");
    expect(serialized).not.toContain("proj-2");
    expect(serialized).not.toContain("rec-1");
    expect(serialized).not.toContain("rfi-issued");
  });

  it("applies the draft, ready-to-issue, and active-RFI definitions correctly", async () => {
    const data = await dashboardFor("admin");
    const drafts = data.draftRevisions as Array<Record<string, string>>;
    expect(drafts.map((item) => item.revisionId)).toEqual(["rev-draft"]);

    const ready = data.readyToIssue as Array<Record<string, unknown>>;
    const readyIds = ready.map((item) => item.revisionId);
    expect(readyIds).toContain("rev-ready");
    expect(readyIds).toContain("rev-2");
    expect(readyIds).not.toContain("rev-issued"); // already issued
    expect(readyIds).not.toContain("rev-nofile"); // no file
    const readyRow = ready.find((item) => item.revisionId === "rev-ready");
    expect(readyRow?.fileCount).toBe(1);

    const rfis = data.activeRfis as Array<Record<string, string>>;
    const rfiStatuses = new Set(rfis.map((item) => item.status));
    expect([...rfiStatuses].sort()).toEqual(["open", "response_received"]);
  });

  it("orders active RFIs by due date first and applies limits without pagination", async () => {
    const data = await dashboardFor("admin");
    const rfis = data.activeRfis as Array<Record<string, string | null>>;
    // rfi-issued has the only due date, so it must sort first.
    expect(rfis[0].rfiId).toBe("rfi-issued");
    expect((data.recentFiles as unknown[]).length).toBeLessThanOrEqual(5);
    expect((data.recentIssuances as unknown[]).length).toBeLessThanOrEqual(5);
  });

  it("never exposes storage keys or raw state JSON", async () => {
    const serialized = JSON.stringify(await dashboardFor("admin"));
    expect(serialized).not.toContain("storage/");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("revision_snapshot_json");
  });
});

describe("project overview read model", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("returns project-scoped counts for an authorized project", async () => {
    const response = await overviewFor("admin", "proj-1");
    expect(response.status).toBe(200);
    const body: { data: Record<string, unknown> } = await response.json();
    const counts = body.data.counts as Record<string, number>;
    expect(counts.records).toBe(7); // 3 document records plus 4 active RFI records (rec-arch excluded)
    expect(counts.draftRevisions).toBe(1); // rev-draft (rev-arch excluded)
    expect(counts.publishedRevisions).toBe(3); // rev-ready, rev-issued, rev-nofile
    expect(counts.files).toBe(2);
    expect(counts.issuances).toBe(1);
    expect(counts.activeRfis).toBe(2);
    expect(counts.teamMembers).toBe(3);
  });

  it("scopes recent activity to the project and hides raw state JSON", async () => {
    const response = await overviewFor("admin", "proj-1");
    const body: { data: Record<string, unknown> } = await response.json();
    const events = body.data.recentActivity as Array<Record<string, string>>;
    const objectIds = events.map((event) => event.objectId);
    expect(objectIds).toContain("rec-1");
    expect(objectIds).toContain("rev-ready");
    expect(objectIds).toContain("proj-1");
    expect(objectIds).not.toContain("rec-2"); // different project
    expect(objectIds).not.toContain("rec-b"); // different tenant
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("prior_state_json");
  });

  it("matches dashboard attention definitions within the project", async () => {
    const response = await overviewFor("admin", "proj-1");
    const body: { data: Record<string, unknown> } = await response.json();
    const attention = body.data.attention as Record<
      string,
      Array<Record<string, unknown>>
    >;
    expect(attention.draftRevisions.map((item) => item.revisionId)).toEqual([
      "rev-draft",
    ]);
    expect(attention.readyToIssue.map((item) => item.revisionId)).toEqual([
      "rev-ready",
    ]);
    expect(attention.activeRfis.length).toBe(2);
  });

  it("conceals a cross-tenant project behind a generic not-found", async () => {
    const response = await overviewFor("admin", "proj-b");
    expect(response.status).toBe(404);
    const body: { error: { code: string } } = await response.json();
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("hides an unassigned project from a restricted role", async () => {
    const response = await overviewFor("contributor", "proj-2");
    expect(response.status).toBe(404);
  });
});
