import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import definition from "../src/domain/rfis/base-rfi-template-definition.json" with { type: "json" };

export const productionReconciliation = {
  database: "base-office-forms-library",
  failedRfiId: "555271af-6a78-4103-8c24-ede25abd9eed",
  failedRequestId: "req_1412ca0e-8c1d-4284-b9af-76f7b49fe01e",
  affectedVersionId: "ed74b014-d1f5-423a-a49a-b56d8a68bf38",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function expectedPreFieldIdDefinition() {
  const preFieldId = clone(definition);
  for (const section of preFieldId.sections)
    for (const field of section.fields) delete field.id;
  return preFieldId;
}

export function structuralDifferences(actual, expected, path = "$") {
  if (stable(actual) === stable(expected)) return [];
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const differences = [];
    const length = Math.max(actual.length, expected.length);
    for (let index = 0; index < length; index += 1)
      differences.push(
        ...structuralDifferences(
          actual[index],
          expected[index],
          `${path}[${index}]`,
        ),
      );
    return differences;
  }
  if (
    actual &&
    expected &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    const differences = [];
    const keys = [
      ...new Set([...Object.keys(actual), ...Object.keys(expected)]),
    ].sort();
    for (const key of keys)
      differences.push(
        ...structuralDifferences(actual[key], expected[key], `${path}.${key}`),
      );
    return differences;
  }
  return [{ path, actual: actual ?? null, expected: expected ?? null }];
}

function parseDefinition(version) {
  try {
    return { ...version, definition: JSON.parse(version.definition_json) };
  } catch {
    throw new Error(
      `Template version ${version.id} has invalid definition JSON.`,
    );
  }
}

export function eligibilityReasons(record) {
  const reasons = [];
  if (record.record_type_key !== "rfi") reasons.push("record_type_key_not_rfi");
  if (!["draft", "ready_to_issue"].includes(record.workflow_status))
    reasons.push(`workflow_status_${record.workflow_status}`);
  if (record.sequence_no !== null) reasons.push("sequence_no_present");
  if (record.record_number !== null) reasons.push("record_number_present");
  if (record.issued_at !== null) reasons.push("issued_at_present");
  if (Number(record.has_official_issue) !== 0)
    reasons.push("official_issue_present");
  if (Number(record.has_published_revision) !== 0)
    reasons.push("published_revision_present");
  if (Number(record.has_generated_artifact) !== 0)
    reasons.push("generated_artifact_present");
  return reasons;
}

export function isEligibleProductionRfi(record) {
  return eligibilityReasons(record).length === 0;
}

function assertExpectedVersionOne(version) {
  if (!version || Number(version.version_number) !== 1)
    throw new Error(
      "Production reconciliation requires the specified version 1.",
    );
  const differences = structuralDifferences(version.definition, definition);
  const expectedDifferences = structuralDifferences(
    expectedPreFieldIdDefinition(),
    definition,
  );
  if (stable(differences) !== stable(expectedDifferences))
    throw new Error(
      "Production reconciliation refuses a version 1 that differs from the canonical definition beyond the eight missing field ids.",
    );
  return differences;
}

