import { describe, expect, it } from "vitest";
import * as legacy from "../../public/app-routing.js";
import {
  canViewAdministration,
  featureDescriptor,
  isApplicationPath,
  normalizePathname,
  resolveRoute,
  type ResolvedRoute,
  type RouteResolution,
} from "../../src/ui/app/routing";

// The typed React route map (src/ui/app/routing.ts) must resolve every
// canonical URL identically to the legacy shell's route table
// (public/app-routing.js), which remains the source of truth. This test
// enforces that parity so the two cannot drift as the shell migrates.

const CANONICAL_PATHS = [
  "/",
  "/dashboard",
  "/projects",
  "/admin",
  "/projects/p1",
  "/projects/p1/overview",
  "/projects/p1/records",
  "/projects/p1/records/r1",
  "/projects/p1/records/r1/revisions/v1",
  "/projects/p1/records/r1/revisions/v1/issue",
  "/projects/p1/issuances",
  "/projects/p1/issuances/i1",
  "/projects/p1/issuances/i1/created",
  "/projects/p1/rfis",
  "/projects/p1/rfis/q1",
  "/projects/p1/team",
  // descendants and edge cases
  "/projects/a%20b/overview",
  "/projects/p1/records/r1/",
  "/dashboard/",
  "/nope",
  "/projects/p1/nonsense",
  "/api/v2/session",
  "/assets/base-logo.svg",
];

const COMPARED_FIELDS = [
  "redirectTo",
  "id",
  "title",
  "eyebrow",
  "description",
  "globalSection",
  "projectTab",
  "requiresAdministration",
  "pathname",
  "params",
  "surface",
  "placeholderNote",
] as const;

function pick(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of COMPARED_FIELDS) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}

describe("React shell routing parity with the legacy route table", () => {
  for (const path of CANONICAL_PATHS) {
    it(`resolves ${path} identically to the legacy shell`, () => {
      const legacyRoute = legacy.resolveRoute(path) as unknown;
      const reactRoute: RouteResolution | null = resolveRoute(path);
      expect(pick(reactRoute)).toEqual(pick(legacyRoute));
    });
  }

  it("normalizes trailing slashes and the root like the legacy shell", () => {
    expect(normalizePathname("/dashboard/")).toBe("/dashboard");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/projects/p1/records//")).toBe(
      "/projects/p1/records",
    );
  });

  it("classifies API and static asset paths as non-application", () => {
    expect(isApplicationPath("/api/v2/session")).toBe(false);
    expect(isApplicationPath("/assets/base-logo.svg")).toBe(false);
    expect(isApplicationPath("/dashboard")).toBe(true);
    expect(isApplicationPath("/projects/p1/records")).toBe(true);
  });

  it("gates Administration to org_admin exactly like the legacy shell", () => {
    for (const role of [
      "org_admin",
      "document_control_admin",
      "project_manager",
      "contributor",
      "viewer",
      undefined,
    ]) {
      expect(canViewAdministration(role)).toBe(
        legacy.canViewAdministration(role ?? ""),
      );
    }
  });

  it("selects the parent project tab for descendant routes", () => {
    const recordDetail = resolveRoute(
      "/projects/p1/records/r1",
    ) as ResolvedRoute;
    expect(recordDetail.projectTab).toBe("records");
    const revision = resolveRoute(
      "/projects/p1/records/r1/revisions/v1",
    ) as ResolvedRoute;
    expect(revision.projectTab).toBe("records");
    const issuanceCreated = resolveRoute(
      "/projects/p1/issuances/i1/created",
    ) as ResolvedRoute;
    expect(issuanceCreated.projectTab).toBe("issuances");
  });

  it("maps only built feature routes to a mount descriptor", () => {
    const overview = resolveRoute("/projects/p1/overview") as ResolvedRoute;
    expect(featureDescriptor(overview)).toEqual({
      key: "overview:p1",
      kind: "overview",
      projectId: "p1",
    });
    const revision = resolveRoute(
      "/projects/p1/records/r1/revisions/v1",
    ) as ResolvedRoute;
    expect(featureDescriptor(revision)).toEqual({
      key: "revision-detail:p1:r1:v1",
      kind: "revision-detail",
      projectId: "p1",
      recordId: "r1",
      revisionId: "v1",
    });
    // A route without a built feature (team) mounts no controller.
    const team = resolveRoute("/projects/p1/team") as ResolvedRoute;
    expect(featureDescriptor(team)).toBeNull();
  });
});
