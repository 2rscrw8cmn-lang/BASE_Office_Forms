import { describe, expect, it } from "vitest";

import canonicalDefinition from "../../src/domain/rfis/base-rfi-template-definition.json";
import {
  applyProductionTemplateReconciliation,
  expectedPreFieldIdDefinition,
  planFingerprint,
  planProductionTemplateReconciliation,
  productionReconciliation,
  structuralDifferences,
} from "../../scripts/rfi-production-template-reconciliation.mjs";

const oldVersion = productionReconciliation.affectedVersionId;

function version(
  id: string,
  versionNumber: number,
  definition: unknown,
  status: "published" | "retired",
) {
  return {
    id,
    version_number: versionNumber,
    definition_json: JSON.stringify(definition),
    status,
  };
}

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    record_type_key: "rfi",
    workflow_status: "ready_to_issue",
    sequence_no: null,
    record_number: null,
    issued_at: null,
    has_official_issue: 0,
    has_published_revision: 0,
    has_generated_artifact: 0,
    ...overrides,
  };
}

function plan(
  versions = [
    version(oldVersion, 1, expectedPreFieldIdDefinition(), "published"),
  ],
  records = [record(productionReconciliation.failedRfiId)],
  sequence = 1,
) {
  return planProductionTemplateReconciliation({
    organizationId: "production-org",
    templateId: "production-template",
    sequence: { last_number: sequence },
    versions,
    records,
  });
}

