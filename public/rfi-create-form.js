import { escapeHtml } from "./app-format.js";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";

// Draft-creation dialog. Subject and Question are required; the rest are
// optional. No official number is created here — the draft is created against
// the default approved BASE RFI template binding and the caller opens the linked
// workspace, where supporting attachments are added.
export function createRfiCreateForm({
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
  const overlay = doc.createElement("div");
  overlay.className = "app-dialog-overlay";

  function markup() {
    return `<div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="rfi-create-title" aria-describedby="rfi-create-desc">
      <form novalidate>
        <div class="app-dialog-head">
          <div>
            <h2 id="rfi-create-title" tabindex="-1">New RFI</h2>
            <p id="rfi-create-desc">Create an unnumbered draft. The official RFI number is assigned when it is issued. Supporting attachments are added in the RFI workspace.</p>
          </div>
          <button type="button" class="app-dialog-close" data-close aria-label="Close dialog">×</button>
        </div>
        <p class="app-dialog-error" role="alert" hidden></p>
        <div class="app-dialog-body">
          <div class="app-field">
            <label for="rfi-subject">Subject <span aria-hidden="true">*</span></label>
            <input id="rfi-subject" name="subject" required autocomplete="off" aria-describedby="rfi-subject-error">
            <p class="app-field-error" id="rfi-subject-error" hidden></p>
          </div>
          <div class="app-field">
            <label for="rfi-question">Question <span aria-hidden="true">*</span></label>
            <textarea id="rfi-question" name="question" rows="3" required aria-describedby="rfi-question-error"></textarea>
            <p class="app-field-error" id="rfi-question-error" hidden></p>
          </div>
          <div class="app-field">
            <label for="rfi-suggestion">Contractor suggestion</label>
            <textarea id="rfi-suggestion" name="contractorSuggestion" rows="2"></textarea>
          </div>
          <div class="app-field-row">
            <div class="app-field">
              <label for="rfi-drawings">Drawing references</label>
              <input id="rfi-drawings" name="drawingReferences" autocomplete="off">
            </div>
            <div class="app-field">
              <label for="rfi-specs">Specification references</label>
              <input id="rfi-specs" name="specificationReferences" autocomplete="off">
            </div>
          </div>
          <div class="app-field-row">
            <div class="app-field">
              <label for="rfi-responsible">Responsible party</label>
              <input id="rfi-responsible" name="responsibleParty" autocomplete="off">
            </div>
            <div class="app-field">
              <label for="rfi-due">Requested response date</label>
              <input id="rfi-due" name="requestedResponseDate" type="date">
            </div>
          </div>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="submit" class="primary-button" data-submit>Create draft</button>
        </div>
      </form>
    </div>`;
  }

  function value(name) {
    return (overlay.querySelector(`[name="${name}"]`)?.value || "").trim();
  }

  function setFieldError(name, message) {
    const input = overlay.querySelector(`[name="${name}"]`);
    const error = overlay.querySelector(`#rfi-${name}-error`);
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (error) {
      error.textContent = message || "";
      error.hidden = !message;
    }
  }

  function validate() {
    const subject = value("subject");
    const question = value("question");
    setFieldError("subject", subject ? "" : "A subject is required.");
    setFieldError("question", question ? "" : "A question is required.");
    return Boolean(subject && question);
  }

  function showError(message, requestId) {
    const banner = overlay.querySelector(".app-dialog-error");
    banner.innerHTML = `${escapeHtml(message)}${requestId ? ` <span class="request-id">Request ID <code>${escapeHtml(requestId)}</code></span>` : ""}`;
    banner.hidden = false;
  }

  function setSubmitting(next) {
    submitting = next;
    const button = overlay.querySelector("[data-submit]");
    button.disabled = next;
    button.setAttribute("aria-busy", String(next));
    button.textContent = next ? "Creating draft…" : "Create draft";
  }

  function optional(name) {
    const raw = value(name);
    return raw ? { [name]: raw } : {};
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
    const input = {
      subject: value("subject"),
      question: value("question"),
      ...optional("contractorSuggestion"),
      ...optional("drawingReferences"),
      ...optional("specificationReferences"),
      ...optional("responsibleParty"),
      ...optional("requestedResponseDate"),
    };
    try {
      const { data } = await api.createRfi(projectId, input);
      if (closed) return;
      announce?.("RFI draft created.");
      close({ restoreFocus: false });
      onSuccess?.(data);
    } catch (error) {
      if (closed) return;
      setSubmitting(false);
      showError(
        error?.message || "The RFI draft could not be created.",
        error?.requestId,
      );
      announce?.("The RFI draft could not be created.");
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
  overlay.innerHTML = markup();
  overlay
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        if (!submitting) close();
      }),
    );
  overlay.querySelector("form")?.addEventListener("submit", submit);
  overlay.querySelector("#rfi-subject")?.focus();

  return { close };
}
