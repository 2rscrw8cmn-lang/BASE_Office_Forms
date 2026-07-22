// Specialized record workspace for RFIs, using the same hierarchy and visual
// family as the Documents record-detail surface.
import {
  escapeHtml,
  formatDate,
  describeActivity,
  actorLabel,
  rfiActivityDetail,
  rfiStatusLabel,
  rfiStatusTone,
  rfiAttachmentRoleLabel,
} from "./app-format.js";
import { renderRfiTemplatePreview } from "./rfi-template-preview.js";

const ROLE_OPTIONS = [
  ["supporting_attachment", "Supporting attachment"],
  ["reference_drawing", "Reference drawing"],
];

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createRfiWorkspaceView({
  api,
  projectId,
  rfiId,
  navigate,
  announce,
  requestRender,
}) {
  let state = { status: "loading", data: null, error: null };
  let controller = null;
  let destroyed = false;
  let sequence = 0;
  let editing = false;
  let busy = false;
  const registerHref = `/projects/${encodeURIComponent(projectId)}/rfis`;
  const attachmentContentHref = (attachmentId) =>
    `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}/attachments/${encodeURIComponent(attachmentId)}/content`;

  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const current = ++sequence;
    state = { status: "loading", data: null, error: null };
    editing = false;
    requestRender();
    try {
      const { data } = await api.getRfiWorkspace(projectId, rfiId, {
        signal: controller.signal,
      });
      if (destroyed || current !== sequence) return;
      state = { status: "loaded", data, error: null };
      requestRender();
    } catch (error) {
      if (destroyed || current !== sequence || error?.aborted) return;
      state = {
        status:
          error?.status === 404 || error?.status === 403 ? "missing" : "error",
        data: null,
        error,
      };
      announce?.("RFI could not be loaded.");
      requestRender();
    }
  }

  function displayStatus(data) {
    if (data.rfi.issuanceReconciliationState === "legacy_incomplete") {
      return '<span class="status-badge status-attention">Needs issue repair</span>';
    }
    return `<span class="status-badge status-${rfiStatusTone(data.rfi.status)}">${escapeHtml(rfiStatusLabel(data.rfi.status))}</span>`;
  }

  function optionsMarkup(data) {
    const actions = [];
    if (data.capabilities.void)
      actions.push(
        '<button class="is-destructive" type="button" data-action="void">Void RFI</button>',
      );
    return actions.length
      ? `<details class="document-options"><summary aria-label="RFI options">…</summary><div>${actions.join("")}</div></details>`
      : "";
  }

  function primaryAction(data) {
    if (data.capabilities.updateDraft && !editing)
      return '<button class="primary-button" type="button" data-edit-info>Edit current draft</button>';
    if (data.capabilities.close)
      return '<button class="primary-button" type="button" data-action="close">Close RFI</button>';
    if (data.capabilities.reopen)
      return '<button class="primary-button" type="button" data-action="reopen">Reopen RFI</button>';
    return "";
  }

  function header(data) {
    const rfi = data.rfi;
    const number = rfi.rfiNumber
      ? `${rfi.issuanceReconciliationState === "legacy_incomplete" ? "Reserved " : ""}${rfi.rfiNumber}`
      : "Unnumbered Draft";
    return `<nav class="document-breadcrumbs" aria-label="Breadcrumb"><a href="${registerHref}" data-app-link>RFIs</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(number)}</span></nav>
      <header class="document-identity rfi-document-identity">
        <div><p class="document-section-label">${escapeHtml(number)}</p><div class="document-title-row"><h2 id="page-title" tabindex="-1">${escapeHtml(rfi.subject)}</h2></div></div>
        <div class="document-header-actions">${primaryAction(data)}${optionsMarkup(data)}</div>
      </header>
      <div class="document-header-facts rfi-metadata-strip">
        <span><small>Status</small><strong>${displayStatus(data)}</strong></span>
        <span><small>Responsible party</small><strong>${escapeHtml(rfi.responsibleParty || "Unassigned")}${rfi.responsiblePartyLegacyText ? ' <em class="rfi-legacy">Unresolved</em>' : ""}</strong></span>
        <span><small>Response due</small><strong>${escapeHtml(formatDate(rfi.requestedResponseDate) || "—")}</strong></span>
        ${rfi.issuedAt && rfi.issuanceReconciliationState !== "legacy_incomplete" ? `<span><small>Issued</small><strong>${escapeHtml(formatDate(rfi.issuedAt))}</strong></span>` : ""}
        <span><small>Current version</small><strong>${escapeHtml(data.currentVersion?.label || "Current Draft")}</strong></span>
      </div>
      ${rfi.issuanceReconciliationState === "legacy_incomplete" ? '<div class="document-read-only is-warning"><strong>Legacy issue requires reconciliation</strong><span>The consumed number and timestamp were preserved, but this RFI is not presented as officially issued because no immutable issued revision or official artifact exists.</span></div>' : ""}`;
  }

  function contentReadOnly(data) {
    const rfi = data.rfi;
    const field = (label, value, wide = false) =>
      `<div class="rfi-content-field${wide ? " is-wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${value ? escapeHtml(value) : '<span class="rfi-info-empty">Not provided</span>'}</dd></div>`;
    return `<dl class="rfi-content-grid">
      ${field("Question", rfi.question, true)}
      ${field("Contractor suggestion", rfi.contractorSuggestion, true)}
      ${field("Drawing references", rfi.drawingReferences)}
      ${field("Specification references", rfi.specificationReferences)}
    </dl>`;
  }

  function contactOptions(data) {
    return `<option value="">Unassigned</option>${(
      data.responsibleContacts || []
    )
      .map(
        (contact) =>
          `<option value="${escapeHtml(contact.id)}"${contact.id === data.rfi.responsiblePartyId ? " selected" : ""}>${escapeHtml(contact.name)}${contact.companyName ? ` — ${escapeHtml(contact.companyName)}` : ""}</option>`,
      )
      .join("")}`;
  }

  function contentEditForm(data) {
    const rfi = data.rfi;
    const field = (name, label, value, textarea = false) =>
      `<div class="app-field${textarea ? " is-wide" : ""}"><label for="rfi-f-${name}">${escapeHtml(label)}</label>${textarea ? `<textarea id="rfi-f-${name}" name="${name}" rows="4">${escapeHtml(value || "")}</textarea>` : `<input id="rfi-f-${name}" name="${name}" value="${escapeHtml(value || "")}">`}</div>`;
    return `<form data-info-form>
      <p class="app-dialog-error" role="alert" hidden></p>
      <div class="rfi-info-form">
        <div class="app-field is-wide"><label for="rfi-f-subject">Subject</label><input id="rfi-f-subject" name="subject" value="${escapeHtml(rfi.subject)}" required></div>
        ${field("question", "Question", rfi.question, true)}
        ${field("contractorSuggestion", "Contractor suggestion", rfi.contractorSuggestion, true)}
        <div class="app-field-row">${field("drawingReferences", "Drawing references", rfi.drawingReferences)}${field("specificationReferences", "Specification references", rfi.specificationReferences)}</div>
        <div class="app-field-row"><div class="app-field"><label for="rfi-f-responsiblePartyId">Responsible party</label><select id="rfi-f-responsiblePartyId" name="responsiblePartyId">${contactOptions(data)}</select>${rfi.responsiblePartyLegacyText ? `<small class="rfi-legacy-note">Legacy value “${escapeHtml(rfi.responsiblePartyLegacyText)}” remains preserved until a project contact is selected.</small>` : ""}</div><div class="app-field"><label for="rfi-f-requestedResponseDate">Response due</label><input id="rfi-f-requestedResponseDate" name="requestedResponseDate" type="date" value="${escapeHtml(rfi.requestedResponseDate || "")}"></div></div>
      </div>
      <div class="app-dialog-actions"><button type="button" class="secondary-button" data-cancel-info>Cancel</button><button type="submit" class="primary-button"${busy ? " disabled" : ""}>${busy ? "Saving…" : "Save draft"}</button></div>
    </form>`;
  }

  function fileRow(item) {
    return `<article class="document-file-card">
      <div class="document-file-icon" aria-hidden="true"><svg class="app-icon" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V21H6z"></path><path d="M14 3.5V8h4M9 12h6M9 16h4"></path></svg></div>
      <div class="document-file-copy"><strong>${escapeHtml(item.originalFilename)}</strong><span>${escapeHtml(rfiAttachmentRoleLabel(item.role))} · ${escapeHtml(item.revisionLabel)} · ${escapeHtml(formatBytes(item.byteSize))} · Uploaded ${escapeHtml(formatDate(item.uploadedAt) || "—")}</span></div>
      <a class="secondary-button" href="${attachmentContentHref(item.id)}" target="_blank" rel="noopener">View file</a>
    </article>`;
  }

  function filesSection(data) {
    const files = [
      ...(data.attachments?.supporting_attachment || []),
      ...(data.attachments?.reference_drawing || []),
    ];
    const uploader = data.capabilities.uploadAttachment
      ? `<form class="rfi-attachment-upload" data-attachment-form><div class="app-field"><label for="rfi-att-role">File role</label><select id="rfi-att-role" name="role">${ROLE_OPTIONS.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></div><div class="app-field"><label for="rfi-att-file">File</label><input id="rfi-att-file" name="file" type="file" required></div><button type="submit" class="secondary-button"${busy ? " disabled" : ""}>${busy ? "Uploading…" : "Add file"}</button><p class="app-dialog-error" role="alert" data-attachment-error hidden></p></form>`
      : "";
    return `<div class="document-files-heading"><h4>Files</h4><span>${files.length}</span></div>${files.length ? `<div class="document-files">${files.map(fileRow).join("")}</div>` : '<div class="document-upload-empty"><div><strong>No draft files yet</strong><p>Supporting material will remain attached to this exact draft revision.</p></div></div>'}${uploader}`;
  }

  function previewSection(data) {
    return `<section class="rfi-render-panel" aria-labelledby="rfi-preview-title"><div class="document-section-heading"><h3 id="rfi-preview-title">Template preview</h3><span>${data.template ? `${escapeHtml(data.template.name)} · v${escapeHtml(String(data.template.versionNumber))}` : "Template unavailable"}</span></div><div class="rfi-render-preview">${renderRfiTemplatePreview(data)}</div></section>`;
  }

  function currentVersionPanel(data) {
    return `<section class="document-work-panel is-draft rfi-current-version" aria-labelledby="work-title">
      <div class="document-work-head"><div><p class="document-section-label">Current draft</p><div class="document-work-title"><h3 id="work-title">${escapeHtml(data.currentVersion?.label || "Draft")}</h3><span class="status-badge status-attention">Draft</span></div></div><dl class="document-work-facts"><div><dt>Updated</dt><dd>${escapeHtml(formatDate(data.rfi.updatedAt) || "—")}</dd></div><div><dt>Issue</dt><dd><span class="issuance-badge">Unavailable in Slice 1</span></dd></div></dl></div>
      <div class="rfi-authoritative-content"><div class="document-section-heading"><h4>RFI content</h4>${data.capabilities.updateDraft && !editing ? '<button class="secondary-button" type="button" data-edit-info>Edit draft</button>' : ""}</div>${editing ? contentEditForm(data) : contentReadOnly(data)}</div>
      ${filesSection(data)}
    </section>${previewSection(data)}`;
  }

  function responseSection(data) {
    const responses = data.responses || [];
    const issued = [
      "open",
      "response_received",
      "returned_for_clarification",
      "closed",
    ].includes(data.rfi.status);
    if (!issued && !responses.length) return "";
    const latest = responses.at(-1);
    return `<section class="rfi-response-panel" aria-labelledby="rfi-response-title"><div class="document-section-heading"><h3 id="rfi-response-title">Response</h3><span>${latest ? `Returned ${escapeHtml(formatDate(latest.createdAt) || "—")}` : "Awaiting response"}</span></div>${latest ? `<p class="rfi-response-text">${escapeHtml(latest.response)}</p><dl class="rfi-response-facts"><div><dt>Responder</dt><dd>${escapeHtml(latest.respondedBy || "Not recorded")}</dd></div><div><dt>Cost impact</dt><dd>${escapeHtml(data.rfi.costImpact || "Not recorded")}</dd></div><div><dt>Schedule impact</dt><dd>${escapeHtml(data.rfi.scheduleImpact || "Not recorded")}</dd></div></dl>` : '<p class="section-empty">No response has been recorded.</p>'}</section>`;
  }

  function activitySection(data) {
    const events = data.activity || [];
    if (!events.length) return "";
    return `<details class="rfi-activity-panel"><summary>Activity history <span>${events.length}</span></summary><ol class="rfi-activity-list">${events
      .map((event) => {
        const detail = rfiActivityDetail(event);
        return `<li><div><strong>${escapeHtml(describeActivity(event.action))}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div><small>${escapeHtml(actorLabel(event))} · ${escapeHtml(formatDate(event.createdAt) || "")}</small></li>`;
      })
      .join("")}</ol></details>`;
  }

  function loaded(data) {
    return `${header(data)}${currentVersionPanel(data)}${responseSection(data)}${activitySection(data)}`;
  }

  function markup() {
    if (state.status === "loading")
      return '<div class="record-detail-skeleton" aria-busy="true"><span class="skeleton-line"></span><span class="skeleton-line"></span></div>';
    if (state.status === "missing")
      return `<div class="route-state route-not-found"><h2 id="page-title">RFI not found</h2><p>The requested RFI is unavailable or you do not have access.</p><a href="${registerHref}" data-app-link>← Back to RFIs</a></div>`;
    if (state.status === "error")
      return `<div class="inline-error" role="alert"><h2 id="page-title">RFI could not be loaded</h2><p>${escapeHtml(state.error?.message || "No changes were made.")}</p><button class="secondary-button" type="button" data-rfi-retry>Try again</button></div>`;
    return loaded(state.data);
  }

  function actionUrl(action) {
    return `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}/${action}`;
  }

  async function runTransition(action) {
    if (busy || !state.data) return;
    busy = true;
    requestRender();
    try {
      await api.request(actionUrl(action), { method: "POST" });
      busy = false;
      await reload();
    } catch (error) {
      busy = false;
      announce?.(error?.message || "The action could not be completed.");
      if (error?.status === 409) await reload();
      else requestRender();
    }
  }

  function showFormError(form, message) {
    const banner = form.querySelector(".app-dialog-error");
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  }

  async function saveInfo(container, form) {
    if (busy || !state.data) return;
    const read = (name) =>
      (form.querySelector(`[name="${name}"]`)?.value || "").trim();
    const subject = read("subject");
    const question = read("question");
    if (!subject || !question) {
      showFormError(form, "Subject and question are required.");
      return;
    }
    busy = true;
    requestRender();
    try {
      await api.updateRfi(projectId, rfiId, {
        subject,
        question,
        contractorSuggestion: read("contractorSuggestion") || null,
        drawingReferences: read("drawingReferences") || null,
        specificationReferences: read("specificationReferences") || null,
        responsiblePartyId: read("responsiblePartyId") || null,
        requestedResponseDate: read("requestedResponseDate") || null,
        lockVersion: state.data.rfi.lockVersion,
      });
      busy = false;
      editing = false;
      announce?.("RFI draft saved.");
      await reload();
    } catch (error) {
      busy = false;
      if (error?.status === 409) {
        announce?.("This RFI changed elsewhere. Latest values were loaded.");
        await reload();
        return;
      }
      requestRender();
      const liveForm = container.querySelector("[data-info-form]");
      if (liveForm)
        showFormError(
          liveForm,
          error?.message || "The draft could not be saved.",
        );
    }
  }

  async function uploadAttachment(container, form) {
    if (busy) return;
    const file = form.querySelector("[name=file]")?.files?.[0];
    const role = form.querySelector("[name=role]")?.value;
    if (!file) {
      showFormError(form, "Choose a file to upload.");
      return;
    }
    busy = true;
    requestRender();
    try {
      await api.uploadRfiAttachment(projectId, rfiId, role, file);
      busy = false;
      announce?.("Draft file added.");
      await reload();
    } catch (error) {
      busy = false;
      requestRender();
      const live = container.querySelector("[data-attachment-form]");
      if (live)
        showFormError(live, error?.message || "The file could not be added.");
    }
  }

  function bindLinks(container) {
    container.querySelectorAll("a[data-app-link]").forEach((link) =>
      link.addEventListener("click", (event) => {
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        navigate(link.getAttribute("href"));
      }),
    );
  }

  function mount(container) {
    container.innerHTML = `<section class="rfi-workspace-view app-container-register">${markup()}</section>`;
    bindLinks(container);
    container
      .querySelector("[data-rfi-retry]")
      ?.addEventListener("click", reload);
    container
      .querySelectorAll("[data-action]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          runTransition(button.getAttribute("data-action")),
        ),
      );
    container.querySelectorAll("[data-edit-info]").forEach((button) =>
      button.addEventListener("click", () => {
        editing = true;
        requestRender();
      }),
    );
    container
      .querySelector("[data-cancel-info]")
      ?.addEventListener("click", () => {
        editing = false;
        requestRender();
      });
    const infoForm = container.querySelector("[data-info-form]");
    infoForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveInfo(container, infoForm);
    });
    const attachmentForm = container.querySelector("[data-attachment-form]");
    attachmentForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      uploadAttachment(container, attachmentForm);
    });
  }

  function destroy() {
    destroyed = true;
    sequence += 1;
    controller?.abort();
  }

  return { mount, reload, destroy };
}