export function planProductionTemplateReconciliation({
  organizationId,
  templateId,
  sequence,
  versions,
  records,
}) {
  if (!organizationId || !templateId)
    throw new Error(
      "Production reconciliation could not resolve the organization and template.",
    );
  if (!sequence || Number(sequence.last_number) < 1)
    throw new Error(
      "Production reconciliation requires a valid template version sequence.",
    );

  const normalized = versions.map(parseDefinition);
  const versionOne = normalized.find(
    (version) => version.id === productionReconciliation.affectedVersionId,
  );
  const structuralDifferenceReport = assertExpectedVersionOne(versionOne);
  const published = normalized.filter(
    (version) => version.status === "published",
  );
  if (published.length > 1)
    throw new Error(
      "Production reconciliation requires at most one published template version.",
    );

  const canonical = normalized.filter(
    (version) => stable(version.definition) === stable(definition),
  );
  if (canonical.length > 1)
    throw new Error(
      "Production reconciliation found multiple canonical versions.",
    );

  const currentPublished = published[0] ?? null;
  let createCanonicalVersion = false;
  let retireVersionId = null;
  let promoteCanonicalVersionId = null;
  let canonicalVersionId = canonical[0]?.id ?? null;
  const sequenceNumber = Number(sequence.last_number);

  if (canonical.length === 0) {
    if (
      currentPublished?.id !== versionOne.id ||
      versionOne.status !== "published" ||
      sequenceNumber !== 1
    )
      throw new Error(
        "Production reconciliation requires the affected version 1 to be the only published version and sequence 1 before staging version 2.",
      );
    createCanonicalVersion = true;
    retireVersionId = versionOne.id;
  } else {
    const [canonicalVersion] = canonical;
    if (Number(canonicalVersion.version_number) !== 2)
      throw new Error(
        "Production reconciliation requires the canonical successor to be version 2.",
      );
    canonicalVersionId = canonicalVersion.id;
    if (canonicalVersion.status === "retired") {
      if (
        !(
          currentPublished?.id === versionOne.id &&
          versionOne.status === "published" &&
          sequenceNumber === 1
        ) &&
        !(
          currentPublished === null &&
          versionOne.status === "retired" &&
          sequenceNumber === 1
        )
      )
        throw new Error(
          "Production reconciliation found an unsafe staged version 2.",
        );
      retireVersionId =
        currentPublished?.id === versionOne.id ? versionOne.id : null;
      promoteCanonicalVersionId = canonicalVersion.id;
    } else if (canonicalVersion.status === "published") {
      if (
        currentPublished?.id !== canonicalVersion.id ||
        versionOne.status !== "retired" ||
        ![1, 2].includes(sequenceNumber)
      )
        throw new Error(
          "Production reconciliation found an unsafe published version 2.",
        );
    } else {
      throw new Error(
        "Production reconciliation found an unsupported canonical version status.",
      );
    }
  }

  const eligibleRfis = records.filter(isEligibleProductionRfi);
  const ineligibleBoundRfis = records
    .filter((record) => record.record_type_key === "rfi")
    .filter((record) => !isEligibleProductionRfi(record))
    .map((record) => ({ id: record.id, reasons: eligibilityReasons(record) }));
  const nonRfiBoundRecords = records
    .filter((record) => record.record_type_key !== "rfi")
    .map((record) => ({ id: record.id, reasons: eligibilityReasons(record) }));

  return {
    organizationId,
    templateId,
    currentPublishedVersion: currentPublished
      ? {
          id: currentPublished.id,
          versionNumber: Number(currentPublished.version_number),
          status: currentPublished.status,
        }
      : null,
    affectedVersion: {
      id: versionOne.id,
      versionNumber: Number(versionOne.version_number),
      status: versionOne.status,
    },
    structuralDifferences: structuralDifferenceReport,
    eligibleRfiIds: eligibleRfis.map((record) => record.id),
    eligibleRfiCount: eligibleRfis.length,
    ineligibleBoundRfis,
    nonRfiBoundRecords,
    changes: {
      createCanonicalVersion,
      retireVersionId,
      promoteCanonicalVersionId,
      advanceSequenceTo: sequenceNumber < 2 ? 2 : null,
      rebindRecordIds: eligibleRfis.map((record) => record.id),
    },
    canonicalVersionId,
  };
}

export function planFingerprint(plan) {
  return createHash("sha256").update(stable(plan)).digest("hex");
}

