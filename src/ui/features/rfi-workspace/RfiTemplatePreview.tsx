/*
 * Read-only, template-bound document view of the RFI (UX_RFI_SPEC §6).
 *
 * The renderer stays the authority for document HTML: this component only binds
 * the RFI's structured values to the template's stable field ids, then locks
 * every rendered control. The user edits structured RFI fields, never the
 * template definition, and there is no path from here into Studio.
 *
 * It is deliberately rendered on demand (inside a Collapsible), so the renderer
 * never runs until someone asks for the preview -- the same restraint the legacy
 * workspace's Details/Preview switch provided, without a competing mode.
 *
 * When the controlled renderer runtime is not present on the page, the section
 * says so plainly instead of guessing at the document.
 */

import { useEffect, useRef } from "react";
import { createRendererPreviewAdapter } from "../../app/renderer-preview";
import type { RendererRuntime } from "../../app/renderer-preview";
import type { RfiWorkspaceModel } from "./types";

function rendererRuntime(): RendererRuntime | null {
  const candidate: unknown = (globalThis as { BASE?: unknown }).BASE;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as RendererRuntime).render === "function"
  ) {
    return candidate as RendererRuntime;
  }
  return null;
}

/** The controlled metadata the template's document-control block expects. */
function boundDefinition(data: RfiWorkspaceModel): Record<string, unknown> {
  // Clone first: the fetched definition is cached read-model data and is never
  // mutated in place by a preview.
  const definition: Record<string, unknown> = structuredClone(
    data.template?.definition ?? {},
  );
  const number = data.rfi.rfiNumber || "DRAFT";
  definition.no = number;
  definition.sub = `${data.project.name} · ${data.project.projectNumber}`;
  const control: unknown = definition.control;
  definition.control = {
    ...(typeof control === "object" && control !== null ? control : {}),
    Revision: data.currentVersion.label || "Current Draft",
    Effective: data.rfi.issuedAt || "Not issued",
    Classification: "Project Record",
    "Doc. Control": number === "DRAFT" ? "UNISSUED" : `BASE-${number}`,
  };
  return definition;
}

function boundValues(data: RfiWorkspaceModel): Record<string, string | null> {
  return {
    subject: data.rfi.subject,
    responsible_party: data.rfi.responsibleParty,
    requested_response_date: data.rfi.requestedResponseDate,
    question: data.rfi.question,
    contractor_suggestion: data.rfi.contractorSuggestion,
    drawing_references: data.rfi.drawingReferences,
    specification_references: data.rfi.specificationReferences,
    response: data.responses.at(-1)?.response ?? "",
  };
}

/**
 * Whether the template-bound document view has anything to show. The feature
 * checks this before deciding whether to offer the "Show document view"
 * control at all -- an expandable control that can only report "unavailable"
 * once opened is a dead end, not a real feature.
 */
export function templatePreviewAvailable(data: RfiWorkspaceModel): boolean {
  return rendererRuntime() !== null && data.template !== null;
}

export function RfiTemplatePreview({ data }: { data: RfiWorkspaceModel }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = rendererRuntime();
  const available = runtime !== null && data.template !== null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !runtime || !data.template) return;
    const adapter = createRendererPreviewAdapter(runtime);
    adapter.mount(host, boundDefinition(data), { fill: true });

    // Bind values into the rendered controls, then lock every one of them: this
    // is a document view, never a second editor for the same facts.
    for (const [name, value] of Object.entries(boundValues(data))) {
      const control = host.querySelector(`[name="${name}"]`);
      if (!control) continue;
      const text = value ?? "";
      if (control.tagName === "TEXTAREA") control.textContent = text;
      else control.setAttribute("value", text);
    }
    for (const control of host.querySelectorAll(
      "input, textarea, select, button",
    )) {
      control.setAttribute("disabled", "");
      control.setAttribute("tabindex", "-1");
      control.removeAttribute("name");
    }
    return () => {
      host.replaceChildren();
    };
  }, [data, runtime]);

  if (!available) {
    return (
      <p className="rfi-workspace-empty-value" data-preview-unavailable>
        The controlled renderer is not loaded in the application workspace, so
        the template-bound document view is unavailable here. The RFI content
        above is the authoritative record.
      </p>
    );
  }

  return (
    <div className="rfi-workspace-preview">
      <p className="rfi-workspace-preview__meta">
        {data.template
          ? `${data.template.name} · v${String(data.template.versionNumber)}`
          : "Template unavailable"}
      </p>
      <div
        className="rfi-workspace-preview__host"
        ref={hostRef}
        data-rfi-preview
      />
    </div>
  );
}
