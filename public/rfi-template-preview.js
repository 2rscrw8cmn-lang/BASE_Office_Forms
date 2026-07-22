// Adapter from structured project/RFI data to the existing BASE renderer.
// Template structure stays immutable; this module only binds values to the
// renderer's stable field ids and then locks every rendered control read-only.
export function renderRfiTemplatePreview(data, documentRef = document) {
  const engine = globalThis.BASE;
  if (!engine?.render || !data?.template?.definition) {
    return '<div class="document-upload-empty"><strong>Template preview unavailable</strong><p>The bound renderer definition could not be loaded.</p></div>';
  }

  const definition = engine.clone(data.template.definition);
  const number = data.rfi.rfiNumber || "DRAFT";
  definition.no = number;
  definition.sub = `${data.project.name} · ${data.project.projectNumber}`;
  definition.control = {
    ...(definition.control || {}),
    Revision: data.currentVersion?.label || "Current Draft",
    Effective: data.rfi.issuedAt || "Not issued",
    Classification: "Project Record",
    "Doc. Control": number === "DRAFT" ? "UNISSUED" : `BASE-${number}`,
  };

  const host = documentRef.createElement("div");
  host.innerHTML = engine.render(definition, { fill: true });
  const response = data.responses?.at?.(-1)?.response || "";
  const values = {
    subject: data.rfi.subject,
    responsible_party: data.rfi.responsibleParty,
    requested_response_date: data.rfi.requestedResponseDate,
    question: data.rfi.question,
    contractor_suggestion: data.rfi.contractorSuggestion,
    drawing_references: data.rfi.drawingReferences,
    specification_references: data.rfi.specificationReferences,
    response,
  };

  for (const [name, value] of Object.entries(values)) {
    const control = host.querySelector(`[name="${name}"]`);
    if (!control) continue;
    const text = value == null ? "" : String(value);
    if (control.tagName === "TEXTAREA") control.textContent = text;
    else control.setAttribute("value", text);
  }
  host
    .querySelectorAll("input, textarea, select, button")
    .forEach((control) => {
      control.setAttribute("disabled", "");
      control.setAttribute("tabindex", "-1");
      control.removeAttribute("name");
    });
  return host.innerHTML;
}
