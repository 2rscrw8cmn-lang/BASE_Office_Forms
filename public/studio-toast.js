/* Studio toast/snackbar system: transient save/error messages plus a
   persistent draft-lifecycle indicator (Draft / Saving / Saved / Offline /
   Error), replacing the single #status div that used to conflate both. */
(function (root) {
  "use strict";

  const STATE_LABELS = { draft: "Draft", saving: "Saving…", saved: "Saved", offline: "Offline", error: "Error" };

  function toast(message, tone) {
    const stack = document.getElementById("toastStack");
    if (!stack || !message) return null;
    const el = document.createElement("div");
    el.className = `toast${tone ? ` toast-${tone}` : ""}`;
    el.setAttribute("role", tone === "error" ? "alert" : "status");
    el.textContent = message;
    const dismiss = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener("click", dismiss);
    stack.appendChild(el);
    setTimeout(dismiss, tone === "error" ? 6000 : 3500);
    return el;
  }

  function setState(state) {
    const el = document.getElementById("draftState");
    if (!el) return;
    const known = Object.prototype.hasOwnProperty.call(STATE_LABELS, state) ? state : "draft";
    el.textContent = STATE_LABELS[known];
    el.dataset.state = known;
  }

  root.BASE_TOAST = { toast, setState };
})(window);
