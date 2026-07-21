// Create Project dialog. Accessible modal with a focus trap, labelled title and
// description, inline validation, a submission loading state, and server error
// display (including the request ID when available). It only sends fields the
// current POST /api/v2/projects schema supports and never optimistically shows a
// project before the server confirms creation.
import { escapeHtml } from "./app-format.js";

const STATUS_OPTIONS = [
  ["planning", "Planning"],
  ["active", "Active"],
  ["closeout", "Closeout"],
  ["suspended", "Suspended"],
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createProjectForm({
  api,
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
    <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="pf-title" aria-describedby="pf-desc">
      <form novalidate>
        <div class="app-dialog-head">
          <div>
            <p class="eyebrow">Projects</p>
            <h2 id="pf-title" tabindex="-1">Create project</h2>
            <p id="pf-desc">Add a new project to this organization. You can refine details later.</p>
          </div>
          <button type="button" class="app-dialog-close" data-close aria-label="Close dialog">
            <svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
        </div>
        <p class="app-dialog-error" role="alert" hidden></p>
        <div class="app-dialog-body">
          <div class="field">
            <label for="pf-number">Project number <span aria-hidden="true">*</span></label>
            <input id="pf-number" name="projectNumber" type="text" required autocomplete="off"
              aria-describedby="pf-number-error" />
            <p class="field-error" id="pf-number-error" hidden></p>
          </div>
          <div class="field">
            <label for="pf-name">Project name <span aria-hidden="true">*</span></label>
            <input id="pf-name" name="name" type="text" required autocomplete="off"
              aria-describedby="pf-name-error" />
            <p class="field-error" id="pf-name-error" hidden></p>
          </div>
          <div class="field">
            <label for="pf-status">Status</label>
            <select id="pf-status" name="status">
              ${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
            </select>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="pf-city">City</label>
              <input id="pf-city" name="city" type="text" autocomplete="off" />
            </div>
            <div class="field">
              <label for="pf-region">State / region</label>
              <input id="pf-region" name="region" type="text" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label for="pf-description">Description</label>
            <textarea id="pf-description" name="description" rows="3"></textarea>
          </div>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="submit" class="primary-button" data-submit>Create project</button>
        </div>
      </form>
    </div>`;
  doc.body.appendChild(overlay);
  doc.body.classList.add("app-dialog-open");

  const dialog = overlay.querySelector(".app-dialog");
  const form = overlay.querySelector("form");
  const errorBanner = overlay.querySelector(".app-dialog-error");
  const submitButton = overlay.querySelector("[data-submit]");
  const numberInput = overlay.querySelector("#pf-number");
  const nameInput = overlay.querySelector("#pf-name");

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
    if (!numberInput.value.trim()) {
      setFieldError(numberInput, "pf-number-error", "Project number is required.");
      valid = false;
    } else {
      setFieldError(numberInput, "pf-number-error", "");
    }
    if (!nameInput.value.trim()) {
      setFieldError(nameInput, "pf-name-error", "Project name is required.");
      valid = false;
    } else {
      setFieldError(nameInput, "pf-name-error", "");
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
    submitButton.textContent = value ? "Creating…" : "Create project";
  }

  function buildPayload() {
    const value = (selector) =>
      (overlay.querySelector(selector)?.value ?? "").trim();
    const payload = {
      projectNumber: value("#pf-number"),
      name: value("#pf-name"),
      status: overlay.querySelector("#pf-status")?.value || "planning",
    };
    const description = value("#pf-description");
    if (description) payload.description = description;
    const city = value("#pf-city");
    const region = value("#pf-region");
    if (city || region) {
      payload.address = { city: city || null, region: region || null };
    }
    return payload;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    errorBanner.hidden = true;
    if (!validate()) {
      const firstInvalid = overlay.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      announce?.("Please correct the highlighted fields.");
      return;
    }
    setSubmitting(true);
    announce?.("Creating project.");
    try {
      const { data } = await api.createProject(buildPayload());
      if (closed) return;
      announce?.("Project created.");
      close({ restoreFocus: false });
      onSuccess?.(data);
    } catch (error) {
      if (closed) return;
      setSubmitting(false);
      showBanner(
        error?.message || "The project could not be created.",
        error?.requestId,
      );
      announce?.("The project could not be created.");
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
    if (restoreFocus && previousFocus && typeof previousFocus.focus === "function") {
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

  dialog.querySelector("#pf-title")?.focus();
  numberInput.focus();

  return { close };
}
