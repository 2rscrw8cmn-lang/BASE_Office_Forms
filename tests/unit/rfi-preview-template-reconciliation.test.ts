import { describe, expect, it } from "vitest";

import {
  planPreviewTemplateReconciliation,
  previewTemplateIds,
} from "../../scripts/rfi-preview-template-reconciliation.mjs";
import canonicalDefinition from "../../src/domain/rfis/base-rfi-template-definition.json";

const staleStub = { kind: "form", title: "RFI", sections: [] };

function version(
  id: string,
  definition: unknown,
  status: "published" | "retired" = "published",
) {
  return { id, status, definition_json: JSON.stringify(definition) };
}

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    template_version_id: previewTemplateIds.stale,
    workflow_status: "draft",
    sequence_no: null,
    record_number: null,
    issued_at: null,
    has_official_issue: 0,
    has_published_revision: 0,
    has_generated_artifact: 0,
    ...overrides,
  };
}

describe("RFI preview template reconciliation", () => {
  it("publishes one immutable canonical successor and rebinds only eligible unissued RFIs", () => {
    const plan = planPreviewTemplateReconciliation({
      versions: [version(previewTemplateIds.stale, staleStub)],
      records: [
        record("draft"),
        record("ready", { workflow_status: "ready_to_issue" }),
        record("issued", { has_official_issue: 1 }),
        record("numbered", { sequence_no: 7, record_number: "RFI-007" }),
        record("open", {
          workflow_status: "open",
          issued_at: "2026-07-28T12:00:00.000Z",
        }),
        record("closed", { workflow_status: "closed" }),
        record("void", { workflow_status: "void" }),
        record("published-revision", { has_published_revision: 1 }),
        record("artifact", { has_generated_artifact: 1 }),
      ],
    });

    expect(plan).toEqual({
      canonicalVersionId: previewTemplateIds.canonical,
      publishCanonicalVersion: true,
      retireVersionId: previewTemplateIds.stale,
      promoteCanonicalVersion: true,
      rebindRecordIds: ["draft", "ready"],
    });
  });

  it("is idempotent after the canonical version exists and eligible rows are rebound", () => {
    const plan = planPreviewTemplateReconciliation({
      versions: [
        version(previewTemplateIds.stale, staleStub, "retired"),
        version(previewTemplateIds.canonical, canonicalDefinition),
      ],
      records: [
        record("rebound", {
          template_version_id: previewTemplateIds.canonical,
        }),
        record("void", { workflow_status: "void" }),
      ],
    });

    expect(plan).toEqual({
      canonicalVersionId: previewTemplateIds.canonical,
      publishCanonicalVersion: false,
      retireVersionId: null,
      promoteCanonicalVersion: false,
      rebindRecordIds: [],
    });
  });
});
