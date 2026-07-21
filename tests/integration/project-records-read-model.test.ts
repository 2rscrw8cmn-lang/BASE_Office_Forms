import { beforeEach, describe, expect, it } from "vitest";

import { OrganizationService } from "../../src/application/identity/organization-service";
import { ProjectService } from "../../src/application/projects/project-service";
import { RecordService } from "../../src/application/records/record-service";
import { ProjectRecordsReadModelService } from "../../src/application/read-models/project-records-service";
import type {
  AppSession,
  AuthenticationAdapter,
  AuthenticationResult,
} from "../../src/auth/authentication-adapter";
import { D1MembershipsRepository } from "../../src/infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../src/infrastructure/db/d1/organizations-repository";
import { D1ProjectMembershipsRepository } from "../../src/infrastructure/db/d1/project-memberships-repository";
import { D1ProjectRecordsReadRepository } from "../../src/infrastructure/db/d1/project-records-read-repository";
import { D1ProjectsRepository } from "../../src/infrastructure/db/d1/projects-repository";
import { D1RecordsRepository } from "../../src/infrastructure/db/d1/records-repository";
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
  otherAdmin: {
    userId: "user-b-admin",
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
  const projects = new ProjectService(
    new D1ProjectsRepository(database),
    new D1ProjectMembershipsRepository(database),
  );
  return {
    authenticationAdapter: new FixtureAuthenticationAdapter(),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(database),
      new D1MembershipsRepository(database),
    ),
    projects,
    records: new RecordService(projects, new D1RecordsRepository(database)),
    projectRecords: new ProjectRecordsReadModelService(
      projects,
      new D1ProjectRecordsReadRepository(database),
    ),
  };
}

function request(session: string): RequestInit {
  return { method: "GET", headers: { "x-test-session": session } };
}