export async function inspectProductionTemplate({ query, sql }) {
  const [bound] =
    await query(`SELECT version.organization_id, version.template_id
    FROM template_versions version
    WHERE version.id = ${sql(productionReconciliation.affectedVersionId)}`);
  if (!bound)
    throw new Error("The affected production template version was not found.");
  const versions =
    await query(`SELECT id, version_number, definition_json, status
    FROM template_versions
    WHERE organization_id = ${sql(bound.organization_id)}
      AND template_id = ${sql(bound.template_id)}
    ORDER BY version_number ASC`);
  const [sequence] = await query(`SELECT last_number
    FROM template_version_sequences
    WHERE organization_id = ${sql(bound.organization_id)}
      AND template_id = ${sql(bound.template_id)}`);
  const records = await query(`SELECT record.id, record.record_type_key,
      record.workflow_status, record.sequence_no, record.record_number, record.issued_at,
      EXISTS(SELECT 1 FROM rfi_official_issues issue WHERE issue.rfi_id = record.id) AS has_official_issue,
      EXISTS(SELECT 1 FROM record_revisions revision
        WHERE revision.record_id = record.id AND revision.status = 'published') AS has_published_revision,
      EXISTS(SELECT 1 FROM revision_files file
        JOIN record_revisions revision ON revision.id = file.revision_id
        WHERE revision.record_id = record.id AND file.role = 'generated_artifact') AS has_generated_artifact
    FROM records record
    WHERE record.organization_id = ${sql(bound.organization_id)}
      AND record.template_version_id = ${sql(productionReconciliation.affectedVersionId)}
    ORDER BY record.id ASC`);
  return planProductionTemplateReconciliation({
    organizationId: bound.organization_id,
    templateId: bound.template_id,
    sequence,
    versions,
    records,
  });
}

