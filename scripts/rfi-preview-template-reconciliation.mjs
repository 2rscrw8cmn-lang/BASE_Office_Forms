import definition from "../src/domain/rfis/base-rfi-template-definition.json" with { type: "json" };

export const previewTemplateIds = {
  stale: "rfi-preview-template-v1",
  canonical: "rfi-preview-template-v2",
};

const staleDefinition = { kind: "form", title: "RFI", sections: [] };

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isCanonicalDefinition(value) {
  return stable(value) === stable(definition);
}

export function isStalePreviewStub(value) {
  return stable(value) === stable(staleDefinition);
}

export function isEligiblePreviewRfi(record) {
  return (
    record.template_version_id === previewTemplateIds.stale &&
    (record.workflow_status === "draft" ||
      record.workflow_status === "ready_to_issue") &&
    record.sequence_no === null &&
    record.record_number === null &&
    record.issued_at === null &&
    Number(record.has_official_issue) === 0 &&
    Number(record.has_published_revision) === 0 &&
    Number(record.has_generated_artifact) === 0
  );
}

export function planPreviewTemplateReconciliation({ versions, records }) {
  const normalized = versions.map((version) => ({
    ...version,
    definition: JSON.parse(version.definition_json),
  }));
  const canonical = normalized.filter((version) =>
    isCanonicalDefinition(version.definition),
  );
  if (canonical.length > 1)
    throw new Error(
      "Preview template reconciliation found multiple canonical BASE RFI versions.",
    );

  let canonicalVersionId;
  let publishCanonicalVersion = false;
  let retireVersionId = null;
  let promoteCanonicalVersion = false;
  if (canonical.length === 1) {
    const [version] = canonical;
    if (version.status === "published") {
      canonicalVersionId = version.id;
    } else if (version.id === previewTemplateIds.canonical) {
      const stale = normalized.find(
        (candidate) =>
          candidate.id === previewTemplateIds.stale &&
          isStalePreviewStub(candidate.definition),
      );
      const otherPublished = normalized.filter(
        (candidate) => candidate.status === "published",
      );
      if (
        !stale ||
        otherPublished.some((candidate) => candidate.id !== stale.id)
      )
        throw new Error(
          "Preview template reconciliation found an unsafe staged canonical version.",
        );
      canonicalVersionId = version.id;
      retireVersionId = stale.status === "published" ? stale.id : null;
      promoteCanonicalVersion = true;
    } else {
      throw new Error(
        "Preview template reconciliation found a retired canonical BASE RFI version.",
      );
    }
  } else {
    const canonicalIdConflict = normalized.find(
      (version) => version.id === previewTemplateIds.canonical,
    );
    if (canonicalIdConflict)
      throw new Error(
        "Preview template reconciliation refuses to mutate an unexpected canonical-version id.",
      );
    const published = normalized.filter(
      (version) => version.status === "published",
    );
    if (published.length !== 1 || !isStalePreviewStub(published[0].definition))
      throw new Error(
        "Preview template reconciliation requires exactly one stale published BASE RFI stub.",
      );
    canonicalVersionId = previewTemplateIds.canonical;
    publishCanonicalVersion = true;
    retireVersionId = published[0].id;
    promoteCanonicalVersion = true;
  }

  return {
    canonicalVersionId,
    publishCanonicalVersion,
    retireVersionId,
    promoteCanonicalVersion,
    rebindRecordIds: records
      .filter(isEligiblePreviewRfi)
      .map((record) => record.id),
  };
}

