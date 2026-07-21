import { escapeHtml, recordTypeLabel } from "./app-format.js";
import {
  DISCIPLINE_OPTIONS,
  isControlledDiscipline,
} from "./record-options.js";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]";

function disciplineOptions(current) {
  const value = String(current ?? "");
  const legacy = value && !isControlledDiscipline(value);
  return `<option value=""${value ? "" : " selected"}>No discipline</option>${legacy ? `<option value="${escapeHtml(value)}" selected>Legacy: ${escapeHtml(value)} — choose a replacement</option>` : ""}${DISCIPLINE_OPTIONS.map(({ value: optionValue, label }) => `<option value="${optionValue}"${optionValue === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}`;
}

function createDialog({
  document: doc,
  title,
  description,
  body,
  submitLabel,
  destructive = false,
  onSubmit,
  onClose,
}) {
  const previousFocus = doc.activeElement;
  const overlay = doc.createElement("div");
  let submitting = false;
  let closed = false;
  overlay.className = "app-dialog-overlay";
  overlay.innerHTML = `<div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="rd-dialog-title" aria-describedby="rd-dialog-desc"><form novalidate>
    <div class="app-dialog-head"><div><h2 id="rd-dialog-title" tabindex="-1">${escapeHtml(title)}</h2><p id="rd-dialog-desc">${escapeHtml(description)}</p></div><button type="button" class="app-dialog-close" data-close aria-label="Close dialog">×</button></div>
    <p class="app-dialog-error" role="alert" hidden></p><div class="app-dialog-body">${body}</div>
    <div class="app-dialog-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button type="submit" class="${destructive ? "danger-button" : "primary-button"}" data-submit>${escapeHtml(submitLabel)}</button></div>
  </form></div>`;
  doc.body.appendChild(overlay);
  doc.body.classList.add("app-dialog-open");
  const form = overlay.querySelector("form");
  const submit = overlay.querySelector("[data-submit]");
  const banner = overlay.querySelector(".app-dialog-error");

  function showError(message, requestId) {
    banner.innerHTML = `${escapeHtml(message)}${requestId ? ` <span class="request-id">Request ID <code>${escapeHtml(requestId)}</code></span>` : ""}`;
    banner.hidden = false;
  }
  function fieldError(input, id, message) {
    const target = overlay.querySelector(`#${id}`);
    if (!target) return;
    target.textContent = message || "";
    target.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
  function setSubmitting(value) {
    submitting = value;
    submit.disabled = value;
    submit.setAttribute("aria-busy", String(value));
    submit.textContent = value ? "Working…" : submitLabel;
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
  overlay.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!submitting) close();
    }),
  );
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay && !submitting) close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    banner.hidden = true;
    setSubmitting(true);
    try {
      await onSubmit({ overlay, fieldError });
      if (!closed) close({ restoreFocus: false });
    } catch (error) {
      if (!closed) {
        setSubmitting(false);
        showError(
          error?.message || "The request could not be completed.",
          error?.requestId,
        );
      }
    }
  });
  overlay.querySelector("input, textarea, [data-submit]")?.focus();
  return { close };
}

function inputValue(overlay, name) {
  return (overlay.querySelector(`[name="${name}"]`)?.value || "").trim();
}

export function createEditRecordDialog({
  api,
  projectId,
  record,
  document,
  announce,
  onSuccess,
  onClose,
}) {
  const value = (item) => escapeHtml(item ?? "");
  return createDialog({
    document,
    title: "Edit document details",
    description: `${record.recordNumber ? `Document ${record.recordNumber} · ` : ""}${recordTypeLabel(record.recordType)} metadata`,
    submitLabel: "Save changes",
    onClose,
    body: `<div class="app-field"><label for="rd-title">Title <span aria-hidden="true">*</span></label><input id="rd-title" name="title" value="${value(record.title)}" aria-describedby="rd-title-error" required><p class="app-field-error" id="rd-title-error" hidden></p></div>
      <div class="app-field"><label for="rd-discipline">Discipline</label><select id="rd-discipline" name="discipline">${disciplineOptions(record.discipline)}</select></div>
      <div class="app-field"><label for="rd-description">Description</label><textarea id="rd-description" name="description" rows="3">${value(record.description)}</textarea></div><div class="app-field"><label for="rd-source">Source</label><input id="rd-source" name="source" value="${value(record.source)}"></div>`,
    onSubmit: async ({ overlay, fieldError }) => {
      const title = inputValue(overlay, "title");
      if (!title) {
        const input = overlay.querySelector('[name="title"]');
        fieldError(input, "rd-title-error", "Record title is required.");
        input.focus();
        throw new Error("Please correct the highlighted fields.");
      }
      await api.updateRecord(projectId, record.id, {
        title,
        description: inputValue(overlay, "description") || null,
        discipline: inputValue(overlay, "discipline") || null,
        source: inputValue(overlay, "source") || null,
      });
      announce?.("Document details updated.");
      onSuccess?.();
    },
  });
}

export function createArchiveRecordDialog({
  api,
  projectId,
  record,
  document,
  announce,
  onSuccess,
  onClose,
}) {
  return createDialog({
    document,
    title: "Archive document?",
    description:
      "This document and its revision history will remain available, but it will become read-only and no new revisions can be created.",
    body: `<p><strong>${escapeHtml(record.recordNumber || "Unnumbered document")} · ${escapeHtml(record.title)}</strong></p>`,
    submitLabel: "Archive document",
    destructive: true,
    onClose,
    onSubmit: async () => {
      await api.archiveRecord(projectId, record.id);
      announce?.("Document archived.");
      onSuccess?.();
    },
  });
}

export function createRevisionDialog({
  api,
  projectId,
  record,
  document,
  announce,
  onSuccess,
  onClose,
}) {
  return createDialog({
    document,
    title: "Create draft revision",
    description: `Begin a new draft for ${record.title}.`,
    submitLabel: "Create draft",
    onClose,
    body: `<div class="app-field"><label for="rd-label">Revision label</label><input id="rd-label" name="revisionLabel"></div><div class="app-field"><label for="rd-summary">Change summary <span aria-hidden="true">*</span></label><textarea id="rd-summary" name="changeSummary" rows="3" required aria-describedby="rd-summary-error"></textarea><p class="app-field-error" id="rd-summary-error" hidden></p></div>`,
    onSubmit: async ({ overlay, fieldError }) => {
      const changeSummary = inputValue(overlay, "changeSummary");
      if (!changeSummary) {
        const input = overlay.querySelector('[name="changeSummary"]');
        fieldError(input, "rd-summary-error", "Change summary is required.");
        input.focus();
        throw new Error("Please correct the highlighted fields.");
      }
      const revisionLabel = inputValue(overlay, "revisionLabel");
      const { data } = await api.createRevision(projectId, record.id, {
        ...(revisionLabel ? { revisionLabel } : {}),
        changeSummary,
      });
      announce?.("Draft revision created.");
      onSuccess?.(data);
    },
  });
}
