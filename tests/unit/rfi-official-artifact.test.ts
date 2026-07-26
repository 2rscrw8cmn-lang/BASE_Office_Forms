import { describe, expect, it } from "vitest";

import { buildBaseRfiTemplateDefinition } from "../../src/domain/rfis/base-rfi-template";
import {
  canonicalRfiIssueRequest,
  type FrozenRfiRenderPayload,
} from "../../src/domain/rfis/official-issue";
import { RfiPdfArtifactRenderer } from "../../src/infrastructure/rendering/rfi-pdf-artifact-renderer";

function payload(): FrozenRfiRenderPayload {
  const definition = buildBaseRfiTemplateDefinition();
  return {
    schemaVersion: "rfi-official-render.v1",
    rendererVersion: "base-rfi-pdf/v1",
    issuedAt: "2026-07-25T12:00:00.000Z",
    officialDisplayNumber: "RFI-007",
    template: {
      templateVersionId: "template-version-1",
      key: "base-rfi",
      name: "BASE Request for Information",
      versionNumber: 1,
      definitionSha256: "a".repeat(64),
      definition,
    },
    organization: { id: "org-1", name: "BASE Construction" },
    project: {
      id: "project-1",
      projectNumber: "26-001",
      name: "Test Project",
      status: "active",
      timezone: "America/New_York",
      address: {
        line1: "1 Main Street",
        line2: null,
        city: "Orlando",
        region: "FL",
        postalCode: "32801",
        country: "US",
      },
    },
    rfi: {
      id: "rfi-1",
      subject: "Clarify footing detail",
      question: "Please confirm the required reinforcing at the footing.",
      contractorSuggestion: "Use detail S-4.",
      drawingReferences: "S-401",
      specificationReferences: "03 30 00",
      responsibleParty: {
        projectContactId: "contact-1",
        contactName: "Project Architect",
        companyName: "Design Co",
        email: "architect@example.test",
      },
      submittedBy: "BASE",
      responseDueDate: "2026-08-01",
    },
    routing: {
      to: [
        {
          projectContactId: "contact-1",
          contactName: "Project Architect",
          companyName: "Design Co",
          email: "architect@example.test",
        },
      ],
      cc: [],
      deliveryMode: "record_only",
    },
    includedFiles: [
      {
        fileId: "file-1",
        role: "supporting_attachment",
        originalFilename: "detail.pdf",
        mediaType: "application/pdf",
        byteSize: 123,
        sha256: "b".repeat(64),
      },
    ],
    issuedBy: { userId: "user-1", displayName: "Issue User" },
  };
}

describe("official RFI artifact contract", () => {
  it("renders deterministic, non-empty PDF bytes from one frozen payload", async () => {
    const renderer = new RfiPdfArtifactRenderer();
    const first = await renderer.render(payload());
    const second = await renderer.render(payload());
    expect(first.mediaType).toBe("application/pdf");
    expect(first.bytes.byteLength).toBeGreaterThan(500);
    expect(new TextDecoder().decode(first.bytes.slice(0, 5))).toBe("%PDF-");
    expect(new Uint8Array(second.bytes)).toEqual(new Uint8Array(first.bytes));
  });

  it("hash input keeps every issue field explicit and ordered", () => {
    expect(
      canonicalRfiIssueRequest({
        recipientProjectContactIds: ["to-1"],
        ccProjectContactIds: ["cc-1"],
        responseDueDate: "2026-08-01",
        includedFileIds: ["file-1"],
        deliveryMode: "record_only",
      }),
    ).toBe(
      '{"recipientProjectContactIds":["to-1"],"ccProjectContactIds":["cc-1"],"responseDueDate":"2026-08-01","includedFileIds":["file-1"],"deliveryMode":"record_only"}',
    );
  });
});
