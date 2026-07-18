(function () {
  "use strict";

  const DRAFT_KEY = "baseStudio.draft.v2";
  const $ = selector => document.querySelector(selector);
  const esc = BASE.esc;
  let activeId = null;
  let activeVersion = null;
  let activeFolderId = null;
  let folders = [];
  let packageContext = null;
  let def = loadInitial();

  function clean(value) {
    const copy = BASE.clone(value);
    const walk = node => {
      if (!node || typeof node !== "object") return;
      delete node._ready; delete node._schema; delete node._gid; delete node._opts;
      Object.values(node).forEach(walk);
    };
    walk(copy);
    return copy;
  }

  function fieldObject(value) {
    if (!Array.isArray(value)) return { label: value.label || "Field", w: Number(value.w) || 1, height: Number(value.height || value.h) || 46, multiline: Boolean(value.multiline), id: value.id || "" };
    return { label: value[0] || "Field", w: Number(value[1]) || 1, id: value[2] || "", height: Number(value[3]) || 46, multiline: Boolean(value[4]) };
  }

  function normalize(value) {
    value.control = value.control || {};
    value.controlVisibility = value.controlVisibility || {};
    value.appearance = value.appearance || {};
    value.org = value.org || "Office Process & Compliance Division";
    if (value.kind === "form") {
      value.sections = value.sections || [];
      value.sections.forEach(section => {
        if (section.fields) section.fields = section.fields.map(fieldObject);
        if (section.sign) section.sign = section.sign.map(fieldObject);
        if (section.row) section.row.forEach(normalizeSection);
      });
    }
    if (value.kind === "document") {
      value.blocks = value.blocks || [];
      value.layout = value.layout || { cover: true };
      value.blocks.forEach(block => {
        if (block.fields) block.fields = block.fields.map(fieldObject);
        if (block.sign) block.sign = block.sign.map(fieldObject);
      });
    }
    if (value.kind === "package") value.documents = value.documents || [];
    return value;
  }

  function normalizeSection(section) {
    if (section.fields) section.fields = section.fields.map(fieldObject);
    if (section.sign) section.sign = section.sign.map(fieldObject);
  }

  function loadInitial() {
    try {
      if (location.hash.startsWith("#d=")) return normalize(decodePayload(location.hash.slice(3)));
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) return normalize(JSON.parse(stored));
    } catch (error) { console.warn(error); }
    return normalize(BASE.blankForm());
  }

  function getPath(object, path) {
    return path.split(".").reduce((current, key) => current == null ? current : current[key], object);
  }

  function setPath(object, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let target = object;
    keys.forEach((key, index) => {
      if (target[key] == null) target[key] = /^\d+$/.test(keys[index + 1]) ? [] : {};
      target = target[key];
    });
    target[last] = value;
  }

  function syncPackageDocument() {
    if (!packageContext) return;
    const item = packageContext.packageDef.documents[packageContext.index];
    if (item && item.def) item.def = clean(def);
    else packageContext.packageDef.documents[packageContext.index] = clean(def);
  }

  function rootDefinition() {
    syncPackageDocument();
    return packageContext ? packageContext.packageDef : def;
  }

  function status(message, tone) {
    const el = $("#status");
    el.textContent = message;
    el.dataset.tone = tone || "";
    clearTimeout(status.timer);
    status.timer = setTimeout(() => { el.textContent = "Drafts save locally; Save shared publishes to the team library."; el.dataset.tone = ""; }, 3500);
  }

  function persist() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(clean(rootDefinition())));
  }

  function textInput(label, path, value, options) {
    options = options || {};
    const type = options.type || "text";
    return `<div class="input-group"><label class="lbl">${esc(label)}</label><input class="in" type="${type}" data-path="${esc(path)}"${options.valueType ? ` data-value-type="${options.valueType}"` : ""} value="${esc(value == null ? "" : value)}"${options.min != null ? ` min="${options.min}"` : ""}${options.step ? ` step="${options.step}"` : ""}></div>`;
  }

  function textArea(label, path, value, valueType, hint) {
    return `<label class="lbl">${esc(label)}</label><textarea class="ta" data-path="${esc(path)}"${valueType ? ` data-value-type="${valueType}"` : ""}>${esc(value || "")}</textarea>${hint ? `<div class="micro">${esc(hint)}</div>` : ""}`;
  }

  function boolInput(label, path, value) {
    return `<label class="toggle"><input type="checkbox" data-path="${esc(path)}" data-value-type="bool"${value ? " checked" : ""}><span>${esc(label)}</span></label>`;
  }

  function commonPanel() {
    const isDoc = def.kind === "document";
    const isPackage = def.kind === "package";
    return `<section class="panel"><h3>${esc(def.documentType || def.kind)} details</h3>
      <div class="two">${textInput(isPackage ? "Package No." : (def.kind === "form" ? "Form No." : "Document No."), "no", def.no)}${textInput("Type", "documentType", def.documentType)}</div>
      ${textInput("Title", "title", def.title)}
      ${textInput(isDoc ? "Subtitle" : "Supporting line", isDoc || isPackage ? "subtitle" : "sub", isDoc || isPackage ? def.subtitle : def.sub)}
      ${textInput("Division / Organization", "org", def.org)}
      ${isDoc ? textInput("Tag", "tag", def.tag) + textArea("Summary / standard", "standard", def.standard) : ""}
      ${isDoc ? boolInput("Include cover page", "layout.cover", !(def.layout && def.layout.cover === false)) + boolInput("Generate document contents page", "toc", Boolean(def.toc)) : ""}
      <label class="lbl">Shared library folder</label><select class="sel" data-library-folder><option value="">Library root</option>${folders.map(folder => `<option value="${esc(folder.id)}"${folder.id === activeFolderId ? " selected" : ""}>${esc(folder.name)}</option>`).join("")}</select>
    </section>`;
  }

  function controlPanel() {
    const c = def.control || {};
    const v = def.controlVisibility || {};
    return `<section class="panel"><h3>Document control</h3>${boolInput("Show document-control strip", "showControl", def.showControl !== false)}
      <div class="control-row"><label class="toggle compact"><input type="checkbox" data-control-visible="no"${v.no !== false ? " checked" : ""}><span>No.</span></label></div>
      ${BASE.controlKeys.map(key => `<div class="control-row"><label class="toggle compact"><input type="checkbox" data-control-visible="${esc(key)}"${v[key] !== false ? " checked" : ""}><span>${esc(key)}</span></label><input class="in" data-control-value="${esc(key)}" value="${esc(c[key] || "")}"></div>`).join("")}
    </section>`;
  }

  function appearancePanel() {
    const a = def.appearance || {};
    return `<details class="panel collapsible"><summary>Appearance & page setup</summary>
      <div class="color-grid">${textInput("Accent", "appearance.accent", a.accent || "#7a1e22", { type: "color" })}${textInput("Ink", "appearance.ink", a.ink || "#232327", { type: "color" })}</div>
      <div class="two">${textInput("Horizontal margin (in)", "appearance.marginX", a.marginX || .7, { type: "number", valueType: "number", min: .25, step: .05 })}${textInput("Vertical margin (in)", "appearance.marginY", a.marginY || .55, { type: "number", valueType: "number", min: .25, step: .05 })}</div>
      <div class="two"><div><label class="lbl">Orientation</label><select class="sel" data-path="appearance.orientation"><option value="portrait"${a.orientation !== "landscape" ? " selected" : ""}>Portrait</option><option value="landscape"${a.orientation === "landscape" ? " selected" : ""}>Landscape</option></select></div>${textInput("Content scale", "appearance.bodyScale", a.bodyScale || 1, { type: "number", valueType: "number", min: .8, step: .05 })}</div>
      ${boolInput("Show branded header", "showHeader", def.showHeader !== false)}
    </details>`;
  }

  function fieldRows(base, fields, label) {
    return `<label class="lbl">${esc(label || "Fields")}</label>` + (fields || []).map((field, index) => `<div class="field-editor">
      <input class="in" data-path="${base}.${index}.label" value="${esc(field.label)}" placeholder="Label">
      <input class="in small" type="number" min=".25" step=".25" data-path="${base}.${index}.w" data-value-type="number" value="${field.w || 1}" title="Relative width">
      <input class="in small" type="number" min="36" step="4" data-path="${base}.${index}.height" data-value-type="number" value="${field.height || 46}" title="Field height in pixels">
      <label class="icon-toggle" title="Multiline"><input type="checkbox" data-path="${base}.${index}.multiline" data-value-type="bool"${field.multiline ? " checked" : ""}>↵</label>
      <button class="mini del" data-action="delete-field" data-base="${base}" data-index="${index}" title="Delete field">×</button>
    </div>`).join("") + `<button class="addrow" data-action="add-field" data-base="${base}">+ field</button><div class="micro">Width is relative. Height controls the write-in area.</div>`;
  }

  function cardHead(type, index, noun) {
    return `<div class="card-head"><span class="tag">${esc(type)}</span><span class="spacer"></span><button class="mini" data-action="move-up" data-index="${index}" data-noun="${noun}">↑</button><button class="mini" data-action="move-down" data-index="${index}" data-noun="${noun}">↓</button><button class="mini del" data-action="delete-item" data-index="${index}" data-noun="${noun}">×</button></div>`;
  }

  function pickerButton(attribute, type, label, description) {
    return `<button ${attribute}="${type}"><strong>+ ${esc(label)}</strong><span>${esc(description)}</span></button>`;
  }

  function formEditor() {
    return `<div class="editor-hint">Form sections — write-in fields support adjustable height and multiline input.</div>` +
      (def.sections || []).map((section, index) => {
        const type = section.fields ? "fields" : section.checks ? "choices" : section.sign ? "signature" : "text";
        let body = `<div class="two">${textInput("Section name", `sections.${index}.name`, section.name)}${textInput("Requirement", `sections.${index}.req`, section.req)}</div>`;
        if (section.fields) body += fieldRows(`sections.${index}.fields`, section.fields, "Write-in fields");
        if (section.sign) body += fieldRows(`sections.${index}.sign`, section.sign, "Signature fields");
        if (section.checks) body += textArea("Options — one per line", `sections.${index}.checks`, section.checks.join("\n"), "lines") + `<div class="two">${boolInput("Select one", `sections.${index}.single`, Boolean(section.single))}${textInput("Columns", `sections.${index}.cols`, section.cols || 1, { type: "number", valueType: "number", min: 1 })}</div>`;
        return `<article class="card">${cardHead(type, index, "section")}${body}</article>`;
      }).join("") + `<div class="addmenu">
        ${pickerButton("data-add-section", "fields", "Fields", "Collect names, dates, project details, or other written responses.")}
        ${pickerButton("data-add-section", "checks", "Choices", "Let the recipient select one or more defined options.")}
        ${pickerButton("data-add-section", "sign", "Signature", "Add authorization, approval, and date fields.")}
        ${pickerButton("data-add-section", "text", "Instructions", "Place quiet guidance or explanatory text in the form.")}
      </div>`;
  }

  function blockEditor(block, index) {
    const base = `blocks.${index}`;
    let body = "";
    if (block.type === "prose") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${boolInput("Number section", `${base}.number`, block.number !== false)}</div>` + textArea("Paragraphs", `${base}.paras`, (block.paras || []).join("\n\n"), "paras", "Enter = line break. Blank line = new paragraph.");
    if (block.type === "callout") body = textArea("Callout", `${base}.text`, block.text) + textInput("Attribution", `${base}.attribution`, block.attribution);
    if (block.type === "note") body = textInput("Note title", `${base}.title`, block.title) + textArea("Note text", `${base}.text`, block.text);
    if (block.type === "signatory") body = textInput("Name", `${base}.name`, block.name) + textInput("Role", `${base}.role`, block.role);
    if (block.type === "table") body = textInput("Columns — comma separated", `${base}.columns`, (block.columns || []).join(", "), { valueType: "commas" }) + textArea("Rows — one per line, cells separated by |", `${base}.rows`, (block.rows || []).map(row => row.join(" | ")).join("\n"), "rows");
    if (block.type === "list") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${boolInput("Numbered list", `${base}.ordered`, Boolean(block.ordered))}</div>` + textArea("Items — one per line", `${base}.items`, (block.items || []).join("\n"), "lines");
    if (block.type === "checklist") body = textInput("Heading", `${base}.heading`, block.heading) + textArea("Checklist items", `${base}.items`, (block.items || []).join("\n"), "lines");
    if (block.type === "keyvalue") body = textArea("Rows — Label | Value", `${base}.items`, (block.items || []).map(row => row.join(" | ")).join("\n"), "rows");
    if (["fields", "signature", "ack"].includes(block.type)) {
      body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${textInput("Requirement", `${base}.req`, block.req)}</div>`;
      if (block.type === "ack") body += textArea("Acknowledgment text", `${base}.intro`, block.intro);
      body += fieldRows(`${base}.fields`, block.fields || [], block.type === "signature" ? "Signature fields" : "Fields");
      if (block.type === "ack") body += fieldRows(`${base}.sign`, block.sign || [], "Signature fields");
    }
    if (block.type === "checks") body = textInput("Heading", `${base}.heading`, block.heading) + textArea("Options", `${base}.checks`, (block.checks || []).join("\n"), "lines") + `<div class="two">${boolInput("Select one", `${base}.single`, Boolean(block.single))}${textInput("Columns", `${base}.cols`, block.cols || 1, { type: "number", valueType: "number", min: 1 })}</div>`;
    if (block.type === "pagebreak") body = `<p class="micro">Forces the following content onto a new printed page.</p>`;
    return `<article class="card">${cardHead(block.type, index, "block")}${body}</article>`;
  }

  function documentEditor() {
    return `<div class="editor-hint">Document blocks — combine narrative, forms, tables, checklists, signatures, and page breaks.</div>` +
      (def.blocks || []).map(blockEditor).join("") +
      `<div class="addmenu">
        ${pickerButton("data-add-block", "prose", "Text section", "Add a heading with one or more narrative paragraphs.")}
        ${pickerButton("data-add-block", "fields", "Fields", "Collect structured written information in labeled areas.")}
        ${pickerButton("data-add-block", "checks", "Choices", "Present selectable options for a reader or respondent.")}
        ${pickerButton("data-add-block", "checklist", "Checklist", "Create a task or compliance list with check boxes.")}
        ${pickerButton("data-add-block", "list", "List", "Add ordered steps or a simple bulleted list.")}
        ${pickerButton("data-add-block", "table", "Table", "Organize repeated records into columns and rows.")}
        ${pickerButton("data-add-block", "keyvalue", "Key / value", "Show compact label-and-value pairs for document facts.")}
        ${pickerButton("data-add-block", "callout", "Callout", "Emphasize a quotation or important statement.")}
        ${pickerButton("data-add-block", "note", "Note", "Set aside a short caution, reminder, or explanation.")}
        ${pickerButton("data-add-block", "signature", "Signature", "Add signature, approval, and date fields.")}
        ${pickerButton("data-add-block", "ack", "Acknowledgment", "Capture a statement of understanding and signature.")}
        ${pickerButton("data-add-block", "signatory", "Signatory", "Identify the author or responsible person by name and role.")}
        ${pickerButton("data-add-block", "pagebreak", "Page break", "Start the next block on a new printed page.")}
      </div>`;
  }

  function packageEditor() {
    const docs = def.documents || [];
    return `<section class="panel package-tools"><h3>Package documents</h3><p class="micro">Save documents to the library, then add them here. The package index and page ranges regenerate automatically.</p><button class="wide-action" data-action="open-library">Add from library</button></section>` +
      (docs.length ? docs.map((item, index) => {
        const doc = item.def || item;
        return `<article class="card package-card">${cardHead(doc.documentType || doc.kind, index, "package")}<strong>${esc(doc.title || "Untitled")}</strong><span>${esc(doc.no || "")}</span><button class="wide-action package-edit" data-action="edit-package-document" data-index="${index}">Edit this document</button></article>`;
      }).join("") : `<div class="empty-state">No documents in this package yet.</div>`);
  }

  function renderEditor() {
    const packageNav = packageContext ? `<section class="panel package-editing"><h3>Editing package document</h3><p class="micro">Changes are being saved inside ${esc(packageContext.packageDef.title || "this package")}.</p><button class="wide-action" data-action="back-to-package">← Back to package</button></section>` : "";
    $("#ed").innerHTML = packageNav + commonPanel() + controlPanel() + appearancePanel() + (def.kind === "form" ? formEditor() : def.kind === "document" ? documentEditor() : packageEditor());
  }

  function renderPreview() {
    $("#pv").innerHTML = BASE.render(def, { fill: false });
    requestAnimationFrame(() => { BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); fit(); });
  }

  function renderAll() {
    normalize(def);
    renderEditor(); renderPreview(); persist();
    $("#kindBadge").textContent = `${packageContext ? "PACKAGE ITEM · " : ""}${def.documentType || def.kind}`.toUpperCase();
  }

  function fit() {
    const pane = $(".previewpane");
    const sheet = $("#pv .sheet");
    if (!sheet) return;
    const width = sheet.classList.contains("landscape") ? 1056 : 816;
    const scale = Math.max(.25, Math.min(1, (pane.clientWidth - 52) / width));
    $("#pv").style.transform = `scale(${scale})`;
    $("#pv").style.width = `${100 / scale}%`;
  }

  function parseValue(element) {
    const type = element.dataset.valueType;
    if (type === "bool") return element.checked;
    if (type === "number") return element.value === "" ? "" : Number(element.value);
    if (type === "lines") return element.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (type === "paras") return element.value.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
    if (type === "commas") return element.value.split(",").map(value => value.trim()).filter(Boolean);
    if (type === "rows") return element.value.split(/\r?\n/).map(row => row.split("|").map(cell => cell.trim())).filter(row => row.some(Boolean));
    return element.value;
  }

  function addSection(type) {
    const templates = {
      fields: { name: "New Section", req: "REQUIRED", fields: [{ label: "Field", w: 1, height: 46 }] },
      checks: { name: "New Choices", req: "SELECT ONE", single: true, cols: 1, checks: ["Option A", "Option B"] },
      sign: { name: "Authorization", req: "REQUIRED", sign: [{ label: "Signature", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      text: { name: "Instructions", text: "Add instructions here." }
    };
    def.sections.push(templates[type]); renderAll();
  }

  function addBlock(type) {
    const templates = {
      prose: { type, heading: "New Section", paras: ["Write here."] }, fields: { type, heading: "Information", req: "REQUIRED", fields: [{ label: "Field", w: 1, height: 46 }] },
      checks: { type, heading: "Options", req: "SELECT ONE", single: true, cols: 1, checks: ["Option A", "Option B"] }, checklist: { type, heading: "Checklist", items: ["Item one", "Item two"] },
      list: { type, heading: "List", ordered: false, items: ["Item one", "Item two"] }, table: { type, columns: ["Column A", "Column B"], rows: [["", ""]] },
      keyvalue: { type, items: [["Label", "Value"], ["Label", "Value"]] }, callout: { type, text: "Important callout." }, note: { type, title: "Note", text: "Important note." },
      signature: { type, heading: "Authorization", req: "REQUIRED", fields: [{ label: "Signature", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      ack: { type, heading: "Acknowledgment", req: "REQUIRED", intro: "I acknowledge and understand this document.", fields: [{ label: "Printed Name", w: 2, height: 46 }], sign: [{ label: "Signature", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      signatory: { type, name: "Name", role: "Title" }, pagebreak: { type }
    };
    def.blocks.push(templates[type]); renderAll();
  }

  function move(array, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= array.length) return;
    [array[index], array[next]] = [array[next], array[index]];
  }

  function currentArray(noun) {
    if (noun === "section") return def.sections;
    if (noun === "block") return def.blocks;
    return def.documents;
  }

  function editPackageDocument(index) {
    const item = def.documents[index];
    if (!item) return;
    packageContext = { packageDef: def, index };
    def = normalize(BASE.clone(item.def || item));
    renderAll();
    status("Editing a document inside the package.", "success");
  }

  function backToPackage() {
    if (!packageContext) return;
    syncPackageDocument();
    def = packageContext.packageDef;
    packageContext = null;
    renderAll();
    status("Package document updated.", "success");
  }

  function saveJson() {
    const definition = clean(rootDefinition());
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob); anchor.download = `${definition.no || BASE.slug(definition.title)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
    status("Portable JSON backup exported.", "success");
  }

  function loadJson() {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
    input.onchange = () => {
      const reader = new FileReader();
      reader.onload = () => { try { def = normalize(JSON.parse(reader.result)); activeId = null; activeVersion = null; activeFolderId = null; packageContext = null; renderAll(); status("Backup imported.", "success"); } catch (error) { status(`Could not import backup: ${error.message}`, "error"); } };
      reader.readAsText(input.files[0]);
    };
    input.click();
  }

  async function saveLibrary() {
    try {
      const document = clean(rootDefinition());
      status("Saving to the shared library…");
      const saved = await BASE_LIBRARY.saveDocument(document, { id: activeId, folderId: activeFolderId, version: activeVersion });
      activeId = saved.document.id;
      activeVersion = saved.document.version;
      activeFolderId = saved.document.folderId || null;
      status(`Saved to the shared library · version ${saved.document.version}.`, "success");
      return saved.document;
    } catch (error) {
      status(`Could not save: ${error.message}`, "error");
      throw error;
    }
  }

  async function openLibrary(folderId) {
    try {
      const selectedFolder = folderId === undefined ? "" : folderId;
      const items = await BASE_LIBRARY.listDocuments(selectedFolder ? { folderId: selectedFolder } : {});
      const canAdd = !packageContext && def.kind === "package";
      const folderTools = `<div class="library-tools"><select class="sel" id="libraryFolderFilter"><option value="">All folders</option>${folders.map(folder => `<option value="${esc(folder.id)}"${folder.id === selectedFolder ? " selected" : ""}>${esc(folder.name)}</option>`).join("")}</select><button data-action="new-folder">New folder</button></div>`;
      const rows = items.length ? `<div class="library-list">${items.map(item => {
        const owned = Boolean(BASE_LIBRARY.editKey(item.id));
        return `<div class="library-row"><div><strong>${esc(item.title)}</strong><span>${esc(item.documentType || item.kind)} · ${esc(item.no)} · v${item.version} · ${new Date(item.updated).toLocaleDateString()}</span></div>${canAdd && item.kind !== "package" ? `<button data-library-add="${item.id}">Add</button>` : `<button data-library-open="${item.id}">${owned ? "Open" : "Open copy"}</button>`}<button data-library-view="${item.id}">View link</button>${owned ? `<button data-library-edit="${item.id}">Edit link</button><button class="danger" data-library-delete="${item.id}">Delete</button>` : ""}</div>`;
      }).join("")}</div>` : `<div class="empty-state">No shared documents in this folder yet.</div>`;
      showModal("Shared document library", folderTools + rows);
    } catch (error) {
      showModal("Shared document library", `<div class="empty-state">The shared library is unavailable.<br>${esc(error.message)}</div>`);
    }
  }

  function showModal(title, body) {
    $("#modalTitle").textContent = title; $("#modalBody").innerHTML = body; $("#modal").hidden = false;
  }
  function closeModal() { $("#modal").hidden = true; }

  function encodePayload(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(clean(value)));
    let binary = ""; bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePayload(payload) {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4);
    const binary = atob(padded); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function copyShareLink() {
    let shareUrl = "";
    try {
      if (!activeId) await saveLibrary();
      shareUrl = BASE_LIBRARY.viewUrl(activeId);
      await navigator.clipboard.writeText(shareUrl); status("Shared view/fill link copied.", "success");
    }
    catch (error) { showModal("Copy share link", shareUrl ? `<textarea class="modal-text">${esc(shareUrl)}</textarea>` : `<div class="empty-state">${esc(error.message)}</div>`); }
  }

  async function copyAIKit() {
    const instruction = `You are completing or revising a BASE controlled ${def.kind}.\nReturn ONLY valid JSON. Preserve the existing schema and IDs. Fill unknown values with an empty string. For a structural revision, return the complete updated definition.\n\nCURRENT DEFINITION:\n${JSON.stringify(clean(def), null, 2)}`;
    try { await navigator.clipboard.writeText(instruction); status("AI handoff kit copied.", "success"); }
    catch (_) { showModal("AI handoff kit", `<textarea class="modal-text tall">${esc(instruction)}</textarea>`); }
  }

  function importAI() {
    showModal("Import AI JSON", `<p class="micro">Paste a complete definition, or an object containing a <code>definition</code> property.</p><textarea id="aiJson" class="modal-text tall" placeholder="Paste JSON here"></textarea><button class="modal-primary" data-action="apply-ai">Apply JSON</button>`);
  }

  $("#ed").addEventListener("input", event => {
    const el = event.target;
    if (el.dataset.path) { setPath(def, el.dataset.path, parseValue(el)); renderPreview(); persist(); }
    if (el.dataset.controlValue) { def.control[el.dataset.controlValue] = el.value; renderPreview(); persist(); }
  });
  $("#ed").addEventListener("change", event => {
    const el = event.target;
    if (el.dataset.path) { setPath(def, el.dataset.path, parseValue(el)); renderPreview(); persist(); }
    if (el.dataset.controlVisible) { def.controlVisibility[el.dataset.controlVisible] = el.checked; renderPreview(); persist(); }
    if (el.matches("[data-library-folder]")) activeFolderId = el.value || null;
  });
  $("#ed").addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.addSection) return addSection(button.dataset.addSection);
    if (button.dataset.addBlock) return addBlock(button.dataset.addBlock);
    const action = button.dataset.action;
    if (action === "add-field") { getPath(def, button.dataset.base).push({ label: "New field", w: 1, height: 46 }); return renderAll(); }
    if (action === "delete-field") { getPath(def, button.dataset.base).splice(Number(button.dataset.index), 1); return renderAll(); }
    if (["move-up", "move-down", "delete-item"].includes(action)) {
      const array = currentArray(button.dataset.noun), index = Number(button.dataset.index);
      if (action === "delete-item") array.splice(index, 1); else move(array, index, action === "move-up" ? -1 : 1);
      return renderAll();
    }
    if (action === "edit-package-document") return editPackageDocument(Number(button.dataset.index));
    if (action === "back-to-package") return backToPackage();
    if (action === "open-library") openLibrary();
  });

  $("#modal").addEventListener("change", event => {
    if (event.target.id === "libraryFolderFilter") openLibrary(event.target.value);
  });

  $("#modal").addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (event.target.matches(".modal-backdrop") || (button && button.dataset.action === "close-modal")) return closeModal();
    if (!button) return;
    if (button.dataset.action === "new-folder") {
      const name = window.prompt("New shared folder name:");
      if (!name) return;
      try { const folder = await BASE_LIBRARY.createFolder(name); folders = await BASE_LIBRARY.listFolders(); closeModal(); activeFolderId = folder.id; renderAll(); await openLibrary(folder.id); }
      catch (error) { status(`Could not create folder: ${error.message}`, "error"); }
      return;
    }
    if (button.dataset.libraryOpen) {
      try {
        const item = await BASE_LIBRARY.getDocument(button.dataset.libraryOpen);
        const key = BASE_LIBRARY.editKey(item.id);
        def = normalize(BASE.clone(item.definition)); activeId = key ? item.id : null; activeVersion = key ? item.version : null; activeFolderId = item.folderId || null; packageContext = null;
        closeModal(); renderAll(); status(key ? "Opened shared library document." : "Opened a public document as a new copy.", "success");
      } catch (error) { status(`Could not open document: ${error.message}`, "error"); }
      return;
    }
    if (button.dataset.libraryAdd) {
      try {
        const item = await BASE_LIBRARY.getDocument(button.dataset.libraryAdd);
        def.documents.push({ sourceId: item.id, def: clean(item.definition) }); closeModal(); renderAll(); status("Added shared document to package.", "success");
      } catch (error) { status(`Could not add document: ${error.message}`, "error"); }
      return;
    }
    if (button.dataset.libraryView) {
      const link = BASE_LIBRARY.viewUrl(button.dataset.libraryView);
      try { await navigator.clipboard.writeText(link); status("Shared link copied.", "success"); }
      catch (_) { showModal("Copy shared link", `<textarea class="modal-text">${esc(link)}</textarea>`); }
      return;
    }
    if (button.dataset.libraryEdit) {
      const link = BASE_LIBRARY.editUrl(button.dataset.libraryEdit, BASE_LIBRARY.editKey(button.dataset.libraryEdit));
      try { await navigator.clipboard.writeText(link); status("Private edit link copied.", "success"); }
      catch (_) { showModal("Copy private edit link", `<textarea class="modal-text">${esc(link)}</textarea>`); }
      return;
    }
    if (button.dataset.libraryDelete) {
      if (!window.confirm("Delete this shared document? This cannot be undone.")) return;
      try { await BASE_LIBRARY.deleteDocument(button.dataset.libraryDelete); if (activeId === button.dataset.libraryDelete) { activeId = null; activeVersion = null; } await openLibrary($("#libraryFolderFilter") ? $("#libraryFolderFilter").value : ""); }
      catch (error) { status(`Could not delete document: ${error.message}`, "error"); }
      return;
    }
    if (button.dataset.action === "apply-ai") {
      try { const parsed = JSON.parse($("#aiJson").value); def = normalize(parsed.definition || parsed); closeModal(); renderAll(); status("AI JSON imported.", "success"); }
      catch (error) { status(`Invalid AI JSON: ${error.message}`, "error"); }
    }
  });

  $("#newButton").addEventListener("click", () => { def = normalize(BASE.fromTemplate($("#templateSelect").value)); activeId = null; activeVersion = null; activeFolderId = null; packageContext = null; renderAll(); status("New template created.", "success"); });
  $("#loadButton").addEventListener("click", loadJson);
  $("#downloadButton").addEventListener("click", saveJson);
  $("#saveButton").addEventListener("click", () => saveLibrary().catch(() => {}));
  $("#libraryButton").addEventListener("click", openLibrary);
  $("#shareButton").addEventListener("click", copyShareLink);
  $("#aiButton").addEventListener("click", copyAIKit);
  $("#aiImportButton").addEventListener("click", importAI);
  $("#printButton").addEventListener("click", () => { renderPreview(); setTimeout(() => { BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); window.print(); }, 140); });
  window.addEventListener("beforeprint", () => { BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); });
  window.addEventListener("resize", fit);

  async function initialize() {
    try { folders = await BASE_LIBRARY.listFolders(); }
    catch (error) { status(`Shared library unavailable: ${error.message}`, "error"); }
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (id) {
      try {
        const item = await BASE_LIBRARY.getDocument(id);
        const suppliedKey = new URLSearchParams(location.hash.slice(1)).get("key") || "";
        if (suppliedKey) BASE_LIBRARY.rememberEditKey(id, suppliedKey);
        const key = suppliedKey || BASE_LIBRARY.editKey(id);
        def = normalize(BASE.clone(item.definition)); activeId = key ? id : null; activeVersion = key ? item.version : null; activeFolderId = item.folderId || null;
        status(key ? "Opened editable shared document." : "Opened shared document as a copy.", "success");
      } catch (error) { status(`Could not open shared document: ${error.message}`, "error"); }
    } else if (params.get("template")) {
      const template = params.get("template");
      if (BASE.templateCatalog.some(item => item.id === template)) {
        def = normalize(BASE.fromTemplate(template));
        $("#templateSelect").value = template;
        status("Template opened in a new local draft.", "success");
      }
    } else if (params.get("new")) {
      const kind = params.get("new");
      def = normalize(kind === "form" ? BASE.blankForm() : kind === "package" ? BASE.blankPackage() : BASE.blankDoc());
      status(`New ${kind === "form" || kind === "package" ? kind : "document"} started.`, "success");
    }
    renderAll();
  }

  $("#templateSelect").innerHTML = BASE.templateCatalog.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join("");
  initialize();
})();
