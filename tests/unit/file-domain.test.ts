import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { AppSession } from "../../src/auth/authentication-adapter";
import {
  hasOrganizationWideFileManagement,
  requireFileManagement,
} from "../../src/domain/files/authorization";
import { isValidSha256Hex, sha256Hex } from "../../src/domain/files/checksum";
import { FileAuthorizationError } from "../../src/domain/files/errors";
import { buildStorageKey } from "../../src/domain/files/storage-key";

function session(membershipRole: AppSession["membershipRole"]): AppSession {
  return {
    userId: "user-1",
    organizationId: "org-1",
    membershipRole,
    projectPermissions: [],
  };
}

describe("file domain storage key", () => {
  it("builds a deterministic hierarchy path with a random file identity and no filename", () => {
    const key = buildStorageKey({
      organizationId: "org-1",
      projectId: "project-1",
      recordId: "record-1",
      revisionId: "revision-1",
      fileId: "file-1",
    });
    expect(key).toBe(
      "organizations/org-1/projects/project-1/records/record-1/revisions/revision-1/files/file-1",
    );
  });

  it("never includes the original filename", () => {
    const key = buildStorageKey({
      organizationId: "org-1",
      projectId: "project-1",
      recordId: "record-1",
      revisionId: "revision-1",
      fileId: "file-1",
    });
    expect(key).not.toContain(".pdf");
    expect(key.split("/")).toHaveLength(10);
  });
});

describe("file domain checksum", () => {
  it("computes a lowercase hex sha256 digest of exactly the given bytes", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const digest = await sha256Hex(bytes.buffer);
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(expected);
    expect(isValidSha256Hex(digest)).toBe(true);
  });

  it("produces different digests for different content", async () => {
    const a = await sha256Hex(new TextEncoder().encode("a").buffer);
    const b = await sha256Hex(new TextEncoder().encode("b").buffer);
    expect(a).not.toBe(b);
  });

  it("validates the lowercase hex sha256 format", () => {
    const lowercase = createHash("sha256").update("sample").digest("hex");
    expect(isValidSha256Hex(lowercase)).toBe(true);
    expect(isValidSha256Hex(lowercase.toUpperCase())).toBe(false);
    expect(isValidSha256Hex("not-a-hash")).toBe(false);
    expect(isValidSha256Hex("abc")).toBe(false);
  });
});

describe("file domain authorization", () => {
  it("grants organization-wide management to org_admin and document_control_admin", () => {
    expect(hasOrganizationWideFileManagement(session("org_admin"))).toBe(true);
    expect(
      hasOrganizationWideFileManagement(session("document_control_admin")),
    ).toBe(true);
    expect(hasOrganizationWideFileManagement(session("project_manager"))).toBe(
      false,
    );
    expect(hasOrganizationWideFileManagement(session("contributor"))).toBe(
      false,
    );
    expect(hasOrganizationWideFileManagement(session("viewer"))).toBe(false);
  });

  it("allows an assigned project manager to upload", () => {
    expect(() => {
      requireFileManagement(session("project_manager"), "files:upload", true);
    }).not.toThrow();
  });

  it("rejects an unassigned project manager, contributors, and viewers", () => {
    expect(() => {
      requireFileManagement(session("project_manager"), "files:upload", false);
    }).toThrow(FileAuthorizationError);
    expect(() => {
      requireFileManagement(session("contributor"), "files:upload", false);
    }).toThrow(FileAuthorizationError);
    expect(() => {
      requireFileManagement(session("viewer"), "files:upload", false);
    }).toThrow(FileAuthorizationError);
  });
});
