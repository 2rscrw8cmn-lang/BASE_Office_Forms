(function () {
  "use strict";

  const forms = [...document.querySelectorAll(".global-search")];
  if (!forms.length || !window.BASE || !window.BASE_LIBRARY) return;

  const esc = BASE.esc;
  let documentsPromise;

  function loadDocuments() {
    if (!documentsPromise) documentsPromise = BASE_LIBRARY.listDocuments().catch(error => ({ error }));
    return documentsPromise;
  }

  function text(value) { return String(value || "").toLowerCase(); }

  function score(item, query) {
    const title = text(item.title || item.label);
    const number = text(item.no);
    const type = text(item.documentType || item.kind);
    if (title.startsWith(query) || number.startsWith(query)) return 0;
    if (title.includes(query) || number.includes(query)) return 1;
    if (type.includes(query)) return 2;
    return 99;
  }

  function documentHref(item) {
    const key = BASE_LIBRARY.editKey(item.id);
    return key ? BASE_LIBRARY.editUrl(item.id, key) : BASE_LIBRARY.viewUrl(item.id);
  }

  function resultRow(item, kind) {
    const isTemplate = kind === "template";
    const href = isTemplate ? `builder.html?template=${encodeURIComponent(item.id)}` : documentHref(item);
    const title = item.label || item.title || "Untitled";
    const detail = isTemplate ? "Template · Open in Studio" : `${item.no || "No number"} · ${item.documentType || item.kind || "Document"}`;
    return `<a class="search-result" data-search-item href="${esc(href)}"><span class="search-result-icon" aria-hidden="true">${isTemplate ? "T" : "D"}</span><span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span><b aria-hidden="true">→</b></a>`;
  }

  forms.forEach((form, formIndex) => {
    const input = form.querySelector('input[type="search"]');
    if (!input) return;
    const popover = document.createElement("div");
    const popoverId = `global-search-results-${formIndex}`;
    popover.className = "search-popover";
    popover.id = popoverId;
    popover.hidden = true;
    popover.setAttribute("role", "listbox");
    form.appendChild(popover);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", popoverId);
    input.setAttribute("aria-expanded", "false");
    let activeIndex = -1;
    let renderVersion = 0;

    function setOpen(open) {
      popover.hidden = !open;
      input.setAttribute("aria-expanded", String(open));
      if (!open) activeIndex = -1;
    }

    function items() { return [...popover.querySelectorAll("[data-search-item]")]; }

    function setActive(index) {
      const results = items();
      if (!results.length) return;
      activeIndex = (index + results.length) % results.length;
      results.forEach((result, resultIndex) => result.classList.toggle("is-active", resultIndex === activeIndex));
      results[activeIndex].scrollIntoView({ block: "nearest" });
    }

    async function render() {
      const query = input.value.trim().toLowerCase();
      const version = ++renderVersion;
      if (!query) { setOpen(false); popover.innerHTML = ""; return; }
      setOpen(true);
      popover.innerHTML = `<div class="search-loading">Searching documents and templates…</div>`;
      const loaded = await loadDocuments();
      if (version !== renderVersion) return;
      const documents = Array.isArray(loaded) ? loaded : [];
      const documentResults = documents.map(item => ({ item, rank: score(item, query) })).filter(result => result.rank < 99).sort((a, b) => a.rank - b.rank).slice(0, 6).map(result => result.item);
      const templateResults = BASE.templateCatalog.map(item => ({ item, rank: score(item, query) })).filter(result => result.rank < 99).sort((a, b) => a.rank - b.rank).slice(0, 6).map(result => result.item);
      let html = "";
      if (documentResults.length) html += `<div class="search-result-group"><div class="search-result-label">Controlled documents</div>${documentResults.map(item => resultRow(item, "document")).join("")}</div>`;
      if (templateResults.length) html += `<div class="search-result-group"><div class="search-result-label">Templates</div>${templateResults.map(item => resultRow(item, "template")).join("")}</div>`;
      if (!html) html = `<div class="search-empty">No documents or templates match “${esc(input.value.trim())}”.</div>`;
      if (!Array.isArray(loaded)) html += `<div class="search-warning">Controlled documents are temporarily unavailable; template results are still shown.</div>`;
      popover.innerHTML = html;
      activeIndex = -1;
    }

    input.addEventListener("input", render);
    input.addEventListener("focus", () => { if (input.value.trim()) render(); });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive(activeIndex + 1); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive(activeIndex - 1); }
      if (event.key === "Escape") { setOpen(false); input.blur(); }
    });
    popover.addEventListener("mousemove", event => {
      const result = event.target.closest("[data-search-item]");
      if (!result) return;
      const index = items().indexOf(result);
      if (index >= 0 && index !== activeIndex) setActive(index);
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const results = items();
      const target = results[activeIndex] || results[0];
      if (target) location.href = target.href;
      else render();
    });
    document.addEventListener("click", event => { if (!form.contains(event.target)) setOpen(false); });
  });
})();