interface RevisionSummary {
  id: string;
  revisionNumber: number;
  revisionLabel: string | null;
  status: string;
  title: string;
}
interface RecordSummary {
  id: string;
  recordNumber: string | null;
  title: string;
  recordType: string;
  discipline: string | null;
  status: string;
  currentRevision: RevisionSummary | null;
  hasDraftRevision: boolean;
  draftRevisionId: string | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
  capabilities: { update: boolean; archive: boolean };
}
interface ListBody {
  data: {
    records: RecordSummary[];
    capabilities: { createRecord: boolean };
  };
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
      ["user-manager", "project_manager", "org-a"],
      ["user-contributor", "contributor", "org-a"],
      ["user-viewer", "viewer", "org-a"],
      ["user-b-admin", "org_admin", "org-b"],
    ].flatMap(([id, role, org]) => [
      db
        .prepare(
          "INSERT INTO users (id, identity_subject, email, display_name, status, created_at, updated_at) VALUES (?,?,?,?, 'active', ?, ?)",
        )
        .bind(id, `identity|${id}`, `${id}@example.test`, id, now, now),
      db
        .prepare(
          "INSERT INTO organization_memberships (id, organization_id, user_id, role, status, created_at) VALUES (?,?,?,?, 'active', ?)",
        )
        .bind(`m-${id}`, org, id, role, now),
    ]),
  ]);

  await db.batch(
    [
      ["proj-1", "org-a", "P-001", "Operations Center", "active"],
      ["proj-2", "org-a", "P-002", "Riverside Clinic", "active"],
      ["proj-b", "org-b", "PB-001", "Other Tenant", "active"],
    ].map(([id, org, number, name, status]) =>
      db
        .prepare(
          "INSERT INTO projects (id, organization_id, project_number, name, status, timezone, created_at, updated_at) VALUES (?,?,?,?,?, 'America/New_York', ?, ?)",
        )
        .bind(id, org, number, name, status, now, now),
    ),
  );

  // Assign the project manager, contributor, and viewer to proj-1 only.
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

  // Records. `current_revision_id` is set explicitly where a record has a
  // current published revision. Created-at values are staggered to prove
  // deterministic newest-first ordering.
  const record = (
    id: string,
    org: string,
    project: string,
    number: string | null,
    title: string,
    status: string,
    discipline: string | null,
    currentRevisionId: string | null,
    createdAt: string,
  ) =>
    db
      .prepare(
        "INSERT INTO records (id, organization_id, project_id, record_type, record_number, title, description, status, discipline, source, created_by, current_revision_id, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'drawing', ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        org,
        project,
        number,
        title,
        status,
        discipline,
        org === "org-b" ? "user-b-admin" : "user-admin",
        currentRevisionId,
        status === "archived" ? createdAt : null,
        createdAt,
        createdAt,
      );

  await db.batch([
    record(
      "rec-current",
      "org-a",
      "proj-1",
      "A-101",
      "Floor Plan",
      "active",
      "Architecture",
      null,
      "2026-07-05T00:00:00Z",
    ),
    record(
      "rec-none",
      "org-a",
      "proj-1",
      null,
      "Uncontrolled Sketch",
      "active",
      null,
      null,
      "2026-07-04T00:00:00Z",
    ),
    record(
      "rec-twodrafts",
      "org-a",
      "proj-1",
      "A-200",
      "Multi Draft",
      "active",
      "Structural",
      null,
      "2026-07-03T00:00:00Z",
    ),
    record(
      "rec-archived",
      "org-a",
      "proj-1",
      "A-900",
      "Old Plan",
      "archived",
      "Architecture",
      null,
      "2026-07-02T00:00:00Z",
    ),
    record(
      "rec-2",
      "org-a",
      "proj-2",
      "B-101",
      "Other Project Record",
      "active",
      null,
      null,
      "2026-07-05T00:00:00Z",
    ),
    record(
      "rec-b",
      "org-b",
      "proj-b",
      "C-101",
      "Tenant Record",
      "active",
      null,
      null,
      "2026-07-05T00:00:00Z",
    ),
  ]);

  // Revisions. rec-current has a lower-numbered PUBLISHED revision that is the
  // authoritative current revision, plus a HIGHER-numbered draft — so a naive
  // "highest revision number" heuristic would pick the wrong one.
  const revision = (
    id: string,
    org: string,
    project: string,
    recordId: string,
    number: number,
    status: string,
    title: string,
  ) =>
    db
      .prepare(
        "INSERT INTO record_revisions (id, organization_id, project_id, record_id, revision_number, revision_label, title, description, discipline, source, change_summary, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 'Initial', ?, ?, ?)",
      )
      .bind(
        id,
        org,
        project,
        recordId,
        number,
        title,
        status,
        org === "org-b" ? "user-b-admin" : "user-admin",
        "2026-07-05T00:00:00Z",
      );

  await db.batch([
    revision(
      "rev-pub",
      "org-a",
      "proj-1",
      "rec-current",
      1,
      "published",
      "Published rev",
    ),
    revision(
      "rev-draft",
      "org-a",
      "proj-1",
      "rec-current",
      2,
      "draft",
      "Draft rev",
    ),
    revision(
      "rev-d1",
      "org-a",
      "proj-1",
      "rec-twodrafts",
      1,
      "draft",
      "Draft one",
    ),
    revision(
      "rev-d2",
      "org-a",
      "proj-1",
      "rec-twodrafts",
      2,
      "draft",
      "Draft two",
    ),
    revision("rev-2", "org-a", "proj-2", "rec-2", 1, "published", "P2 rev"),
  ]);

  // Point rec-current at its authoritative current (published) revision now
  // that the revision row exists to satisfy the foreign key.
  await db
    .prepare(
      "UPDATE records SET current_revision_id = 'rev-pub' WHERE id = 'rec-current'",
    )
    .run();

  // Files: two on rec-current (one per revision), one on proj-2's record. The
  // file count for rec-current must be exactly two and must not leak proj-2.
  const file = (
    id: string,
    org: string,
    project: string,
    recordId: string,
    revisionId: string,
  ) =>
    db
      .prepare(
        "INSERT INTO revision_files (id, organization_id, project_id, record_id, revision_id, storage_key, original_filename, media_type, byte_size, sha256, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', 1024, ?, ?, ?)",
      )
      .bind(
        id,
        org,
        project,
        recordId,
        revisionId,
        `storage/${id}`,
        `${id}.pdf`,
        SHA,
        org === "org-b" ? "user-b-admin" : "user-admin",
        "2026-07-05T00:00:00Z",
      );

  await db.batch([
    file("file-a", "org-a", "proj-1", "rec-current", "rev-pub"),
    file("file-b", "org-a", "proj-1", "rec-current", "rev-draft"),
    file("file-2", "org-a", "proj-2", "rec-2", "rev-2"),
  ]);
}