export async function reconcilePreviewTemplate({ query, execute, sql }) {
  const versions = await query(`SELECT id, definition_json, status
    FROM template_versions
    WHERE organization_id = ${sql("rfi-preview-org")}
      AND template_id = ${sql("rfi-preview-template")}
    ORDER BY version_number ASC`);
  const records = await query(`SELECT record.id, record.template_version_id,
      record.workflow_status, record.sequence_no, record.record_number,
      record.issued_at,
      EXISTS(SELECT 1 FROM rfi_official_issues issue WHERE issue.rfi_id = record.id) AS has_official_issue,
      EXISTS(SELECT 1 FROM record_revisions revision
        WHERE revision.record_id = record.id AND revision.status = 'published') AS has_published_revision,
      EXISTS(SELECT 1 FROM revision_files file
        JOIN record_revisions revision ON revision.id = file.revision_id
        WHERE revision.record_id = record.id AND file.role = 'generated_artifact') AS has_generated_artifact
    FROM records record
    WHERE record.organization_id = ${sql("rfi-preview-org")}
      AND record.project_id = ${sql("rfi-preview-project")}
      AND record.record_type_key = 'rfi'
    ORDER BY record.id ASC`);
  const plan = planPreviewTemplateReconciliation({ versions, records });
  const canonicalJson = JSON.stringify(definition);

  if (plan.publishCanonicalVersion) {
    // Remote D1 SQL rejects explicit BEGIN/COMMIT. Stage the new immutable row
    // as retired first, then retire/promote in separate, restart-safe commands.
    await execute(`INSERT INTO template_versions
        (id, organization_id, template_id, version_number, definition_json, status,
         created_by, created_at, published_at, published_by)
      SELECT ${sql(plan.canonicalVersionId)}, ${sql("rfi-preview-org")},
        ${sql("rfi-preview-template")}, last_number + 1, ${sql(canonicalJson)}, 'retired',
        ${sql("rfi-preview-access-user")}, datetime('now'), datetime('now'),
        ${sql("rfi-preview-access-user")}
      FROM template_version_sequences
      WHERE template_id = ${sql("rfi-preview-template")}
        AND organization_id = ${sql("rfi-preview-org")};`);
  }

  if (plan.retireVersionId) {
    await execute(`UPDATE template_versions SET status = 'retired'
      WHERE id = ${sql(plan.retireVersionId)}
        AND organization_id = ${sql("rfi-preview-org")}
        AND status = 'published';`);
  }

  if (plan.promoteCanonicalVersion) {
    await execute(`UPDATE template_versions SET status = 'published'
      WHERE id = ${sql(plan.canonicalVersionId)}
        AND organization_id = ${sql("rfi-preview-org")}
        AND status = 'retired';`);
    await execute(`UPDATE template_version_sequences
      SET last_number = (SELECT version_number FROM template_versions WHERE id = ${sql(plan.canonicalVersionId)})
      WHERE template_id = ${sql("rfi-preview-template")}
        AND organization_id = ${sql("rfi-preview-org")}
        AND last_number < (SELECT version_number FROM template_versions WHERE id = ${sql(plan.canonicalVersionId)});`);
  }

  if (plan.rebindRecordIds.length > 0) {
    await execute(`UPDATE records AS record
      SET template_version_id = ${sql(plan.canonicalVersionId)},
          lock_version = lock_version + 1,
          updated_at = datetime('now')
      WHERE record.organization_id = ${sql("rfi-preview-org")}
        AND record.project_id = ${sql("rfi-preview-project")}
        AND record.record_type_key = 'rfi'
        AND record.template_version_id = ${sql(previewTemplateIds.stale)}
        AND record.workflow_status IN ('draft', 'ready_to_issue')
        AND record.sequence_no IS NULL
        AND record.record_number IS NULL
        AND record.issued_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM rfi_official_issues issue WHERE issue.rfi_id = record.id)
        AND NOT EXISTS (SELECT 1 FROM record_revisions revision
          WHERE revision.record_id = record.id AND revision.status = 'published')
        AND NOT EXISTS (SELECT 1 FROM revision_files file
          JOIN record_revisions revision ON revision.id = file.revision_id
          WHERE revision.record_id = record.id AND file.role = 'generated_artifact');`);
  }

  return plan;
}