describe("production RFI template reconciliation", () => {
  it("recognizes the exact pre-field-ID production definition", () => {
    expect(
      structuralDifferences(
        expectedPreFieldIdDefinition(),
        canonicalDefinition,
      ),
    ).toEqual([
      { path: "$.sections[0].fields[0].id", actual: null, expected: "subject" },
      {
        path: "$.sections[0].fields[1].id",
        actual: null,
        expected: "responsible_party",
      },
      {
        path: "$.sections[0].fields[2].id",
        actual: null,
        expected: "requested_response_date",
      },
      {
        path: "$.sections[1].fields[0].id",
        actual: null,
        expected: "question",
      },
      {
        path: "$.sections[2].fields[0].id",
        actual: null,
        expected: "contractor_suggestion",
      },
      {
        path: "$.sections[3].fields[0].id",
        actual: null,
        expected: "drawing_references",
      },
      {
        path: "$.sections[3].fields[1].id",
        actual: null,
        expected: "specification_references",
      },
      {
        path: "$.sections[4].fields[0].id",
        actual: null,
        expected: "response",
      },
    ]);
  });

  it("plans only unissued draft or ready RFI rows and reports every protected binding", () => {
    const result = plan(undefined, [
      record("draft", { workflow_status: "draft" }),
      record(productionReconciliation.failedRfiId),
      record("numbered", { sequence_no: 7, record_number: "RFI-007" }),
      record("open", {
        workflow_status: "open",
        issued_at: "2026-07-29T00:00:00Z",
      }),
      record("issue", { has_official_issue: 1 }),
      record("published", { has_published_revision: 1 }),
      record("artifact", { has_generated_artifact: 1 }),
      record("non-rfi", { record_type_key: "other" }),
    ]);

    expect(result.eligibleRfiIds).toEqual([
      "draft",
      productionReconciliation.failedRfiId,
    ]);
    expect(result.eligibleRfiCount).toBe(2);
    expect(result.ineligibleBoundRfis).toEqual([
      {
        id: "numbered",
        reasons: ["sequence_no_present", "record_number_present"],
      },
      {
        id: "open",
        reasons: ["workflow_status_open", "issued_at_present"],
      },
      { id: "issue", reasons: ["official_issue_present"] },
      { id: "published", reasons: ["published_revision_present"] },
      {
        id: "artifact",
        reasons: ["generated_artifact_present"],
      },
    ]);
    expect(result.nonRfiBoundRecords).toEqual([
      { id: "non-rfi", reasons: ["record_type_key_not_rfi"] },
    ]);
    expect(result.changes).toEqual({
      createCanonicalVersion: true,
      retireVersionId: oldVersion,
      promoteCanonicalVersionId: null,
      advanceSequenceTo: 2,
      rebindRecordIds: ["draft", productionReconciliation.failedRfiId],
    });
  });

  it("is a zero-change second run after version 2 is published and eligible rows are rebound", () => {
    const result = plan(
      [
        version(oldVersion, 1, expectedPreFieldIdDefinition(), "retired"),
        version("canonical-v2", 2, canonicalDefinition, "published"),
      ],
      [
        record("issued", {
          workflow_status: "open",
          issued_at: "2026-07-29T00:00:00Z",
        }),
      ],
      2,
    );

    expect(result.currentPublishedVersion).toEqual({
      id: "canonical-v2",
      versionNumber: 2,
      status: "published",
    });
    expect(result.eligibleRfiCount).toBe(0);
    expect(result.changes).toEqual({
      createCanonicalVersion: false,
      retireVersionId: null,
      promoteCanonicalVersionId: null,
      advanceSequenceTo: null,
      rebindRecordIds: [],
    });
  });

  it("resumes the narrow staged state if interrupted after version 1 is retired", () => {
    const result = plan(
      [
        version(oldVersion, 1, expectedPreFieldIdDefinition(), "retired"),
        version("canonical-v2", 2, canonicalDefinition, "retired"),
      ],
      [],
      1,
    );

    expect(result.currentPublishedVersion).toBeNull();
    expect(result.changes).toEqual({
      createCanonicalVersion: false,
      retireVersionId: null,
      promoteCanonicalVersionId: "canonical-v2",
      advanceSequenceTo: 2,
      rebindRecordIds: [],
    });
  });

  it("refuses a version 1 with any mismatch beyond the canonical field ids", () => {
    const unsafe = expectedPreFieldIdDefinition();
    unsafe.title = "Wrong title";

    expect(() => plan([version(oldVersion, 1, unsafe, "published")])).toThrow(
      "beyond the eight missing field ids",
    );
  });

  it("rechecks every production guard while applying and reaches a zero-change second plan", async () => {
    const versions = [
      version(oldVersion, 1, expectedPreFieldIdDefinition(), "published"),
    ];
    const records = [
      {
        ...record(productionReconciliation.failedRfiId),
        template_version_id: oldVersion,
      },
      {
        ...record("issued", {
          workflow_status: "open",
          sequence_no: 4,
          record_number: "RFI-004",
          issued_at: "2026-07-29T00:00:00Z",
          has_official_issue: 1,
        }),
        template_version_id: oldVersion,
      },
    ];
    let sequence = 1;
    const executed: string[] = [];
    const query = (command: string) => {
      if (command.includes("FROM template_versions version"))
        return Promise.resolve([
          {
            organization_id: "production-org",
            template_id: "production-template",
          },
        ]);
      if (command.includes("FROM template_versions\n    WHERE"))
        return Promise.resolve(versions);
      if (command.includes("FROM template_version_sequences"))
        return Promise.resolve([{ last_number: sequence }]);
      if (command.includes("FROM records record"))
        return Promise.resolve(
          records.filter((item) => item.template_version_id === oldVersion),
        );
      throw new Error(`Unexpected query: ${command}`);
    };
    const execute = (command: string) => {
      executed.push(command);
      if (command.startsWith("INSERT INTO template_versions")) {
        versions.push(
          version("canonical-v2", 2, canonicalDefinition, "retired"),
        );
      } else if (
        command.startsWith("UPDATE template_versions SET status = 'retired'")
      ) {
        versions[0].status = "retired";
      } else if (
        command.startsWith("UPDATE template_versions SET status = 'published'")
      ) {
        versions[1].status = "published";
      } else if (command.startsWith("UPDATE template_version_sequences")) {
        sequence = 2;
      } else if (command.startsWith("UPDATE records AS record")) {
        records[0].template_version_id = "canonical-v2";
      } else {
        throw new Error(`Unexpected execute: ${command}`);
      }
      return Promise.resolve();
    };
    const sql = (value: string) => `'${value}'`;
    const before = plan(versions, records, sequence);

    const result = await applyProductionTemplateReconciliation({
      query,
      execute,
      sql,
      actorUserId: "active-operator",
      reviewedPlanFingerprint: planFingerprint(before),
    });

    expect(result.changes).toEqual({
      createCanonicalVersion: false,
      retireVersionId: null,
      promoteCanonicalVersionId: null,
      advanceSequenceTo: null,
      rebindRecordIds: [],
    });
    expect(versions).toEqual([
      version(oldVersion, 1, expectedPreFieldIdDefinition(), "retired"),
      version("canonical-v2", 2, canonicalDefinition, "published"),
    ]);
    expect(records).toMatchObject([
      {
        id: productionReconciliation.failedRfiId,
        template_version_id: "canonical-v2",
      },
      { id: "issued", template_version_id: oldVersion },
    ]);
    const rebind = executed.find((command) =>
      command.startsWith("UPDATE records AS record"),
    );
    expect(rebind).toContain("record.record_type_key = 'rfi'");
    expect(rebind).toContain(
      `record.id IN ('${productionReconciliation.failedRfiId}')`,
    );
    expect(rebind).toContain(
      "record.workflow_status IN ('draft', 'ready_to_issue')",
    );
    expect(rebind).toContain(
      "record.sequence_no IS NULL AND record.record_number IS NULL",
    );
    expect(rebind).toContain("record.issued_at IS NULL");
    expect(rebind).toContain("NOT EXISTS (SELECT 1 FROM rfi_official_issues");
    expect(rebind).toContain("revision.status = 'published'");
    expect(rebind).toContain("file.role = 'generated_artifact'");
  });

  it("aborts without rebinding a newly eligible RFI outside the reviewed set", async () => {
    const versions = [
      version(oldVersion, 1, expectedPreFieldIdDefinition(), "published"),
    ];
    const reviewed = {
      ...record(productionReconciliation.failedRfiId),
      template_version_id: oldVersion,
    };
    const records = [reviewed];
    let sequence = 1;
    const executed: string[] = [];
    const query = (command: string) => {
      if (command.includes("FROM template_versions version"))
        return Promise.resolve([
          {
            organization_id: "production-org",
            template_id: "production-template",
          },
        ]);
      if (command.includes("FROM template_versions\n    WHERE"))
        return Promise.resolve(versions);
      if (command.includes("FROM template_version_sequences"))
        return Promise.resolve([{ last_number: sequence }]);
      if (command.includes("FROM records record"))
        return Promise.resolve(
          records.filter((item) => item.template_version_id === oldVersion),
        );
      throw new Error(`Unexpected query: ${command}`);
    };
    const execute = (command: string) => {
      executed.push(command);
      if (command.startsWith("INSERT INTO template_versions")) {
        versions.push(
          version("canonical-v2", 2, canonicalDefinition, "retired"),
        );
      } else if (
        command.startsWith("UPDATE template_versions SET status = 'retired'")
      ) {
        versions[0].status = "retired";
      } else if (
        command.startsWith("UPDATE template_versions SET status = 'published'")
      ) {
        versions[1].status = "published";
      } else if (command.startsWith("UPDATE template_version_sequences")) {
        sequence = 2;
        records.push({
          ...record("newly-eligible"),
          template_version_id: oldVersion,
        });
      } else if (command.startsWith("UPDATE records AS record")) {
        throw new Error("The rebind must not execute after scope expansion.");
      } else {
        throw new Error(`Unexpected execute: ${command}`);
      }
      return Promise.resolve();
    };
    const sql = (value: string) => `'${value}'`;
    const before = plan(versions, records, sequence);

    await expect(
      applyProductionTemplateReconciliation({
        query,
        execute,
        sql,
        actorUserId: "active-operator",
        reviewedPlanFingerprint: planFingerprint(before),
      }),
    ).rejects.toThrow(
      "newly eligible RFI IDs outside the reviewed dry-run scope: newly-eligible",
    );
    expect(records).toMatchObject([
      {
        id: productionReconciliation.failedRfiId,
        template_version_id: oldVersion,
      },
      { id: "newly-eligible", template_version_id: oldVersion },
    ]);
    expect(executed).not.toContainEqual(
      expect.stringMatching(/^UPDATE records AS record/),
    );
  });
});
