import { escapeHtml } from "./app-format.js";
import { DISCIPLINE_OPTIONS } from "./record-options.js";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";
const TYPE_OPTIONS = [
  ["document", "Document"],
  ["drawing", "Drawing"],
  ["specification", "Specification"],
  ["schedule", "Schedule"],
  ["report", "Report"],
  ["correspondence", "Correspondence"],
  ["other", "Other"],
];

export function createAddDocumentForm({
  api,
  projectId,
  document: doc,
  announce,
  onSuccess,
  onClose,
}) {
  const previousFocus = doc.activeElement;
  let closed = false;
  let submitting = false;
  let mode = null;
  let createdRecord = null;
  let createdRevision = null;
  const overlay = doc.createElement("div");
  overlay.className = "app-dialog-overlay";

  function choiceMarkup() {
    return `<div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="add-document-title" aria-describedby="add-document-desc"><div class="app-dialog-head"><div><h2 id="add-document-title" tabindex="-1">Add document</h2><p id="add-document-desc">Start with the actual project document, or reserve an empty document identity.</p></div><button type="button" class="app-dialog-close" data-close aria-label="Close dialog">×</button></div><div class="app-dialog-body add-document-choices"><button type="button" class="add-document-choice is-primary" data-mode="upload"><strong>Upload a document</strong><span>Create its document identity, first draft, and file in one guided flow.</span></button><button type="button" class="add-document-choice" data-mode="empty"><strong>Create an empty document record</strong><span>Reserve a document identity and begin an empty draft for later upload.</span></button><p class="add-document-library-note">Library masters cannot yet be instantiated as project-specific documents.</p></div><div class="app-dialog-actions"><button type="button" class="secondary-button" data-close>Cancel</button></div></div>`;
  }

  function formMarkup() {
    const uploading = mode === "upload";
    return `<div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="add-document-title" aria-describedby="add-document-desc"><form novalidate><div class="app-dialog-head"><div><button class="text-link add-document-back" type="button" data-back>← Choose another option</button><h2 id="add-document-title" tabindex="-1">${uploading ? "Upload a document" : "Create an empty document"}</h2><p id="add-document-desc">${uploading ? "Add document details and the first file. A draft revision will be created automatically." : "Reserve the identity now. An empty draft will be ready for upload."}</p></div><button type="button" class="app-dialog-close" data-close aria-label="Close dialog">×</button></div><p class="app-dialog-error" role="alert" hidden></p><div class="app-dialog-body"><div class="app-field-row"><div class="app-field"><label for="add-type">Document type</label><select id="add-type" name="recordType">${TYPE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div><div class="app-field"><label for="add-discipline">Discipline</label><select id="add-discipline" name="discipline"><option value="">Select discipline</option>${DISCIPLINE_OPTIONS.map(({ value, label }) => `<option value="${value}">${label}</option>`).join("")}</select></div></div><div class="app-field"><label for="add-title">Title <span aria-hidden="true">*</span></label><input id="add-title" name="title" required autocomplete="off" aria-describedby="add-title-error"><p class="app-field-error" id="add-title-error" hidden></p></div><div class="app-field"><label for="add-description">Description</label><textarea id="add-description" name="description" rows="2"></textarea></div><div class="app-field"><label for="add-summary">Initial change summary <span aria-hidden="true">*</span></label><textarea id="add-summary" name="changeSummary" rows="2" required aria-describedby="add-summary-error">Initial document</textarea><p class="app-field-error" id="add-summary-error" hidden></p></div>${uploading ? '<div class="app-field add-document-file"><label for="add-file">Document file <span aria-hidden="true">*</span></label><input id="add-file" name="file" type="file" required aria-describedby="add-file-error"><p class="app-field-error" id="add-file-error" hidden></p></div>' : ""}<div class="add-document-recovery" hidden></div></div><div class="app-dialog-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button type="submit" class="primary-button" data-submit>${uploading ? "Create document and upload" : "Create document"}</button></div></form></div>`;
  }

  function renderChoice() {
    overlay.innerHTML = choiceMarkup();
    bindCommon();
    overlay.querySelectorAll("[data-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        mode = button.getAttribute("data-mode");
        renderForm();
      }),
    );
    overlay.querySelector("[data-mode='upload']")?.focus();
  }

  function renderForm() {
    overlay.innerHTML = formMarkup();
    bindCommon();
    overlay
      .querySelector("[data-back]")
      ?.addEventListener("click", renderChoice);
    overlay.querySelector("form")?.addEventListener("submit", submit);
    overlay.querySelector("#add-title")?.focus();
  }

  function bindCommon() {
    overlay.querySelectorAll("[data-close]").forEach((button) =>
      button.addEventListener("click", () => {
        if (!submitting) close();
      }),
    );
  }

  function value(name) {
    return (overlay.querySelector(`[name="${name}"]`)?.value || "").trim();
  }

  function setFieldError(name, message) {
    const input = overlay.querySelector(`[name="${name}"]`);
    const error = overlay.querySelector(
      `#add-${name === "changeSummary" ? "summary" : name}-error`,
    );
    if (!input || !error) return;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    error.textContent = message || "";
    error.hidden = !message;
  }

  function validate() {
    let valid = true;
    const title = value("title");
    const summary = value("changeSummary");
    setFieldError("title", title ? "" : "Document title is required.");
    setFieldError(
      "changeSummary",
      summary ? "" : "An initial change summary is required.",
    );
    valid = Boolean(title && summary);
    if (mode === "upload") {
      const file = overlay.querySelector("[name='file']")?.files?.[0];
      setFieldError("file", file ? "" : "Choose a document file to upload.");
      valid = valid && Boolean(file);
    }
    return valid;
  }

  function showError(message, requestId, recoveryHref, recoveryLabel) {
    const banner = overlay.querySelector(".app-dialog-error");
    banner.innerHTML = `${escapeHtml(message)}${requestId ? ` <span class="request-id">Request ID <code>${escapeHtml(requestId)}</code></span>` : ""}`;
    banner.hidden = false;
    const recovery = overlay.querySelector(".add-document-recovery");
    if (recoveryHref) {
      recovery.innerHTML = `<p>Your completed work is safe.${createdRecord?.recordNumber ? ` Document ${escapeHtml(createdRecord.recordNumber)} was created.` : ""}</p><a href="${recoveryHref}" data-recovery>${escapeHtml(recoveryLabel)}</a>`;
      recovery.hidden = false;
      recovery.querySelector("a")?.addEventListener("click", (event) => {
        event.preventDefault();
        close({ restoreFocus: false });
        onSuccess?.({ href: recoveryHref });
      });
    }
  }

  function setSubmitting(value) {
    submitting = value;
    const button = overlay.querySelector("[data-submit]");
    button.disabled = value;
    button.setAttribute("aria-busy", String(value));
    button.textContent = value
      ? "Creating document…"
      : mode === "upload"
        ? "Create document and upload"
        : "Create document";
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting || !validate()) {
      if (!submitting) {
        overlay.querySelector('[aria-invalid="true"]')?.focus();
        announce?.("Please correct the highlighted fields.");
      }
      return;
    }
    setSubmitting(true);
    const recordInput = {
      recordType: value("recordType"),
      title: value("title"),
      ...(value("discipline") ? { discipline: value("discipline") } : {}),
      ...(value("description") ? { description: value("description") } : {}),
    };
    try {
      const recordResponse = await api.createRecord(projectId, recordInput);
      if (closed) return;
      createdRecord = recordResponse.data;
      const revisionResponse = await api.createRevision(
        projectId,
        createdRecord.id,
        { changeSummary: value("changeSummary") },
      );
      if (closed) return;
      createdRevision = revisionResponse.data;
      if (mode === "upload") {
        const file = overlay.querySelector("[name='file']")?.files?.[0];
        await api.uploadRevisionFile(
          projectId,
          createdRecord.id,
          createdRevision.id,
          file,
        );
      }
      if (closed) return;
      announce?.(
        mode === "upload"
          ? `Document ${createdRecord.recordNumber} created and uploaded.`
          : `Document ${createdRecord.recordNumber} and draft created.`,
      );
      close({ restoreFocus: false });
      onSuccess?.({ record: createdRecord, revision: createdRevision });
    } catch (error) {
      if (closed) return;
      setSubmitting(false);
      if (createdRevision) {
        showError(
          "The draft was created, but the file could not be uploaded. Open the draft to retry the upload.",
          error?.requestId,
          `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(createdRecord.id)}/revisions/${encodeURIComponent(createdRevision.id)}`,
          "Open draft and retry upload",
        );
      } else if (createdRecord) {
        showError(
          "The document identity was created, but its first draft could not be created.",
          error?.requestId,
          `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(createdRecord.id)}`,
          "Open document",
        );
      } else {
        showError(
          error?.message || "The document could not be created.",
          error?.requestId,
        );
      }
      announce?.("The document workflow could not be completed.");
    }
  }

  function close({ restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    overlay.remove();
    doc.body.classList.remove("app-dialog-open");
    if (restoreFocus && previousFocus?.focus) previousFocus.focus();
    onClose?.();
  }

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...overlay.querySelectorAll(FOCUSABLE)].filter(
      (item) => !item.hidden && !item.disabled,
    );
    if (!items.length) return;
    if (event.shiftKey && doc.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1).focus();
    } else if (!event.shiftKey && doc.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay && !submitting) close();
  });
  doc.body.appendChild(overlay);
  doc.body.classList.add("app-dialog-open");
  renderChoice();
  return { close };
}
