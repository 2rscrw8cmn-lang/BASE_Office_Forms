// Linked RFI workspace. Reads one server read model (`getRfiWorkspace`) and
// renders the RFI record, its project-populated context, supporting attachments,
// a read-only template-bound document view, and the activity timeline. The
// workspace and the register operate on the same authoritative RFI record: short
// fields are inline-editable in the register, and all draft fields (including
// long-form Question / Contractor Suggestion) are editable here through the same
// update service under optimistic concurrency. Template structure, labels, and
// branding are never editable here — that stays a global Studio concern.
import {
  escapeHtml,
  formatDate,
  describeActivity,
  actorLabel,
  rfiActivityDetail,
  rfiStatusLabel,
  rfiStatusTone,
  rfiNumberLabel,
  rfiAttachmentRoleLabel,
} from "./app-format.js";

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

function addressLine(address) {
  if (!address) return "";
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.region, address.postalCode]
      .filter(Boolean)
      .join(" "),
    address.country,
  ].filter((part) => part && String(part).trim());
  return parts.join(", ");
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
        status: error?.status === 404 || error?.status === 403 ? "missing" : "error",
        data: null,
        error,
      };
      announce?.(
        error?.status === 404 ? "RFI not found." : "RFI could not be loaded.",
      );
      requestRender();
    }
  }

  // ---- sections ---------------------------------------------------------

  function header(data) {
    const rfi = data.rfi;
    const caps = data.capabilities;
    let primary = "";
    if (caps.markReady)
      primary = `<button class="primary-button" type="button" data-action="ready"${busy ? " disabled" : ""}>Mark ready to issue</button>`;
    else if (caps.issue)
      primary = `<button class="primary-button" type="button" data-action="issue"${busy ? " disabled" : ""}>Issue RFI</button>`;
    else if (caps.reopen)
      primary = `<button class="primary-button" type="button" data-action="reopen"${busy ? " disabled" : ""}>Reopen</button>`;
    else if (caps.close)
      primary = `<button class="primary-button" type="button" data-action="close"${busy ? " disabled" : ""}>Close RFI</button>`;
    const voidAction = caps.void
      ? `<button class="secondary-button is-quiet" type="button" data-action="void"${busy ? " disabled" : ""}>Void</button>`
      : "";
    const flag = rfi.isOverdue
      ? `<span class="rfi-flag rfi-flag-overdue">Overdue</span>`
      : rfi.dueSoon
        ? `<span class="rfi-flag rfi-flag-soon">Due soon</span>`
        : "";
    return `<nav class="document-breadcrumbs" aria-label="Breadcrumb"><a href="${registerHref}" data-app-link>RFIs</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(rfiNumberLabel(rfi.rfiNumber))}</span></nav>
      <header class="rfi-workspace-header">
        <div class="rfi-workspace-identity">
          <p class="rfi-workspace-number">${rfi.rfiNumber ? escapeHtml(rfi.rfiNumber) : '<span class="rfi-number-draft">Unnumbered Draft</span>'}${rfi.legacyReference ? ` <span class="rfi-legacy">Legacy ${escapeHtml(rfi.legacyReference)}</span>` : ""}</p>
          <h2 id="page-title" tabindex="-1">${escapeHtml(rfi.subject)}</h2>
          <p class="rfi-workspace-project">${escapeHtml(data.project.name)}${data.project.projectNumber ? ` · ${escapeHtml(data.project.projectNumber)}` : ""}</p>
        </div>
        <div class="rfi-workspace-header-side">
          <span class="status-badge status-${rfiStatusTone(rfi.status)}">${escapeHtml(rfiStatusLabel(rfi.status))}</span>${flag}
          ${primary || voidAction ? `<div class="rfi-workspace-actions">${primary}${voidAction}</div>` : ""}
        </div>
      </header>
      <dl class="rfi-workspace-keyfacts">
        <div><dt>Responsible party</dt><dd>${escapeHtml(rfi.responsibleParty || "—")}</dd></div>
        <div><dt>Requested response date</dt><dd>${escapeHtml(formatDate(rfi.requestedResponseDate) || "—")}</dd></div>
        <div><dt>Issued</dt><dd>${escapeHtml(formatDate(rfi.issuedAt) || "Not issued")}</dd></div>
      </dl>`;
  }

  function infoField(label, value, opts = {}) {
    const body = value
      ? opts.pre
        ? `<p class="rfi-info-pre">${escapeHtml(value)}</p>`
        : escapeHtml(value)
      : '<span class="rfi-info-empty">Not provided</span>';
    return `<div class="rfi-info-field${opts.wide ? " is-wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${body}</dd></div>`;
  }

  function infoSection(data) {
    const rfi = data.rfi;
    const canEdit = data.capabilities.updateDraft === true;
    const editAction =
      canEdit && !editing
        ? `<button class="secondary-button" type="button" data-edit-info>Edit RFI information</button>`
        : "";
    if (editing) return infoEditForm(rfi);
    return `<section class="rfi-info-panel" aria-labelledby="rfi-info-title">
      <div class="document-section-heading"><h3 id="rfi-info-title">RFI information</h3>${editAction}</div>
      <dl class="rfi-info-grid">
        ${infoField("Subject", rfi.subject, { wide: true })}
        ${infoField("Question", rfi.question, { wide: true, pre: true })}
        ${infoField("Contractor suggestion", rfi.contractorSuggestion, { wide: true, pre: true })}
        ${infoField("Drawing references", rfi.drawingReferences)}
        ${infoField("Specification references", rfi.specificationReferences)}
        ${infoField("Responsible party", rfi.responsibleParty)}
        ${infoField("Requested response date", formatDate(rfi.requestedResponseDate))}
      </dl>
    </section>`;
  }

  function infoEditForm(rfi) {
    const field = (name, label, value, textarea = false) =>
      textarea
        ? `<div class="app-field is-wide"><label for="rfi-f-${name}">${escapeHtml(label)}</label><textarea id="rfi-f-${name}" name="${name}" rows="3">${escapeHtml(value || "")}</textarea></div>`
        : `<div class="app-field"><label for="rfi-f-${name}">${escapeHtml(label)}</label><input id="rfi-f-${name}" name="${name}" value="${escapeHtml(value || "")}" autocomplete="off"></div>`;
    return `<section class="rfi-info-panel" aria-labelledby="rfi-info-title">
      <form data-info-form>
        <div class="document-section-heading"><h3 id="rfi-info-title">Edit RFI information</h3></div>
        <p class="app-dialog-error" role="alert" hidden></p>
        <div class="rfi-info-form">
          <div class="app-field is-wide"><label for="rfi-f-subject">Subject <span aria-hidden="true">*</span></label><input id="rfi-f-subject" name="subject" value="${escapeHtml(rfi.subject || "")}" required autocomplete="off"></div>
          ${field("question", "Question *", rfi.question, true)}
          ${field("contractorSuggestion", "Contractor suggestion", rfi.contractorSuggestion, true)}
          <div class="app-field-row">
            ${field("drawingReferences", "Drawing references", rfi.drawingReferences)}
            ${field("specificationReferences", "Specification references", rfi.specificationReferences)}
          </div>
          <div class="app-field-row">
            ${field("responsibleParty", "Responsible party", rfi.responsibleParty)}
            <div class="app-field"><label for="rfi-f-requestedResponseDate">Requested response date</label><input id="rfi-f-requestedResponseDate" name="requestedResponseDate" type="date" value="${escapeHtml(rfi.requestedResponseDate || "")}"></div>
          </div>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="secondary-button" data-cancel-info>Cancel</button>
          <button type="submit" class="primary-button" data-save-info${busy ? " disabled" : ""}>${busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </section>`;
  }

  function projectSection(data) {
    const address = addressLine(data.project.address);
    return `<section class="rfi-project-panel" aria-labelledby="rfi-project-title">
      <div class="document-section-heading"><h3 id="rfi-project-title">Project information</h3></div>
      <dl class="rfi-info-grid">
        ${infoField("Organization", data.organization?.name || "—")}
        ${infoField("Project", data.project.name)}
        ${infoField("BASE project number", data.project.projectNumber)}
        ${infoField("Project address", address, { wide: true })}
      </dl>
      <p class="rfi-project-note">These values come from the project record and are not stored on the RFI.</p>
    </section>`;
  }

  function attachmentList(items) {
    if (!items.length)
      return `<p class="rfi-attachment-empty">None yet.</p>`;
    return `<ul class="rfi-attachment-list">${items
      .map(
        (item) =>
          `<li><div class="rfi-attachment-copy"><strong>${escapeHtml(item.originalFilename)}</strong><span>${escapeHtml(formatBytes(item.byteSize))} · Uploaded ${escapeHtml(formatDate(item.uploadedAt) || "—")}</span></div><a class="secondary-button is-quiet" href="${attachmentContentHref(item.id)}" target="_blank" rel="noopener">View</a></li>`,
      )
      .join("")}</ul>`;
  }

  function attachmentsSection(data) {
    const groups = data.attachments || {
      supporting_attachment: [],
      reference_drawing: [],
    };
    const uploader = data.capabilities.uploadAttachment
      ? `<form class="rfi-attachment-upload" data-attachment-form>
          <div class="app-field"><label for="rfi-att-role">Role</label>
            <select id="rfi-att-role" name="role">${ROLE_OPTIONS.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select>
          </div>
          <div class="app-field"><label for="rfi-att-file">File</label><input id="rfi-att-file" name="file" type="file" required></div>
          <button type="submit" class="secondary-button" data-upload-attachment${busy ? " disabled" : ""}>${busy ? "Uploading…" : "Add attachment"}</button>
          <p class="app-dialog-error" role="alert" data-attachment-error hidden></p>
        </form>`
      : "";
    return `<section class="rfi-attachments-panel" aria-labelledby="rfi-attach-title">
      <div class="document-section-heading"><h3 id="rfi-attach-title">Supporting attachments</h3></div>
      <div class="rfi-attachment-group"><h4>${escapeHtml(rfiAttachmentRoleLabel("supporting_attachment"))}</h4>${attachmentList(groups.supporting_attachment)}</div>
      <div class="rfi-attachment-group"><h4>${escapeHtml(rfiAttachmentRoleLabel("reference_drawing"))}</h4>${attachmentList(groups.reference_drawing)}</div>
      ${uploader}
    </section>`;
  }

  // Read-only template-bound document view. Uses the approved BASE RFI template's
  // labels with the RFI/project values bound in — never exposes template editing.
  function documentSection(data) {
    const rfi = data.rfi;
    const template = data.template;
    const line = (label, value, pre = false) =>
      `<div class="rfi-doc-line${pre ? " is-pre" : ""}"><span class="rfi-doc-label">${escapeHtml(label)}</span><span class="rfi-doc-value">${value ? escapeHtml(value) : "—"}</span></div>`;
    const response = data.responses?.[0]?.response || "";
    return `<section class="rfi-document-panel" aria-labelledby="rfi-doc-title">
      <div class="document-section-heading"><h3 id="rfi-doc-title">Document view</h3><span class="rfi-doc-template">${template ? `${escapeHtml(template.name)} · v${escapeHtml(String(template.versionNumber))}` : "Template unavailable"}</span></div>
      <article class="rfi-document" aria-label="RFI document preview">
        <header class="rfi-document-head"><span class="rfi-document-org">${escapeHtml(data.organization?.name || "BASE Construction")}</span><span class="rfi-document-type">Request for Information</span><span class="rfi-document-no">${escapeHtml(rfiNumberLabel(rfi.rfiNumber))}</span></header>
        ${line("Project", `${data.project.name}${data.project.projectNumber ? ` (${data.project.projectNumber})` : ""}`)}
        ${line("Subject", rfi.subject)}
        ${line("Responsible party", rfi.responsibleParty)}
        ${line("Requested response date", formatDate(rfi.requestedResponseDate))}
        ${line("Question", rfi.question, true)}
        ${line("Contractor suggestion", rfi.contractorSuggestion, true)}
        ${line("Drawing references", rfi.drawingReferences)}
        ${line("Specification references", rfi.specificationReferences)}
        ${line("Response", response, true)}
      </article>
      <p class="rfi-doc-note">This preview binds the current RFI and project values into the approved BASE RFI template. The issued PDF is generated when the RFI is issued.</p>
    </section>`;
  }

  function activitySection(data) {
    const events = data.activity || [];
    if (!events.length) return "";
    return `<section class="rfi-activity-panel" aria-labelledby="rfi-activity-title">
      <div class="document-section-heading"><h3 id="rfi-activity-title">Activity</h3></div>
      <ol class="rfi-activity-list">${events
        .map((event) => {
          const detail = rfiActivityDetail(event);
          return `<li><div class="rfi-activity-main"><strong>${escapeHtml(describeActivity(event.action))}</strong>${detail ? `<span class="rfi-activity-detail">${escapeHtml(detail)}</span>` : ""}</div><span class="rfi-activity-meta">${escapeHtml(actorLabel(event))} · ${escapeHtml(formatDate(event.createdAt) || "")}</span></li>`;
        })
        .join("")}</ol>
    </section>`;
  }

  function loaded(data) {
    return `${header(data)}
      <div class="rfi-workspace-grid">
        <div class="rfi-workspace-main">${infoSection(data)}${documentSection(data)}${attachmentsSection(data)}</div>
        <aside class="rfi-workspace-aside">${projectSection(data)}${activitySection(data)}</aside>
      </div>`;
  }

  function markup() {
    if (state.status === "loading")
      return '<div class="record-detail-skeleton" aria-busy="true" aria-label="Loading RFI"><span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span></div>';
    if (state.status === "missing")
      return `<div class="route-state route-not-found"><h2 id="page-title" tabindex="-1">RFI not found</h2><p>The requested RFI is unavailable or you do not have access to it.</p><a class="record-back-link" href="${registerHref}" data-app-link>← Back to RFIs</a></div>`;
    if (state.status === "error")
      return `<div class="inline-error" role="alert"><h2 id="page-title" tabindex="-1">RFI could not be loaded</h2><p>${escapeHtml(state.error?.message || "No changes were made. Check your connection and try again.")}</p>${state.error?.requestId ? `<p class="request-id">Request ID <code>${escapeHtml(state.error.requestId)}</code></p>` : ""}<button class="secondary-button" type="button" data-rfi-retry>Try again</button></div>`;
    return loaded(state.data);
  }

  // ---- actions ----------------------------------------------------------

  async function runTransition(action) {
    if (busy || !state.data) return;
    busy = true;
    requestRender();
    announce?.("Working…");
    try {
      const method = {
        ready: () => api.request(actionUrl("ready"), { method: "POST" }),
        issue: () => api.request(actionUrl("issue"), { method: "POST" }),
        close: () => api.request(actionUrl("close"), { method: "POST" }),
        reopen: () => api.request(actionUrl("reopen"), { method: "POST" }),
        void: () => api.request(actionUrl("void"), { method: "POST" }),
      }[action];
      await method();
      busy = false;
      announce?.("RFI updated.");
      await reload();
    } catch (error) {
      busy = false;
      announce?.(
        error?.status === 409
          ? "This RFI changed elsewhere. Reloading."
          : "The action could not be completed.",
      );
      if (error?.status === 409) await reload();
      else requestRender();
    }
  }

  function actionUrl(action) {
    return `/api/v2/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}/${action}`;
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
    announce?.("Saving…");
    try {
      await api.updateRfi(projectId, rfiId, {
        subject,
        question,
        contractorSuggestion: read("contractorSuggestion") || null,
        drawingReferences: read("drawingReferences") || null,
        specificationReferences: read("specificationReferences") || null,
        responsibleParty: read("responsibleParty") || null,
        requestedResponseDate: read("requestedResponseDate") || null,
        lockVersion: state.data.rfi.lockVersion,
      });
      busy = false;
      editing = false;
      announce?.("RFI information saved.");
      await reload();
    } catch (error) {
      busy = false;
      if (error?.status === 409) {
        announce?.("This RFI changed elsewhere. Reloading the latest.");
        await reload();
        return;
      }
      requestRender();
      const liveForm = container.querySelector("[data-info-form]");
      if (liveForm)
        showFormError(
          liveForm,
          error?.message || "The change could not be saved.",
        );
      announce?.("The change could not be saved.");
    }
  }

  function showFormError(form, message) {
    const banner = form.querySelector(".app-dialog-error");
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  }

  async function uploadAttachment(container, form) {
    if (busy) return;
    const file = form.querySelector("[name=file]")?.files?.[0];
    const role = form.querySelector("[name=role]")?.value;
    const errorEl = form.querySelector("[data-attachment-error]");
    if (!file) {
      if (errorEl) {
        errorEl.textContent = "Choose a file to upload.";
        errorEl.hidden = false;
      }
      return;
    }
    busy = true;
    requestRender();
    announce?.("Uploading attachment…");
    try {
      await api.uploadRfiAttachment(projectId, rfiId, role, file);
      busy = false;
      announce?.("Attachment added.");
      await reload();
    } catch (error) {
      busy = false;
      requestRender();
      const liveError = container.querySelector("[data-attachment-error]");
      if (liveError) {
        liveError.textContent =
          error?.message || "The attachment could not be added.";
        liveError.hidden = false;
      }
      announce?.("The attachment could not be added.");
    }
  }

  function bindLinks(container) {
    container.querySelectorAll("a[data-app-link]").forEach((link) =>
      link.addEventListener("click", (event) => {
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
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
    container.querySelector("[data-edit-info]")?.addEventListener("click", () => {
      editing = true;
      requestRender();
    });
    container.querySelector("[data-cancel-info]")?.addEventListener("click", () => {
      editing = false;
      requestRender();
    });
    const infoForm = container.querySelector("[data-info-form]");
    infoForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveInfo(container, infoForm);
    });
    const attachForm = container.querySelector("[data-attachment-form]");
    attachForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      uploadAttachment(container, attachForm);
    });
  }

  function destroy() {
    destroyed = true;
    sequence += 1;
    controller?.abort();
  }

  return { mount, reload, destroy };
}
