(function () {
  "use strict";

  const rows = document.getElementById("libraryRows");
  const count = document.getElementById("libraryCount");
  const filters = document.getElementById("libraryFilters");
  const templateGrid = document.getElementById("templateGrid");
  const templateCount = document.getElementById("templateCount");
  let documents = [];
  let activeKind = "";

  function esc(value) { return BASE.esc(value == null ? "" : String(value)); }
  function labelKind(kind) { return kind === "form" ? "Form" : kind === "package" ? "Package" : "Document"; }
  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function renderDocuments() {
    const visible = documents.filter(item => !activeKind || item.kind === activeKind);
    count.textContent = `${visible.length} ${visible.length === 1 ? "record" : "records"}`;
    rows.innerHTML = visible.length ? visible.map(item => {
      const owned = Boolean(BASE_LIBRARY.editKey(item.id));
      const href = owned ? BASE_LIBRARY.editUrl(item.id, BASE_LIBRARY.editKey(item.id)) : BASE_LIBRARY.viewUrl(item.id);
      return `<div class="library-home-row" role="row">
        <a class="document-cell" role="cell" href="${esc(href)}"><i aria-hidden="true"></i><span><strong>${esc(item.title || "Untitled")}</strong><small>${esc(item.no || "No document number")}</small></span></a>
        <span role="cell">${esc(item.documentType || labelKind(item.kind))}</span>
        <span role="cell">v${esc(item.version || 1)}</span>
        <span role="cell">${esc(formatDate(item.updated))}</span>
        <span class="library-row-actions" role="cell"><a class="row-arrow" href="${esc(href)}" aria-label="Open ${esc(item.title || "document")}">→</a>${owned ? `<button data-delete-document="${esc(item.id)}" aria-label="Delete ${esc(item.title || "document")}" title="Delete from controlled documents">×</button>` : ""}</span>
      </div>`;
    }).join("") : `<div class="library-empty">No controlled documents match this view.</div>`;
  }

  function renderTemplates() {
    const visible = BASE.templateCatalog;
    templateCount.textContent = `${visible.length} available`;
    templateGrid.innerHTML = visible.map(item => `<a href="builder.html?template=${encodeURIComponent(item.id)}"><span>${esc(item.label)}</span><small>Open in Studio</small><b aria-hidden="true">→</b></a>`).join("");
  }

  function render() { renderDocuments(); renderTemplates(); }

  filters.addEventListener("click", event => {
    const button = event.target.closest("button[data-kind]");
    if (!button) return;
    activeKind = button.dataset.kind;
    filters.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
    renderDocuments();
  });
  rows.addEventListener("click", async event => {
    const button = event.target.closest("button[data-delete-document]");
    if (!button) return;
    const item = documents.find(document => document.id === button.dataset.deleteDocument);
    if (!item || !window.confirm(`Delete “${item.title || item.no || "this document"}” from controlled documents? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      await BASE_LIBRARY.deleteDocument(item.id);
      documents = documents.filter(document => document.id !== item.id);
      renderDocuments();
    } catch (error) {
      button.disabled = false;
      window.alert(`Could not delete document: ${error.message}`);
    }
  });
  BASE_LIBRARY.listDocuments().then(items => {
    documents = items;
    render();
  }).catch(error => {
    rows.innerHTML = `<div class="library-empty">The shared library is unavailable right now.<small>${esc(error.message)}</small></div>`;
    count.textContent = "Library unavailable";
    renderTemplates();
  });
  renderTemplates();
})();
