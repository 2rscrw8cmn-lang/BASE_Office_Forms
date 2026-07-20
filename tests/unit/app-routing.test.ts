import { describe, expect, it } from "vitest";
import {
  canViewAdministration,
  isApplicationPath,
  resolveRoute,
} from "../../public/app-routing.js";

describe("application routing", () => {
  it("redirects the root to the dashboard", () => {
    expect(resolveRoute("/")).toEqual({ redirectTo: "/dashboard" });
  });

  it("resolves global and legacy tool adapter routes", () => {
    expect(resolveRoute("/dashboard")?.id).toBe("dashboard");
    expect(resolveRoute("/projects")?.id).toBe("projects");
    expect(resolveRoute("/tools/forms")?.surface).toBe("forms-tool");
    expect(resolveRoute("/tools/library")?.surface).toBe("library-tool");
    expect(resolveRoute("/tools/document-library")?.surface).toBe(
      "library-tool",
    );
  });

  it("keeps record descendants on Records", () => {
    expect(
      resolveRoute("/projects/project-a/records/record-a")?.projectTab,
    ).toBe("records");
    expect(
      resolveRoute(
        "/projects/project-a/records/record-a/revisions/revision-a/issue",
      )?.projectTab,
    ).toBe("records");
  });

  it("keeps issuance descendants on Issuances", () => {
    expect(
      resolveRoute("/projects/project-a/issuances/issuance-a")?.projectTab,
    ).toBe("issuances");
  });

  it("requires the organization administration role", () => {
    expect(canViewAdministration("org_admin")).toBe(true);
    expect(canViewAdministration("document_control_admin")).toBe(false);
    expect(canViewAdministration("project_manager")).toBe(false);
    expect(canViewAdministration("contributor")).toBe(false);
    expect(canViewAdministration("viewer")).toBe(false);
  });

  it("does not claim API or static asset routes", () => {
    expect(isApplicationPath("/api")).toBe(false);
    expect(isApplicationPath("/api/v2/health")).toBe(false);
    expect(isApplicationPath("/builder.html")).toBe(false);
    expect(resolveRoute("/api/v2/health")).toBeNull();
  });

  it("returns an intentional not-found route", () => {
    expect(resolveRoute("/unknown/place")?.surface).toBe("not-found");
  });
});