async function listRecords(
  session: string,
  projectId = "proj-1",
  query = "",
): Promise<{ status: number; body: ListBody }> {
  const response = await invokeV2Api(
    `/api/v2/projects/${projectId}/records${query}`,
    request(session),
    dependencies(),
  );
  const raw: unknown = await response.json();
  return { status: response.status, body: raw as ListBody };
}

describe("project records list read model", () => {
  beforeEach(async () => {
    await resetIdentityFoundation();
    await seed();
  });

  it("returns accurate summaries with the authoritative current revision and deterministic order", async () => {
    const { status, body } = await listRecords("admin");
    expect(status).toBe(200);
    // Active only, newest created first.
    expect(body.data.records.map((r) => r.id)).toEqual([
      "rec-current",
      "rec-none",
      "rec-twodrafts",
    ]);
    expect(body.data.capabilities).toEqual({ createRecord: true });

    const current = body.data.records[0];
    expect(current.currentRevision).toEqual({
      id: "rev-pub",
      revisionNumber: 1,
      revisionLabel: null,
      status: "published",
      title: "Published rev",
    });
    expect(current.hasDraftRevision).toBe(true);
    expect(current.draftRevisionId).toBe("rev-draft");
    expect(current.fileCount).toBe(2);
    expect(current.capabilities).toEqual({ update: true, archive: true });
  });

  it("returns a null current revision when no current revision is set", async () => {
    const { body } = await listRecords("admin");
    const none = body.data.records.find((r) => r.id === "rec-none");
    expect(none?.currentRevision).toBeNull();
    expect(none?.hasDraftRevision).toBe(false);
    expect(none?.draftRevisionId).toBeNull();
    expect(none?.fileCount).toBe(0);
  });

  it("reports draft presence but withholds a draft id when the invariant is violated", async () => {
    const { body } = await listRecords("admin");
    const two = body.data.records.find((r) => r.id === "rec-twodrafts");
    expect(two?.hasDraftRevision).toBe(true);
    // Two drafts exist for this record: presence is reported, but no single
    // draft is silently chosen.
    expect(two?.draftRevisionId).toBeNull();
  });

  it("excludes archived records by default and includes them on request as read-only", async () => {
    const active = await listRecords("admin");
    expect(active.body.data.records.map((r) => r.id)).not.toContain(
      "rec-archived",
    );

    const all = await listRecords("admin", "proj-1", "?includeArchived=true");
    const archived = all.body.data.records.find((r) => r.id === "rec-archived");
    expect(archived?.status).toBe("archived");
    // Archived records are read-only regardless of management rights.
    expect(archived?.capabilities).toEqual({ update: false, archive: false });
  });

  it("scopes records, revisions, and files to the requested project and organization", async () => {
    const { body } = await listRecords("admin");
    const ids = body.data.records.map((r) => r.id);
    expect(ids).not.toContain("rec-2"); // other project
    expect(ids).not.toContain("rec-b"); // other tenant
    // proj-2's file must never inflate rec-current's count.
    expect(body.data.records[0].fileCount).toBe(2);

    // org-a admin cannot see another tenant's project at all.
    const crossTenant = await invokeV2Api(
      "/api/v2/projects/proj-b/records",
      request("admin"),
      dependencies(),
    );
    expect(crossTenant.status).toBe(404);
  });

  it("derives capabilities from the authoritative record policy", async () => {
    const manager = await listRecords("manager");
    expect(manager.body.data.capabilities.createRecord).toBe(true);
    expect(manager.body.data.records[0].capabilities).toEqual({
      update: true,
      archive: true,
    });

    for (const role of ["contributor", "viewer"]) {
      const readOnly = await listRecords(role);
      expect(readOnly.status).toBe(200);
      expect(readOnly.body.data.records.length).toBeGreaterThan(0);
      expect(readOnly.body.data.capabilities.createRecord).toBe(false);
      expect(readOnly.body.data.records[0].capabilities).toEqual({
        update: false,
        archive: false,
      });
    }
  });

  it("hides records from unassigned restricted users and other tenants", async () => {
    // The contributor is only assigned to proj-1, so proj-2 is not found.
    const unassigned = await invokeV2Api(
      "/api/v2/projects/proj-2/records",
      request("contributor"),
      dependencies(),
    );
    expect(unassigned.status).toBe(404);

    // An org-b admin sees org-b projects but never org-a records.
    const otherTenant = await invokeV2Api(
      "/api/v2/projects/proj-1/records",
      request("otherAdmin"),
      dependencies(),
    );
    expect(otherTenant.status).toBe(404);
  });
});
