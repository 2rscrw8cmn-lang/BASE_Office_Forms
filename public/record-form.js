// Create Record dialog. Accessible modal with a focus trap, labelled title and
// description, controlled record-type values, inline field validation, a
// top-level validation summary, a submission loading state, and server error
// display (including the request ID when available). It sends only fields the
// current POST /api/v2/projects/:projectId/records schema supports
// (recordType, title, and the optional recordNumber, discipline, description)
// and never optimistically shows a record before the server confirms creation.
import { escapeHtml } from "./app-format.js";

const RECORD_TYPE_OPTIONS = [
  ["document", "Document"],
  ["drawing", "Drawing"],
  ["specification", "Specification"],
  ["schedule", "Schedule"],
  ["report", "Report"],
  ["correspondence", "Correspondence"],
  ["other", "Other"],
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createRecordForm({
  api,
  projectId,
  document: doc,
  announce,
  onSuccess,
  onClose,
}) {
  const previousFocus = doc.activeElement;
  let submitting = false;
  let closed = false;

  const overlay = doc.createElement("div");
  overlay.className = "app-dialog-overlay";
  overlay.innerHTML = `
    <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="rf-title" aria-describedby="rf-desc">
      <form novalidate>
        <div class="app-dialog-head">
          <div>
            <h2 id="rf-title" tabindex="-1">Create record</h2>
            <p id="rf-desc">Add a new document record to this project. Revisions and files are added later.</p>
          </div>
          <button type="button" class="app-dialog-close" data-close aria-label="Close dialog">
            <svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
        </div>
        <p class="app-dialog-error" role="alert" hidden></p>
        <div class="app-dialog-body">
          <div class="app-field">
            <label for="rf-title-input">Record title <span aria-hidden="true">*</span></label>
            <input id="rf-title-input" name="title" type="text" required autocomplete="off"
              aria-describedby="rf-title-error" />
            <p class="app-field-error" id="rf-title-error" hidden></p>
          </div>
          <div class="app-field-row">
            <div class="app-field">
              <label for="rf-number">Record number</label>
              <input id="rf-number" name="recordNumber" type="text" autocomplete="off" />
            </div>
            <div class="app-field">
              <label for="rf-type">Record type <span aria-hidden="true">*</span></label>
              <select id="rf-type" name="recordType">
                ${RECORD_TYPE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="app-field">
            <label for="rf-discipline">Discipline</label>
            <input id="rf-discipline" name="discipline" type="text" autocomplete="off" />
          </div>
          <div class="app-field">
            <label for="rf-description">Description</label>
            <textarea id="rf-description" name="description" rows="3"></textarea>
          </div>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="submit" class="primary-button" data-submit>Create record</button>
        </div>
      </form>
    </div>`;
  doc.body.appendChild(overlay);
  doc.body.classList.add("app-dialog-open");

  const dialog = overlay.querySelector(".app-dialog");
  const form = overlay.querySelector("form");
  const errorBanner = overlay.querySelector(".app-dialog-error");
  const submitButton = overlay.querySelector("[data-submit]");
  const titleInput = overlay.querySelector("#rf-title-input");

  function focusables() {
    return [...overlay.querySelectorAll(FOCUSABLE)].filter(
      (element) => !element.hidden && !element.disabled,
    );
  }

  function setFieldError(input, errorId, message) {
    const errorEl = overlay.querySelector(`#${errorId}`);
    if (message) {
      input.setAttribute("aria-invalid", "true");
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      errorEl.textContent = "";
      errorEl.hidden = true;
    }
  }

  function validate() {
    let valid = true;
    if (!titleInput.value.trim()) {
      setFieldError(titleInput, "rf-title-error", "Record title is required.");
      valid = false;
    } else {
      setFieldError(titleInput, "rf-title-error", "");
    }
    return valid;
  }

  function showBanner(message, requestId) {
    errorBanner.innerHTML = `${escapeHtml(message)}${
      requestId
        ? ` <span class="request-id">Request ID <code>${escapeHtml(requestId)}</code></span>`
        : ""
    }`;
    errorBanner.hidden = false;
  }

  function setSubmitting(value) {
    submitting = value;
    submitButton.disabled = value;
    submitButton.setAttribute("aria-busy", value ? "true" : "false");
    submitButton.textContent = value ? "Creating…" : "Create record";
  }

  function buildPayload() {
    const value = (selector) =>
      (overlay.querySelector(selector)?.value ?? "").trim();
    const payload = {
      recordType: overlay.querySelector("#rf-type")?.value || "document",
      title: value("#rf-title-input"),
    };
    const recordNumber = value("#rf-number");
    if (recordNumber) payload.recordNumber = recordNumber;
    const discipline = value("#rf-discipline");
    if (discipline) payload.discipline = discipline;
    const description = value("#rf-description");
    if (description) payload.description = description;
    return payload;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    errorBanner.hidden = true;
    if (!validate()) {
      showBanner("Please correct the highlighted fields.");
      const firstInvalid = overlay.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      announce?.("Please correct the highlighted fields.");
      return;
    }
    setSubmitting(true);
    announce?.("Creating record.");
    try {
      const { data } = await api.createRecord(projectId, buildPayload());
      if (closed) return;
      announce?.("Record created.");
      close({ restoreFocus: false });
      onSuccess?.(data);
    } catch (error) {
      if (closed) return;
      setSubmitting(false);
      showBanner(
        error?.message || "The record could not be created.",
        error?.requestId,
      );
      announce?.("The record could not be created.");
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      if (submitting) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close({ restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    overlay.removeEventListener("keydown", onKeydown);
    overlay.remove();
    doc.body.classList.remove("app-dialog-open");
    if (
      restoreFocus &&
      previousFocus &&
      typeof previousFocus.focus === "function"
    ) {
      previousFocus.focus();
    }
    onClose?.();
  }

  form.addEventListener("submit", onSubmit);
  overlay.addEventListener("keydown", onKeydown);
  overlay.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!submitting) close();
    }),
  );
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay && !submitting) close();
  });

  dialog.querySelector("#rf-title")?.focus();
  titleInput.focus();

  return { close };
}