export async function applyProductionTemplateReconciliation({
  query,
  execute,
  sql,
  actorUserId,
  reviewedPlanFingerprint,
}) {
  const before = await inspectProductionTemplate({ query, sql });
  if (reviewedPlanFingerprint !== planFingerprint(before))
    throw new Error(
      "The reviewed dry-run fingerprint does not match current production state.",
    );
  if (!actorUserId)
    throw new Error(
      "An actor user ID is required for the immutable version 2 audit record.",
    );

  let plan = before;
  if (plan.changes.createCanonicalVersion) {
    const canonicalVersionId = randomUUID();
    await execute(`INSERT INTO template_versions
      (id, organization_id, template_id, version_number, definition_json, status,
       created_by, created_at, published_at, published_by)
      SELECT ${sql(canonicalVersionId)}, ${sql(plan.organizationId)}, ${sql(plan.templateId)}, 2,
        ${sql(JSON.stringify(definition))}, 'retired', ${sql(actorUserId)}, datetime('now'),
        datetime('now'), ${sql(actorUserId)}
      WHERE EXISTS (SELECT 1 FROM organization_memberships
        WHERE organization_id = ${sql(plan.organizationId)} AND user_id = ${sql(actorUserId)}
          AND status = 'active')
        AND EXISTS (SELECT 1 FROM template_version_sequences
          WHERE organization_id = ${sql(plan.organizationId)} AND template_id = ${sql(plan.templateId)}
            AND last_number = 1)
        AND EXISTS (SELECT 1 FROM template_versions
          WHERE id = ${sql(productionReconciliation.affectedVersionId)}
            AND organization_id = ${sql(plan.organizationId)} AND version_number = 1
            AND status = 'published')
        AND NOT EXISTS (SELECT 1 FROM template_versions
          WHERE organization_id = ${sql(plan.organizationId)} AND template_id = ${sql(plan.templateId)}
            AND version_number = 2);`);
    plan = await inspectProductionTemplate({ query, sql });
    if (plan.changes.createCanonicalVersion || !plan.canonicalVersionId)
      throw new Error(
        "Production reconciliation could not verify the immutable version 2 stage; version 1 was not retired.",
      );
  }

  if (plan.changes.retireVersionId) {
    await execute(`UPDATE template_versions SET status = 'retired'
      WHERE id = ${sql(plan.changes.retireVersionId)}
        AND organization_id = ${sql(plan.organizationId)} AND version_number = 1
        AND status = 'published';`);
  }

  if (!plan.canonicalVersionId)
    throw new Error(
      "Production reconciliation could not resolve the staged canonical version.",
    );
  if (plan.changes.promoteCanonicalVersionId) {
    await execute(`UPDATE template_versions SET status = 'published'
      WHERE id = ${sql(plan.changes.promoteCanonicalVersionId)}
        AND organization_id = ${sql(plan.organizationId)} AND version_number = 2
        AND status = 'retired';`);
    plan = await inspectProductionTemplate({ query, sql });
  }

  if (plan.changes.advanceSequenceTo) {
    await execute(`UPDATE template_version_sequences SET last_number = 2
      WHERE organization_id = ${sql(plan.organizationId)}
        AND template_id = ${sql(plan.templateId)} AND last_number = 1;`);
    plan = await inspectProductionTemplate({ query, sql });
  }

  if (plan.changes.rebindRecordIds.length > 0) {
    await execute(`UPDATE records AS record
      SET template_version_id = ${sql(plan.canonicalVersionId)},
          lock_version = lock_version + 1,
          updated_at = datetime('now')
      WHERE record.organization_id = ${sql(plan.organizationId)}
        AND record.record_type_key = 'rfi'
        AND record.template_version_id = ${sql(productionReconciliation.affectedVersionId)}
        AND record.workflow_status IN ('draft', 'ready_to_issue')
        AND record.sequence_no IS NULL AND record.record_number IS NULL
        AND record.issued_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM rfi_official_issues issue WHERE issue.rfi_id = record.id)
        AND NOT EXISTS (SELECT 1 FROM record_revisions revision
          WHERE revision.record_id = record.id AND revision.status = 'published')
        AND NOT EXISTS (SELECT 1 FROM revision_files file
          JOIN record_revisions revision ON revision.id = file.revision_id
          WHERE revision.record_id = record.id AND file.role = 'generated_artifact');`);
  }

  const after = await inspectProductionTemplate({ query, sql });
  if (
    after.changes.createCanonicalVersion ||
    after.changes.retireVersionId ||
    after.changes.promoteCanonicalVersionId ||
    after.changes.advanceSequenceTo ||
    after.changes.rebindRecordIds.length > 0
  )
    throw new Error(
      "Production reconciliation did not reach its idempotent end state.",
    );
  return after;
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(args, json = false) {
  const wranglerCli = resolve("node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerCli))
    throw new Error("Local Wrangler is required; run npm install first.");
  return execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

async function remoteQuery(command) {
  const output = run(
    [
      "d1",
      "execute",
      productionReconciliation.database,
      "--remote",
      "--command",
      command,
      "--json",
    ],
    true,
  );
  return JSON.parse(output)[0]?.results ?? [];
}

async function remoteExecute(command) {
  run([
    "d1",
    "execute",
    productionReconciliation.database,
    "--remote",
    "--command",
    command,
    "--yes",
  ]);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const plan = await inspectProductionTemplate({ query: remoteQuery, sql });
  const fingerprint = planFingerprint(plan);
  if (!apply) {
    console.log(
      JSON.stringify({ mode: "dry-run", plan, fingerprint }, null, 2),
    );
    return;
  }

  if (process.env.RFI_PRODUCTION_RECONCILIATION_APPROVED !== "approved")
    throw new Error(
      "Apply requires RFI_PRODUCTION_RECONCILIATION_APPROVED=approved.",
    );
  const actorUserId = option("--actor-user-id");
  const reviewedPlanFingerprint = option("--reviewed-plan-fingerprint");
  const result = await applyProductionTemplateReconciliation({
    query: remoteQuery,
    execute: remoteExecute,
    sql,
    actorUserId,
    reviewedPlanFingerprint,
  });
  console.log(
    JSON.stringify(
      { mode: "applied", plan: result, fingerprint: planFingerprint(result) },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
