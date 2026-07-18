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
      return `<a class="library-home-row" role="row" href="${esc(href)}">
        <span class="document-cell" role="cell"><i aria-hidden="true"></i><span><strong>${esc(item.title || "Untitled")}</strong><small>${esc(item.no || "No document number")}</small></span></span>
        <span role="cell">${esc(item.documentType || labelKind(item.kind))}</span>
        <span role="cell">v${esc(item.version || 1)}</span>
        <span role="cell">${esc(formatDate(item.updated))}</span>
        <span class="row-arrow" aria-hidden="true">→</span>
      </a>`;
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
