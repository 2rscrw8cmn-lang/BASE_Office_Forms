(function () {
  "use strict";

  const DRAFT_KEY = "baseStudio.draft.v2";
  const $ = selector => document.querySelector(selector);
  const esc = BASE.esc;

  // A permanent identity for a newly created field/section/block, independent
  // of its label. See normField() in engine.js: once an id is present it is
  // never re-derived from the label, so renaming a field can't silently
  // change its stored answer key.
  function newId(prefix) {
    return `${prefix || "f"}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // Sentinel identifying "Document Settings" as the selected node -- a
  // unique object reference that never appears in def.sections/def.blocks.
  const DOCUMENT_NODE = {};

  let activeId = null;
  let activeVersion = null;
  let activeFolderId = null;
  let folders = [];
  let packageContext = null;
  let activeTemplateKey = null;
  const panelStates = new Map();
  let def = loadInitial();
  // The selected outline item, tracked by object reference (not index) so it
  // survives reordering; resolved back to a live collection/index on each
  // render via locateSelected(), and self-heals to DOCUMENT_NODE if the
  // referenced item was deleted or def was swapped out.
  let selectedItem = DOCUMENT_NODE;

  function openAttribute(key, defaultOpen) {
    const open = panelStates.has(key) ? panelStates.get(key) : defaultOpen;
    return open ? " open" : "";
  }

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
    if (!Array.isArray(value)) {
      const align = ["top", "center", "bottom"].includes(value.align) ? value.align : undefined;
      const textHeight = Number(value.textHeight) > 0 ? Number(value.textHeight) : undefined;
      // Input style lives in `type` going forward. Legacy definitions that
      // only ever set the `multiline` boolean are migrated the moment they
      // pass through here; `multiline` itself stays for older readers that
      // never see this normalization (e.g. a definition rendered directly
      // without ever opening in Studio).
      const type = value.type || (value.multiline ? "multiline" : "text");
      return { label: value.label || "Field", w: Number(value.w) || 1, height: Number(value.height || value.h) || 46, multiline: false, id: value.id || "", break: Boolean(value.break), align, textHeight, type };
    }
    return { label: value[0] || "Field", w: Number(value[1]) || 1, id: value[2] || "", height: Number(value[3]) || 46, multiline: Boolean(value[4]) };
  }

  function normalize(value) {
    value.control = value.control || {};
    value.controlVisibility = value.controlVisibility || {};
    value.appearance = value.appearance || {};
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
    if (value.kind === "package") {
      value.documents = value.documents || [];
      value.documents.forEach(item => {
        const child = item && (item.def || item);
        if (child && child.kind && child.kind !== "package") normalize(child);
      });
    }
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
    BASE_TOAST.toast(message, tone);
  }

  function persist() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(clean(rootDefinition())));
    BASE_TOAST.setState("draft");
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
    return `<details class="panel collapsible" data-panel-key="details"${openAttribute("details", true)}><summary>${esc(def.documentType || def.kind)} details</summary>
      <div class="two">${textInput(isPackage ? "Package No." : (def.kind === "form" ? "Form No." : "Document No."), "no", def.no)}${textInput("Type", "documentType", def.documentType)}</div>
      ${textInput("Title", "title", def.title)}
      ${textInput(isDoc ? "Subtitle" : "Supporting line", isDoc || isPackage ? "subtitle" : "sub", isDoc || isPackage ? def.subtitle : def.sub)}
      <p class="micro">Branded header — BASE Construction LLC, 1601 Minnesota Ave, Winter Park, FL 32789 — is fixed and can't be changed per document. Toggle it on or off under Appearance &amp; page setup.</p>
      ${def.kind === "form" ? textInput("Display label", "typeLabel", def.typeLabel || "Form") + textArea("Footnotes — one per line", "footnotes", (def.footnotes || []).join("\n"), "lines") : ""}
      ${isDoc || isPackage ? textInput("Cover tag", "tag", def.tag) : ""}
      ${isDoc ? textArea("Summary / standard", "standard", def.standard) + textArea("Issuing authority", "authority", def.authority) : ""}
      ${isDoc ? boolInput("Include cover page", "layout.cover", !(def.layout && def.layout.cover === false)) + boolInput("Generate document contents page", "toc", Boolean(def.toc)) : ""}
      ${packageContext ? "" : `<label class="lbl">Shared library folder</label><select class="sel" data-library-folder><option value="">Library root</option>${folders.map(folder => `<option value="${esc(folder.id)}"${folder.id === activeFolderId ? " selected" : ""}>${esc(folder.name)}</option>`).join("")}</select>`}
    </details>`;
  }

  function controlPanel() {
    const c = def.control || {};
    const v = def.controlVisibility || {};
    return `<details class="panel collapsible" data-panel-key="control"${openAttribute("control", true)}><summary>Document control</summary>${boolInput("Show document-control strip", "showControl", def.showControl !== false)}
      <div class="control-row"><label class="toggle compact"><input type="checkbox" data-control-visible="no"${v.no !== false ? " checked" : ""}><span>No.</span></label></div>
      ${BASE.controlKeys.map(key => `<div class="control-row"><label class="toggle compact"><input type="checkbox" data-control-visible="${esc(key)}"${v[key] !== false ? " checked" : ""}><span>${esc(key)}</span></label><input class="in" data-control-value="${esc(key)}" value="${esc(c[key] || "")}"></div>`).join("")}
    </details>`;
  }

  function appearancePanel() {
    const a = def.appearance || {};
    return `<details class="panel collapsible" data-panel-key="appearance"${openAttribute("appearance", false)}><summary>Appearance & page setup</summary>
      <div class="color-grid">${textInput("Accent", "appearance.accent", a.accent || "#7a1e22", { type: "color" })}${textInput("Ink", "appearance.ink", a.ink || "#232327", { type: "color" })}${textInput("Paper", "appearance.paper", a.paper || "#ffffff", { type: "color" })}</div>
      <div class="two">${textInput("Horizontal margin (in)", "appearance.marginX", a.marginX || .7, { type: "number", valueType: "number", min: .25, step: .05 })}${textInput("Vertical margin (in)", "appearance.marginY", a.marginY || .55, { type: "number", valueType: "number", min: .25, step: .05 })}</div>
      <div class="two"><div><label class="lbl">Orientation</label><select class="sel" data-path="appearance.orientation"><option value="portrait"${a.orientation !== "landscape" ? " selected" : ""}>Portrait</option><option value="landscape"${a.orientation === "landscape" ? " selected" : ""}>Landscape</option></select></div>${textInput("Content scale", "appearance.bodyScale", a.bodyScale || 1, { type: "number", valueType: "number", min: .8, step: .05 })}</div>
      ${boolInput("Show branded header", "showHeader", def.showHeader !== false)}
    </details>`;
  }

  function fieldCell(caption, control) {
    return `<div class="field-editor-cell"><span class="field-editor-label">${esc(caption)}</span>${control}</div>`;
  }

  function fieldRows(base, fields, label, defaultAlign) {
    defaultAlign = defaultAlign || "top";
    return `<label class="lbl">${esc(label || "Fields")}</label>` + (fields || []).map((field, index) => {
      const align = field.align || defaultAlign;
      const type = field.type || (field.multiline ? "multiline" : "text");
      return `<div class="field-editor">
      <input class="in" data-path="${base}.${index}.label" value="${esc(field.label)}" placeholder="Label">
      ${fieldCell("Width", `<input class="in small" type="number" min=".25" step=".25" data-path="${base}.${index}.w" data-value-type="number" value="${field.w || 1}" title="Relative width">`)}
      ${fieldCell("Height", `<input class="in small" type="number" min="36" step="4" data-path="${base}.${index}.height" data-value-type="number" value="${field.height || 46}" title="Field height in pixels">`)}
      ${fieldCell("Write-in", `<input class="in small" type="number" min="16" step="2" data-path="${base}.${index}.textHeight" data-value-type="number" value="${field.textHeight || ""}" placeholder="Auto" title="Write-in box height in pixels. Leave blank to fill the field automatically.">`)}
      ${fieldCell("Style", `<select class="sel small" data-path="${base}.${index}.type" title="Input style">
        <option value="text"${type === "text" ? " selected" : ""}>Single line</option>
        <option value="multiline"${type === "multiline" ? " selected" : ""}>Multiline</option>
        <option value="date"${type === "date" ? " selected" : ""}>Date</option>
        <option value="number"${type === "number" ? " selected" : ""}>Number</option>
      </select>`)}
      ${fieldCell("Align", `<select class="sel small" data-path="${base}.${index}.align" title="Where the write-in box sits inside a taller field">
        <option value="top"${align === "top" ? " selected" : ""}>Top</option>
        <option value="center"${align === "center" ? " selected" : ""}>Middle</option>
        <option value="bottom"${align === "bottom" ? " selected" : ""}>Bottom</option>
      </select>`)}
      ${fieldCell("Row", `<label class="toggle compact"><input type="checkbox" data-path="${base}.${index}.break" data-value-type="bool"${field.break ? " checked" : ""}><span>New line</span></label>`)}
      <button class="mini del" data-action="delete-field" data-base="${base}" data-index="${index}" title="Delete field">×</button>
    </div>`;
    }).join("") + `<button class="addrow" data-action="add-field" data-base="${base}">+ field</button><div class="micro">Width is relative. Height sets the outer box. Write-in height (optional) sizes just the typed area — pair it with Top/Middle/Bottom to place a small write-in line inside a tall box, like a stamp. Input style controls single line, multiline, date, or number entry — height no longer switches it automatically. Check "New line" to start this field on a fresh row below the previous ones. The preview shows a dashed outline where it will sit.</div>`;
  }

  function cardHead(type, index, noun) {
    return `<div class="card-head"><span class="tag">${esc(type)}</span><span class="spacer"></span><button class="mini" data-action="move-up" data-index="${index}" data-noun="${noun}">↑</button><button class="mini" data-action="move-down" data-index="${index}" data-noun="${noun}">↓</button><button class="mini del" data-action="delete-item" data-index="${index}" data-noun="${noun}">×</button></div>`;
  }

  function blockIcon(type) {
    const icons = {
      prose: `<path d="M5 5h14M5 9h14M5 13h10M5 17h12"/>`,
      fields: `<rect x="4" y="5" width="16" height="6" rx="1"/><rect x="4" y="14" width="7" height="5" rx="1"/><rect x="13" y="14" width="7" height="5" rx="1"/>`,
      checks: `<circle cx="6" cy="6" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="6" cy="18" r="1.5"/><path d="M10 6h9M10 12h9M10 18h9"/>`,
      checklist: `<path d="m4 6 1.5 1.5L8 4.5M11 6h9M4 12l1.5 1.5L8 10.5M11 12h9M4 18l1.5 1.5L8 16.5M11 18h9"/>`,
      list: `<path d="M7 6h13M7 12h13M7 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1"/>`,
      table: `<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 4v16M15 4v16"/>`,
      keyvalue: `<path d="M4 5h5v5H4zM12 6h8M4 14h5v5H4zM12 15h8"/>`,
      callout: `<path d="M6 7h5v5H7l-2 4M14 7h5v5h-4l-2 4"/>`,
      note: `<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>`,
      signature: `<path d="M3 17c3-8 4-10 5-10 2 0-1 10 1 10 1 0 3-6 4-6 1 0-1 6 1 6 1 0 3-3 4-3 1 0 1 2 3 2"/>`,
      ack: `<circle cx="9" cy="7" r="3"/><path d="M3.5 19c.5-4 2.5-6 5.5-6 2 0 3.5.8 4.5 2M15 18l2 2 4-5"/>`,
      attachments: `<path d="M8 7v10a4 4 0 0 0 8 0V6a3 3 0 0 0-6 0v10a2 2 0 0 0 4 0V8"/>`,
      approval: `<path d="M4 6h9M4 12h7M4 18h6M14 16l2.5 2.5L21 13"/>`,
      budget: `<path d="M4 7h16M4 12h16M4 17h16M8 4v16M17 4v16"/>`,
      schedule: `<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M13 14h4M7 18h5"/>`,
      contacts: `<circle cx="8" cy="8" r="3"/><path d="M3 19c.5-4 2-6 5-6s4.5 2 5 6M15 7h6M15 11h5M16 15h4"/>`,
      revisions: `<path d="M6 3h10l3 3v15H6zM15 3v4h4M9 11h7M9 15h7M9 19h5"/>`,
      evidence: `<rect x="3" y="5" width="18" height="15" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/>`,
      signatory: `<circle cx="12" cy="7" r="3"/><path d="M5 20c.5-5 3-7 7-7s6.5 2 7 7"/>`,
      header: `<rect x="3" y="4" width="7" height="7" rx="1"/><path d="M13 6h8M13 10h5M3 16h18"/>`,
      pagebreak: `<path d="M4 7h16M4 17h16M8 12h8M12 9v6"/>`,
      text: `<path d="M5 5h14M5 9h14M5 13h10M5 17h12"/>`,
      sign: `<path d="M3 17c3-8 4-10 5-10 2 0-1 10 1 10 1 0 3-6 4-6 1 0-1 6 1 6 1 0 3-3 4-3 1 0 1 2 3 2"/>`,
      document: `<path d="M14 2v6h6"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>`
    };
    return `<span class="block-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[type] || icons.prose}</svg></span>`;
  }

  // Block catalog, shared by the Add Block drawer's category grouping and its
  // search filter -- data first, rendering second.
  const BLOCK_CATALOG = [
    { title: "Write & organize", items: [
      ["prose", "Text section", "Narrative with an optional numbered heading."],
      ["header", "Header", "The BASE logo alongside a company name and contact details you enter."],
      ["list", "List", "Ordered steps or a simple bulleted list."],
      ["table", "Table", "Repeated records arranged in columns and rows."],
      ["keyvalue", "Key / value", "Compact label-and-value document facts."]
    ] },
    { title: "Collect & verify", items: [
      ["fields", "Fields", "Labeled areas for written information."],
      ["checks", "Choices", "Single- or multiple-choice options."],
      ["checklist", "Checklist", "Tasks or compliance items with check boxes."],
      ["attachments", "Attachments", "Drawing, file, and reference tracking rows."]
    ] },
    { title: "Plan & track", items: [
      ["budget", "Budget", "Cost codes, quantities, unit costs, and totals."],
      ["schedule", "Schedule", "Milestones, owners, dates, and status."],
      ["contacts", "Project contacts", "Companies, roles, and contact information."],
      ["revisions", "Revision history", "Track revisions, dates, authors, and changes."],
      ["evidence", "Evidence log", "Photo, file, location, and caption references."]
    ] },
    { title: "Approve & acknowledge", items: [
      ["signature", "Signature", "Signature, authorization, and date fields."],
      ["ack", "Acknowledgment", "A statement of understanding with signature."],
      ["approval", "Review decision", "Disposition, comments, and reviewer sign-off."],
      ["signatory", "Signatory", "The author or responsible person by name and role."]
    ] },
    { title: "Emphasize & arrange", items: [
      ["note", "Note", "A short caution, reminder, or explanation."],
      ["callout", "Callout", "An important statement with emphasis."],
      ["pagebreak", "Page break", "Start the next block on a new printed page."]
    ] }
  ];

  function catalogButton(type, label, description) {
    return `<button data-action="insert-block" data-type="${esc(type)}">${blockIcon(type)}<span class="block-copy"><strong>${esc(label)}</strong><span>${esc(description)}</span></span></button>`;
  }

  function renderBlockCatalog(query) {
    const q = (query || "").trim().toLowerCase();
    const groups = BLOCK_CATALOG.map(group => ({
      title: group.title,
      items: group.items.filter(([type, label, description]) => !q ||
        label.toLowerCase().includes(q) || description.toLowerCase().includes(q) || type.includes(q))
    })).filter(group => group.items.length);
    $("#blockCatalog").innerHTML = groups.length
      ? groups.map(group => `<h4 class="block-group-title">${esc(group.title)}</h4>${group.items.map(([type, label, description]) => catalogButton(type, label, description)).join("")}`).join("")
      : `<div class="empty-state">No blocks match “${esc(query)}.”</div>`;
  }

  // --- Selection -------------------------------------------------------
  // The selected node is tracked by object reference so it survives reorder
  // (splice/swap keeps the same object) and self-heals to Document Settings
  // if the item was deleted or def was swapped out entirely.

  function locateSelected() {
    if (selectedItem === DOCUMENT_NODE) return { collection: "document", index: -1 };
    if (def.kind === "form") {
      const index = (def.sections || []).indexOf(selectedItem);
      if (index >= 0) return { collection: "section", index };
    }
    if (def.kind === "document") {
      const index = (def.blocks || []).indexOf(selectedItem);
      if (index >= 0) return { collection: "block", index };
    }
    return null;
  }

  function selectNode(item) {
    selectedItem = item;
    renderOutline();
    renderInspector();
    applySelectionHighlight();
    openInspectorDrawer();
  }

  function itemType(item, noun) {
    if (noun === "section" && !item.type) return item.fields ? "fields" : item.checks ? "choices" : item.sign ? "signature" : "text";
    return item.type;
  }

  function itemLabel(item, noun) {
    if (noun === "section" && !item.type) return item.name || "Untitled section";
    const titles = { prose: item.heading, fields: item.heading, checks: item.heading, checklist: item.heading, list: item.heading, signature: item.heading, ack: item.heading, attachments: item.heading, approval: item.heading, budget: item.heading, schedule: item.heading, contacts: item.heading, revisions: item.heading, evidence: item.heading, note: item.title, callout: "Highlighted statement", table: "Data table", keyvalue: "Key / value facts", signatory: item.name, header: item.companyName || "Header", pagebreak: "Page break" };
    return titles[item.type] || "Untitled block";
  }

  function basicSectionBody(section, index) {
    let body = `<div class="two">${textInput("Section name", `sections.${index}.name`, section.name)}${textInput("Requirement", `sections.${index}.req`, section.req)}</div>`;
    if (section.fields) body += fieldRows(`sections.${index}.fields`, section.fields, "Write-in fields", "top");
    if (section.sign) body += fieldRows(`sections.${index}.sign`, section.sign, "Signature fields", "bottom");
    if (section.checks) body += textArea("Options — one per line", `sections.${index}.checks`, section.checks.join("\n"), "lines") + `<div class="two">${boolInput("Select one", `sections.${index}.single`, Boolean(section.single))}${textInput("Columns", `sections.${index}.cols`, section.cols || 1, { type: "number", valueType: "number", min: 1 })}</div>`;
    if (section.text !== undefined) body += textArea("Instruction text", `sections.${index}.text`, section.text);
    return body;
  }

  function blockBody(block, index, collection) {
    const base = `${collection}.${index}`;
    let body = "";
    if (block.type === "prose") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${boolInput("Number section", `${base}.number`, block.number !== false)}</div>` + textArea("Paragraphs", `${base}.paras`, (block.paras || []).join("\n\n"), "paras", "Enter = line break. Blank line = new paragraph.");
    if (block.type === "callout") body = textArea("Callout", `${base}.text`, block.text) + textInput("Attribution", `${base}.attribution`, block.attribution);
    if (block.type === "note") body = textInput("Note title", `${base}.title`, block.title) + textArea("Note text", `${base}.text`, block.text);
    if (block.type === "signatory") body = textInput("Name", `${base}.name`, block.name) + textInput("Role", `${base}.role`, block.role);
    if (block.type === "header") body = textInput("Company name", `${base}.companyName`, block.companyName) + `<div class="two">${textInput("Phone", `${base}.phone`, block.phone)}${textInput("Email", `${base}.email`, block.email)}</div>` + textInput("Address", `${base}.address`, block.address);
    if (block.type === "table") body = textInput("Columns — comma separated", `${base}.columns`, (block.columns || []).join(", "), { valueType: "commas" }) + textArea("Rows — one per line, cells separated by |", `${base}.rows`, (block.rows || []).map(row => row.join(" | ")).join("\n"), "rows");
    if (block.type === "list") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${boolInput("Numbered list", `${base}.ordered`, Boolean(block.ordered))}</div>` + textArea("Items — one per line", `${base}.items`, (block.items || []).join("\n"), "lines");
    if (block.type === "checklist") body = textInput("Heading", `${base}.heading`, block.heading) + textArea("Checklist items", `${base}.items`, (block.items || []).join("\n"), "lines");
    if (block.type === "keyvalue") body = textArea("Rows — Label | Value", `${base}.items`, (block.items || []).map(row => row.join(" | ")).join("\n"), "rows");
    if (["schedule", "contacts", "revisions", "evidence"].includes(block.type)) body = textInput("Heading", `${base}.heading`, block.heading) + textInput("Columns — comma separated", `${base}.columns`, (block.columns || []).join(", "), { valueType: "commas" }) + textArea("Rows — one per line, cells separated by |", `${base}.rows`, (block.rows || []).map(row => row.join(" | ")).join("\n"), "rows");
    if (block.type === "budget") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${textInput("Currency symbol", `${base}.currency`, block.currency || "$")}</div>` + textArea("Cost rows — Code | Description | Qty | Unit cost | Amount (optional)", `${base}.rows`, (block.rows || []).map(row => row.join(" | ")).join("\n"), "rows", "Leave Amount blank to calculate Quantity × Unit cost.");
    if (["fields", "signature", "ack", "attachments"].includes(block.type)) {
      body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${textInput("Requirement", `${base}.req`, block.req)}</div>`;
      if (block.type === "ack") body += textArea("Acknowledgment text", `${base}.intro`, block.intro);
      body += fieldRows(`${base}.fields`, block.fields || [], block.type === "signature" ? "Signature fields" : block.type === "attachments" ? "Attachment / reference rows" : "Fields", block.type === "signature" ? "bottom" : "top");
      if (block.type === "ack") body += fieldRows(`${base}.sign`, block.sign || [], "Signature fields", "bottom");
    }
    if (block.type === "checks") body = textInput("Heading", `${base}.heading`, block.heading) + textArea("Options", `${base}.checks`, (block.checks || []).join("\n"), "lines") + `<div class="two">${boolInput("Select one", `${base}.single`, Boolean(block.single))}${textInput("Columns", `${base}.cols`, block.cols || 1, { type: "number", valueType: "number", min: 1 })}</div>`;
    if (block.type === "approval") body = `<div class="two">${textInput("Heading", `${base}.heading`, block.heading)}${textInput("Requirement", `${base}.req`, block.req)}</div>` + textArea("Decision options", `${base}.checks`, (block.checks || []).join("\n"), "lines") + `<div class="two">${boolInput("Select one", `${base}.single`, block.single !== false)}${textInput("Columns", `${base}.cols`, block.cols || 2, { type: "number", valueType: "number", min: 1 })}</div>` + fieldRows(`${base}.fields`, block.fields || [], "Review / response fields", "top") + fieldRows(`${base}.sign`, block.sign || [], "Reviewer sign-off", "bottom");
    if (block.type === "pagebreak") body = `<p class="micro">Forces the following content onto a new printed page.</p>`;
    return body;
  }

  function inspectorBody(item, index, noun) {
    if (noun === "section" && !item.type) return basicSectionBody(item, index);
    const collection = noun === "section" ? "sections" : "blocks";
    return blockBody(item, index, collection);
  }

  function renderInspector() {
    if (locateSelected() === null) selectedItem = DOCUMENT_NODE;
    const located = locateSelected();
    const title = $("#inspectorTitle");
    if (!located || located.collection === "document") {
      if (title) title.textContent = "Document Settings";
      $("#inspector").innerHTML = commonPanel() + controlPanel() + appearancePanel();
      return;
    }
    const array = located.collection === "section" ? def.sections : def.blocks;
    const item = array[located.index];
    if (title) title.textContent = itemLabel(item, located.collection);
    $("#inspector").innerHTML = `<div class="inspector-item"><div class="inspector-item-head"><span class="tag">${esc(itemType(item, located.collection))}</span><span class="spacer"></span><button class="mini" data-action="move-up" data-index="${located.index}" data-noun="${located.collection}" title="Move up">↑</button><button class="mini" data-action="move-down" data-index="${located.index}" data-noun="${located.collection}" title="Move down">↓</button><button class="mini del" data-action="delete-item" data-index="${located.index}" data-noun="${located.collection}" title="Delete">×</button></div>${inspectorBody(item, located.index, located.collection)}</div>`;
  }

  // --- Outline -----------------------------------------------------------

  function outlineRow(item, index, noun) {
    const selected = selectedItem === item;
    const req = item.req;
    return `<div class="outline-row${selected ? " selected" : ""}" draggable="true">
      <span class="outline-drag-handle" aria-hidden="true">⠿</span>
      <button class="outline-row-body" data-action="select-node" data-noun="${noun}" data-index="${index}">
        <span class="outline-no">${String(index + 1).padStart(2, "0")}</span>
        ${blockIcon(itemType(item, noun))}
        <span class="outline-label">${esc(itemLabel(item, noun))}</span>
        ${req ? `<span class="outline-req">${esc(req)}</span>` : ""}
      </button>
      <span class="outline-row-actions">
        <button class="mini del" data-action="delete-item" data-index="${index}" data-noun="${noun}" title="Delete">×</button>
      </span>
    </div>`;
  }

  function insertPoint(noun, atIndex) {
    return `<button class="outline-insert" data-action="open-add-drawer" data-noun="${noun}" data-insert-at="${atIndex}" title="Insert a block here" aria-label="Insert a block here">+</button>`;
  }

  function documentHeaderRow() {
    const selected = selectedItem === DOCUMENT_NODE;
    return `<button class="outline-doc-header${selected ? " selected" : ""}" data-action="select-document">
      ${blockIcon("document")}
      <span><span class="outline-doc-title">${esc(def.title || "Untitled")}</span><span class="outline-doc-meta">Document Settings</span></span>
    </button>`;
  }

  function outlineRows(noun) {
    const array = noun === "section" ? (def.sections || []) : (def.blocks || []);
    let body = insertPoint(noun, 0);
    array.forEach((item, index) => {
      body += outlineRow(item, index, noun) + insertPoint(noun, index + 1);
    });
    return body;
  }

  function packageOutline() {
    const docs = def.documents || [];
    return `<div class="package-tools"><p class="micro">A package is a controlled snapshot of several documents. Add a new item here or bring in an existing library record; its cover and page index regenerate automatically.</p><div class="package-add-grid"><button data-action="add-package-blank" data-kind="document">+ Blank document</button><button data-action="add-package-blank" data-kind="form">+ Blank form</button><button data-action="open-package-templates">+ From template</button><button data-action="open-library">+ From library</button></div></div>` +
      (docs.length ? docs.map((item, index) => {
        const doc = item.def || item;
        return `<article class="card package-card">${cardHead(doc.documentType || doc.kind, index, "package")}<strong>${esc(doc.title || "Untitled")}</strong><span>${esc(doc.no || "")} · ${esc(doc.kind || "document")}${item.sourceId ? " · Library snapshot" : ""}</span><div class="package-card-actions"><button class="wide-action" data-action="duplicate-package-document" data-index="${index}">Duplicate</button><button class="wide-action package-edit" data-action="edit-package-document" data-index="${index}">Edit document</button></div></article>`;
      }).join("") : `<div class="empty-state">This package is empty. Add a blank item, use a template, or bring in a controlled document from the library.</div>`);
  }

  function renderOutline() {
    const packageNav = packageContext ? `<section class="panel package-editing"><h3>Editing package document</h3><p class="micro">Changes are being saved inside ${esc(packageContext.packageDef.title || "this package")}.</p><button class="wide-action" data-action="back-to-package">← Back to package</button></section>` : "";
    let body = packageNav + documentHeaderRow();
    if (def.kind === "form") body += `<div class="outline-list">${outlineRows("section")}</div>`;
    else if (def.kind === "document") body += `<div class="outline-list">${outlineRows("block")}</div>`;
    else body += packageOutline();
    $("#outline").innerHTML = body;
  }

  // Keeps the last preview that rendered successfully so a definition that
  // becomes momentarily invalid (e.g. mid-edit, or a bad AI import) never
  // blanks the builder -- it shows the last good page and an error toast
  // instead of a broken/blank preview.
  let lastGoodPreviewHtml = "";

  // Every keystroke rebuilds #pv from scratch (fresh innerHTML) and
  // re-paginates the whole thing, which can shrink/grow the scrollable
  // height mid-edit and drag .previewpane's scroll position back toward the
  // top. Tracking the user's real scroll position via a standing listener
  // (rather than re-reading it inside renderPreview each time) keeps it
  // correct even when several renders fire in quick succession -- e.g.
  // clicking a number input's spinner -- where re-reading scrollTop
  // mid-render could capture a transient, not-yet-settled value.
  let lastKnownScrollTop = 0;
  const previewPane = $(".previewpane");
  if (previewPane) previewPane.addEventListener("scroll", () => { lastKnownScrollTop = previewPane.scrollTop; });

  function renderPreview() {
    try {
      const html = BASE.render(def, { fill: false });
      lastGoodPreviewHtml = html;
      $("#pv").innerHTML = html;
      applySelectionHighlight();
      if (previewPane) previewPane.scrollTop = lastKnownScrollTop;
      requestAnimationFrame(() => {
        BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); fit();
        if (previewPane) previewPane.scrollTop = lastKnownScrollTop;
      });
    } catch (error) {
      if (lastGoodPreviewHtml) $("#pv").innerHTML = lastGoodPreviewHtml;
      status(`Could not render the preview: ${error.message}. Showing the last valid version.`, "error");
    }
  }

  function applySelectionHighlight() {
    const previous = $("#pv .preview-selected");
    if (previous) previous.classList.remove("preview-selected");
    const located = locateSelected();
    if (!located || located.collection === "document") return;
    const target = $(`#pv [data-preview-${located.collection}="${located.index}"]`);
    if (target) target.classList.add("preview-selected");
  }

  function renderAll() {
    normalize(def);
    renderOutline(); renderInspector(); renderPreview(); persist();
    $("#kindBadge").textContent = `${packageContext ? "PACKAGE ITEM · " : ""}${def.documentType || def.kind}`.toUpperCase();
    updateCommandState();
  }

  function updateCommandState() {
    const button = $("#deleteButton");
    if (button) button.hidden = !activeId || !BASE_LIBRARY.editKey(activeId) || Boolean(packageContext);
    const updateTemplate = $("#updateTemplateButton");
    if (updateTemplate) updateTemplate.hidden = !activeTemplateKey || Boolean(packageContext);
    const divider = $("[data-conditional-divider]");
    if (divider) divider.hidden = Boolean(button && button.hidden) && Boolean(updateTemplate && updateTemplate.hidden);
  }

  function jumpToPreview(collection, index) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = $(`#pv [data-preview-${collection}="${index}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("preview-jump");
      setTimeout(() => target.classList.remove("preview-jump"), 1400);
    }));
  }

  function jumpToOutline(noun, index) {
    // The row already renders with the persistent .selected style by the
    // time this runs (selectNode() re-renders the outline first), so this
    // only needs to scroll it into view -- flashing a second, competing
    // outline here (like jumpToPreview's .preview-jump) used to bleed past
    // the row's edges into the zero-margin insert points above/below it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const rows = Array.prototype.slice.call($("#outline").querySelectorAll(`[data-action="select-node"][data-noun="${noun}"]`));
      const button = rows.find(row => Number(row.dataset.index) === index);
      if (!button) return;
      (button.closest(".outline-row") || button).scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  function openInspectorDrawer() {
    const inspector = $(".inspector");
    if (inspector) inspector.classList.add("open");
  }
  function closeInspectorDrawer() {
    const inspector = $(".inspector");
    if (inspector) inspector.classList.remove("open");
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

  function newBlock(type) {
    const templates = {
      prose: { type, heading: "New Section", paras: ["Write here."] }, fields: { type, heading: "Information", req: "REQUIRED", fields: [{ label: "Field", w: 1, height: 46, id: newId() }] },
      checks: { type, heading: "Options", req: "SELECT ONE", single: true, cols: 1, checks: ["Option A", "Option B"], id: newId("g") }, checklist: { type, heading: "Checklist", items: ["Item one", "Item two"], id: newId("g") },
      list: { type, heading: "List", ordered: false, items: ["Item one", "Item two"] }, table: { type, columns: ["Column A", "Column B"], rows: [["", ""]] },
      keyvalue: { type, items: [["Label", "Value"], ["Label", "Value"]] }, callout: { type, text: "Important callout." }, note: { type, title: "Note", text: "Important note." },
      signature: { type, heading: "Authorization", req: "REQUIRED", fields: [{ label: "Signature", w: 2, height: 54, id: newId() }, { label: "Date", w: 1, height: 54, id: newId() }] },
      ack: { type, heading: "Acknowledgment", req: "REQUIRED", intro: "I acknowledge and understand this document.", fields: [{ label: "Printed Name", w: 2, height: 46, id: newId() }], sign: [{ label: "Signature", w: 2, height: 54, id: newId() }, { label: "Date", w: 1, height: 54, id: newId() }] },
      attachments: { type, heading: "Attachments / References", req: "AS APPLICABLE", fields: [{ label: "Attachment / drawing / reference 1", w: 1, height: 46, id: newId() }, { label: "Attachment / drawing / reference 2", w: 1, height: 46, id: newId() }] },
      approval: { type, heading: "Review Decision", req: "SELECT ONE", single: true, cols: 2, checks: ["Approved", "Approved as Noted", "Revise and Resubmit", "Rejected"], id: newId("g"), fields: [{ label: "Review comments", w: 1, height: 78, type: "multiline", id: newId() }], sign: [{ label: "Reviewed By", w: 2, height: 54, id: newId() }, { label: "Date", w: 1, height: 54, id: newId() }] },
      budget: { type, heading: "Budget / Cost Breakdown", currency: "$", rows: [["01", "Labor", "1", "0.00", ""], ["02", "Materials", "1", "0.00", ""], ["03", "Equipment", "1", "0.00", ""]] },
      schedule: { type, heading: "Schedule / Milestones", columns: ["Milestone", "Owner", "Start", "Due", "Status"], rows: [["Milestone one", "", "", "", "Not Started"], ["Milestone two", "", "", "", "Not Started"]] },
      contacts: { type, heading: "Project Contacts", columns: ["Company / Person", "Role", "Email", "Phone"], rows: [["", "", "", ""], ["", "", "", ""]] },
      revisions: { type, heading: "Revision History", columns: ["Revision", "Date", "Author", "Description"], rows: [["1.0", "", "", "Initial issue"]] },
      evidence: { type, heading: "Evidence / Photo Log", columns: ["Photo / File Ref.", "Caption", "Date", "Location"], rows: [["", "", "", ""], ["", "", "", ""]] },
      signatory: { type, name: "Name", role: "Title" },
      header: { type, companyName: "", address: "", phone: "", email: "" },
      pagebreak: { type }
    };
    return BASE.clone(templates[type] || templates.prose);
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

  // --- Outline drag-to-reorder -----------------------------------------
  // Reuses the existing insertion points as drop targets, so dragging a row
  // highlights the same "+" affordance used to insert a new block there --
  // one consistent mental model for "this is where it lands."

  let dragSource = null; // { noun, index }

  function clearDragTarget() {
    const marked = $("#outline .outline-insert.drag-target");
    if (marked) marked.classList.remove("drag-target");
  }

  function nearestInsertPoint(row, clientY) {
    const rect = row.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    const sibling = before ? row.previousElementSibling : row.nextElementSibling;
    return sibling && sibling.classList.contains("outline-insert") ? sibling : null;
  }

  function reorderItem(noun, sourceIndex, insertAt) {
    const array = currentArray(noun);
    const item = array[sourceIndex];
    if (!item) return;
    array.splice(sourceIndex, 1);
    const adjusted = sourceIndex < insertAt ? insertAt - 1 : insertAt;
    array.splice(Math.max(0, Math.min(adjusted, array.length)), 0, item);
    renderAll();
  }

  // --- Add Block drawer ----------------------------------------------

  let drawerNoun = null;
  let drawerInsertAt = null;

  function openAddDrawer(noun, insertAt) {
    drawerNoun = noun;
    drawerInsertAt = insertAt;
    const search = $("#blockSearch");
    if (search) search.value = "";
    renderBlockCatalog("");
    $("#addBlockDrawer").hidden = false;
    requestAnimationFrame(() => { if (search) search.focus(); });
  }

  function closeAddDrawer() {
    $("#addBlockDrawer").hidden = true;
    drawerNoun = null;
    drawerInsertAt = null;
  }

  function insertBlockAt(noun, atIndex, type) {
    const array = currentArray(noun);
    const item = newBlock(type);
    const insertIndex = Math.max(0, Math.min(atIndex == null ? array.length : atIndex, array.length));
    array.splice(insertIndex, 0, item);
    closeAddDrawer();
    selectedItem = item;
    renderAll();
    jumpToPreview(noun, insertIndex);
  }

  function addBlankPackageDocument(kind) {
    if (def.kind !== "package") return;
    const document = kind === "form" ? BASE.blankForm() : BASE.blankDoc();
    def.documents.push({ def: clean(document) });
    const index = def.documents.length - 1;
    renderAll();
    editPackageDocument(index);
    status(`Blank ${kind === "form" ? "form" : "document"} added to the package.`, "success");
  }

  function openPackageTemplates() {
    const choices = BASE.templateCatalog.filter(item => !["package", "proposal", "safety-package"].includes(item.id));
    showModal("Add a template to this package", `<p class="micro">The template becomes an editable document inside this package. Changes here do not alter the original template.</p><div class="package-template-list">${choices.map(item => `<button data-package-template="${esc(item.id)}"><strong>${esc(item.label)}</strong><span>Add to package →</span></button>`).join("")}</div>`);
  }

  function duplicatePackageDocument(index) {
    const item = def.documents[index];
    if (!item) return;
    const source = clean(item.def || item);
    source.title = `${source.title || "Untitled"} Copy`;
    if (source.no) source.no = `${source.no}-COPY`;
    def.documents.splice(index + 1, 0, { def: source });
    renderAll();
    status("Package document duplicated as an independent copy.", "success");
  }

  function editPackageDocument(index) {
    const item = def.documents[index];
    if (!item) return;
    packageContext = { packageDef: def, index };
    def = normalize(BASE.clone(item.def || item));
    activeTemplateKey = null;
    selectedItem = DOCUMENT_NODE;
    renderAll();
    status("Editing a document inside the package.", "success");
  }

  function backToPackage() {
    if (!packageContext) return;
    syncPackageDocument();
    def = packageContext.packageDef;
    packageContext = null;
    activeTemplateKey = null;
    selectedItem = DOCUMENT_NODE;
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
      reader.onload = () => { try { def = normalize(JSON.parse(reader.result)); activeId = null; activeVersion = null; activeFolderId = null; packageContext = null; activeTemplateKey = null; selectedItem = DOCUMENT_NODE; renderAll(); status("Backup imported.", "success"); } catch (error) { status(`Could not import backup: ${error.message}`, "error"); } };
      reader.readAsText(input.files[0]);
    };
    input.click();
  }

  async function saveLibrary() {
    BASE_TOAST.setState("saving");
    try {
      const document = clean(rootDefinition());
      const saved = await BASE_LIBRARY.saveDocument(document, { id: activeId, folderId: activeFolderId, version: activeVersion });
      activeId = saved.document.id;
      activeVersion = saved.document.version;
      activeFolderId = saved.document.folderId || null;
      updateCommandState();
      status(`Saved to the shared library · version ${saved.document.version}.`, "success");
      BASE_TOAST.setState("saved");
      return saved.document;
    } catch (error) {
      status(`Could not save: ${error.message}`, "error");
      BASE_TOAST.setState("error");
      throw error;
    }
  }

  async function updateTemplate() {
    if (!activeTemplateKey || packageContext) return;
    const catalogEntry = BASE.templateCatalog.find(item => item.id === activeTemplateKey);
    const label = (catalogEntry && catalogEntry.label) || activeTemplateKey;
    const confirmed = window.confirm(
      `Update the "${label}" template with your current changes?\n\nEveryone who starts a new "${label}" from now on will get this version. This cannot be undone.`
    );
    if (!confirmed) return;
    BASE_TOAST.setState("saving");
    try {
      const definition = clean(rootDefinition());
      const published = await BASE_TEMPLATES.publishTemplate(activeTemplateKey, {
        name: def.title || label,
        kind: def.kind,
        definition
      });
      status(`Template updated — "${label}" is now on version ${published.publishedVersion.versionNumber}.`, "success");
      BASE_TOAST.setState("saved");
      return published;
    } catch (error) {
      status(`Could not update template: ${error.message}`, "error");
      BASE_TOAST.setState("error");
      throw error;
    }
  }

  // The built-in template renders immediately (fromTemplate() is synchronous
  // and used in many places). This optionally swaps in an organization's
  // published override once it loads, without blocking the initial render.
  async function applyPublishedTemplateOverride(key) {
    try {
      const published = await BASE_TEMPLATES.getTemplate(key);
      if (activeTemplateKey !== key || packageContext) return;
      def = normalize(BASE.clone(published.publishedVersion.definition));
      selectedItem = DOCUMENT_NODE;
      renderAll();
      status(`Loaded your organization's updated "${published.name}" template (v${published.publishedVersion.versionNumber}).`, "success");
    } catch (_) {
      // No published override yet (or the template API is unavailable) --
      // the built-in template already rendered, so there is nothing to do.
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

  async function deleteCurrentDocument() {
    if (!activeId || !BASE_LIBRARY.editKey(activeId) || packageContext) return;
    const title = def.title || def.no || "this document";
    if (!window.confirm(`Delete “${title}” from the controlled library? This cannot be undone.`)) return;
    try {
      await BASE_LIBRARY.deleteDocument(activeId);
      const kind = def.kind;
      activeId = null; activeVersion = null; activeFolderId = null; packageContext = null; activeTemplateKey = null;
      def = normalize(kind === "form" ? BASE.blankForm() : kind === "package" ? BASE.blankPackage() : BASE.blankDoc());
      selectedItem = DOCUMENT_NODE;
      history.replaceState({}, "", "builder.html");
      renderAll();
      status(`Deleted “${title}” from the controlled library.`, "success");
    } catch (error) { status(`Could not delete document: ${error.message}`, "error"); }
  }

  $("#outline").addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    const action = button.dataset.action;
    if (action === "select-document") return selectNode(DOCUMENT_NODE);
    if (action === "select-node") {
      const item = currentArray(button.dataset.noun)[Number(button.dataset.index)];
      if (item) { selectNode(item); jumpToPreview(button.dataset.noun, Number(button.dataset.index)); }
      return;
    }
    if (action === "open-add-drawer") return openAddDrawer(button.dataset.noun, button.dataset.insertAt === "" ? null : Number(button.dataset.insertAt));
    if (["move-up", "move-down", "delete-item"].includes(action)) {
      const array = currentArray(button.dataset.noun), index = Number(button.dataset.index);
      if (action === "delete-item") array.splice(index, 1); else move(array, index, action === "move-up" ? -1 : 1);
      return renderAll();
    }
    if (action === "edit-package-document") return editPackageDocument(Number(button.dataset.index));
    if (action === "duplicate-package-document") return duplicatePackageDocument(Number(button.dataset.index));
    if (action === "back-to-package") return backToPackage();
    if (action === "add-package-blank") return addBlankPackageDocument(button.dataset.kind);
    if (action === "open-package-templates") return openPackageTemplates();
    if (action === "open-library") return openLibrary();
  });

  $("#outline").addEventListener("dragstart", event => {
    const row = event.target.closest(".outline-row");
    const button = row && row.querySelector('[data-action="select-node"]');
    if (!button) return;
    dragSource = { noun: button.dataset.noun, index: Number(button.dataset.index) };
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "");
  });

  $("#outline").addEventListener("dragover", event => {
    if (!dragSource) return;
    const insertEl = event.target.closest(".outline-insert");
    const row = event.target.closest(".outline-row");
    let target = null;
    if (insertEl && insertEl.dataset.noun === dragSource.noun) target = insertEl;
    else if (row) {
      const button = row.querySelector('[data-action="select-node"]');
      if (button && button.dataset.noun === dragSource.noun) target = nearestInsertPoint(row, event.clientY);
    }
    if (!target) return;
    event.preventDefault();
    if (!target.classList.contains("drag-target")) { clearDragTarget(); target.classList.add("drag-target"); }
  });

  $("#outline").addEventListener("drop", event => {
    const target = $("#outline .outline-insert.drag-target");
    if (!target || !dragSource) return;
    event.preventDefault();
    reorderItem(dragSource.noun, dragSource.index, Number(target.dataset.insertAt));
    clearDragTarget();
    dragSource = null;
  });

  $("#outline").addEventListener("dragend", () => {
    const dragging = $("#outline .outline-row.dragging");
    if (dragging) dragging.classList.remove("dragging");
    clearDragTarget();
    dragSource = null;
  });

  // Arrow-key navigation between outline rows, mirroring the toolbar menus'
  // keyboard pattern -- moves focus only; Enter/Space still activates.
  $("#outline").addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const focusable = Array.prototype.slice.call(
      $("#outline").querySelectorAll('[data-action="select-document"], [data-action="select-node"]'),
    );
    const index = focusable.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, focusable.length - 1) : Math.max(index - 1, 0);
    focusable[nextIndex].focus();
  });

  $("#inspector").addEventListener("toggle", event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.dataset.panelKey) panelStates.set(details.dataset.panelKey, details.open);
  }, true);

  $("#inspector").addEventListener("input", event => {
    const el = event.target;
    if (el.dataset.path) { setPath(def, el.dataset.path, parseValue(el)); renderPreview(); persist(); }
    if (el.dataset.controlValue) { def.control[el.dataset.controlValue] = el.value; renderPreview(); persist(); }
  });
  $("#inspector").addEventListener("change", event => {
    const el = event.target;
    if (el.dataset.path) { setPath(def, el.dataset.path, parseValue(el)); renderPreview(); persist(); if (el.dataset.path.endsWith(".title") || el.dataset.path === "title") renderOutline(); }
    if (el.dataset.controlVisible) { def.controlVisibility[el.dataset.controlVisible] = el.checked; renderPreview(); persist(); }
    if (el.matches("[data-library-folder]")) activeFolderId = el.value || null;
  });
  $("#inspector").addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.closest("summary")) event.preventDefault();
    const action = button.dataset.action;
    if (action === "add-field") { getPath(def, button.dataset.base).push({ label: "New field", w: 1, height: 46, id: newId() }); renderInspector(); renderPreview(); persist(); return; }
    if (action === "delete-field") { getPath(def, button.dataset.base).splice(Number(button.dataset.index), 1); renderInspector(); renderPreview(); persist(); return; }
    if (["move-up", "move-down", "delete-item"].includes(action)) {
      const array = currentArray(button.dataset.noun), index = Number(button.dataset.index);
      if (action === "delete-item") array.splice(index, 1); else move(array, index, action === "move-up" ? -1 : 1);
      return renderAll();
    }
  });

  $("#pv").addEventListener("click", event => {
    const target = event.target.closest("[data-preview-section],[data-preview-block]");
    if (!target) return;
    const sectionAttr = target.getAttribute("data-preview-section");
    const noun = sectionAttr != null ? "section" : "block";
    const index = Number(sectionAttr != null ? sectionAttr : target.getAttribute("data-preview-block"));
    const array = currentArray(noun);
    const item = array && array[index];
    if (!item) return;
    selectNode(item);
    jumpToOutline(noun, index);
  });

  $("#addBlockDrawer").addEventListener("click", event => {
    if (event.target.matches("[data-action='close-drawer'], .drawer-backdrop")) return closeAddDrawer();
    const button = event.target.closest("button[data-action='insert-block']");
    if (button) insertBlockAt(drawerNoun, drawerInsertAt, button.dataset.type);
  });
  $("#blockSearch").addEventListener("input", event => renderBlockCatalog(event.target.value));

  $(".inspector-close").addEventListener("click", closeInspectorDrawer);

  $("#modal").addEventListener("change", event => {
    if (event.target.id === "libraryFolderFilter") openLibrary(event.target.value);
  });

  $("#modal").addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (event.target.matches(".modal-backdrop") || (button && button.dataset.action === "close-modal")) return closeModal();
    if (!button) return;
    if (button.dataset.packageTemplate) {
      if (def.kind !== "package" || packageContext) return;
      const document = BASE.fromTemplate(button.dataset.packageTemplate);
      def.documents.push({ def: clean(document) });
      closeModal(); renderAll(); status(`${document.title || "Template"} added to the package.`, "success");
      return;
    }
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
        def = normalize(BASE.clone(item.definition)); activeId = key ? item.id : null; activeVersion = key ? item.version : null; activeFolderId = item.folderId || null; packageContext = null; activeTemplateKey = null; selectedItem = DOCUMENT_NODE;
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
      try { await BASE_LIBRARY.deleteDocument(button.dataset.libraryDelete); if (activeId === button.dataset.libraryDelete) { activeId = null; activeVersion = null; updateCommandState(); } await openLibrary($("#libraryFolderFilter") ? $("#libraryFolderFilter").value : ""); }
      catch (error) { status(`Could not delete document: ${error.message}`, "error"); }
      return;
    }
    if (button.dataset.action === "apply-ai") {
      try { const parsed = JSON.parse($("#aiJson").value); def = normalize(parsed.definition || parsed); activeTemplateKey = null; selectedItem = DOCUMENT_NODE; closeModal(); renderAll(); status("AI JSON imported.", "success"); }
      catch (error) { status(`Invalid AI JSON: ${error.message}`, "error"); }
    }
  });

  // Accessible, framework-free disclosure menus for the command toolbar.
  // Each toggle carries [data-menu] + aria-controls pointing at a role="menu".
  // Keyboard operable, Escape/outside-click close, only one open at a time,
  // and the menu closes once an action item is chosen so the original
  // per-button bindings keep firing unchanged.
  function setupToolbarMenus() {
    const menus = Array.prototype.slice.call(document.querySelectorAll(".studio-commandbar [data-menu]"))
      .map(toggle => ({ toggle, menu: document.getElementById(toggle.getAttribute("aria-controls")) }))
      .filter(entry => entry.menu);

    const items = entry => Array.prototype.slice.call(entry.menu.querySelectorAll('[role="menuitem"]')).filter(item => !item.hidden);

    function close(entry, focusToggle) {
      if (entry.menu.hidden) return;
      entry.menu.hidden = true;
      entry.toggle.setAttribute("aria-expanded", "false");
      if (focusToggle) entry.toggle.focus();
    }
    function closeAll(except) {
      menus.forEach(entry => { if (entry !== except) close(entry, false); });
    }
    function open(entry, focusFirst) {
      closeAll(entry);
      entry.menu.hidden = false;
      entry.toggle.setAttribute("aria-expanded", "true");
      const list = items(entry);
      if (focusFirst && list.length) list[0].focus();
    }

    menus.forEach(entry => {
      entry.toggle.addEventListener("click", event => {
        event.preventDefault();
        if (entry.menu.hidden) open(entry, false); else close(entry, false);
      });
      entry.toggle.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(entry, true);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          open(entry, false);
          const list = items(entry);
          if (list.length) list[list.length - 1].focus();
        }
      });
      entry.menu.addEventListener("keydown", event => {
        const list = items(entry);
        const index = list.indexOf(document.activeElement);
        if (event.key === "Escape") { event.preventDefault(); close(entry, true); }
        else if (event.key === "ArrowDown") { event.preventDefault(); (list[index + 1] || list[0] || entry.toggle).focus(); }
        else if (event.key === "ArrowUp") { event.preventDefault(); (list[index - 1] || list[list.length - 1] || entry.toggle).focus(); }
        else if (event.key === "Home") { event.preventDefault(); if (list[0]) list[0].focus(); }
        else if (event.key === "End") { event.preventDefault(); if (list.length) list[list.length - 1].focus(); }
      });
      entry.menu.addEventListener("click", event => {
        if (event.target.closest('[role="menuitem"]')) close(entry, false);
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const openEntry = menus.find(entry => !entry.menu.hidden);
      if (openEntry) { event.preventDefault(); close(openEntry, true); }
    });
    document.addEventListener("click", event => {
      if (event.target.closest(".cmd-menu-wrap")) return;
      closeAll(null);
    });
  }

  $("#newButton").addEventListener("click", () => {
    def = normalize(BASE.fromTemplate($("#templateSelect").value));
    activeId = null; activeVersion = null; activeFolderId = null; packageContext = null;
    activeTemplateKey = $("#templateSelect").value;
    selectedItem = DOCUMENT_NODE;
    renderAll();
    status("New template created.", "success");
    applyPublishedTemplateOverride(activeTemplateKey);
  });
  $("#loadButton").addEventListener("click", loadJson);
  $("#downloadButton").addEventListener("click", saveJson);
  $("#saveButton").addEventListener("click", () => saveLibrary().catch(() => {}));
  $("#updateTemplateButton").addEventListener("click", () => updateTemplate().catch(() => {}));
  $("#deleteButton").addEventListener("click", deleteCurrentDocument);
  $("#libraryButton").addEventListener("click", openLibrary);
  $("#shareButton").addEventListener("click", copyShareLink);
  $("#aiButton").addEventListener("click", copyAIKit);
  $("#aiImportButton").addEventListener("click", importAI);
  $("#printButton").addEventListener("click", () => { renderPreview(); setTimeout(() => { BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); window.print(); }, 140); });
  setupToolbarMenus();
  window.addEventListener("beforeprint", () => { BASE.paginate($("#pv")); BASE.updatePackageIndex($("#pv")); });
  window.addEventListener("resize", fit);
  window.addEventListener("offline", () => BASE_TOAST.setState("offline"));
  window.addEventListener("online", () => BASE_TOAST.setState("draft"));

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
        def = normalize(BASE.clone(item.definition)); activeId = key ? id : null; activeVersion = key ? item.version : null; activeFolderId = item.folderId || null; activeTemplateKey = null;
        status(key ? "Opened editable shared document." : "Opened shared document as a copy.", "success");
      } catch (error) { status(`Could not open shared document: ${error.message}`, "error"); }
    } else if (params.get("template")) {
      const template = params.get("template");
      if (BASE.templateCatalog.some(item => item.id === template)) {
        def = normalize(BASE.fromTemplate(template));
        $("#templateSelect").value = template;
        activeTemplateKey = template;
        status("Template opened in a new local draft.", "success");
        applyPublishedTemplateOverride(template);
      }
    } else if (params.get("new")) {
      const kind = params.get("new");
      def = normalize(kind === "form" ? BASE.blankForm() : kind === "package" ? BASE.blankPackage() : BASE.blankDoc());
      activeTemplateKey = null;
      status(`New ${kind === "form" || kind === "package" ? kind : "document"} started.`, "success");
    }
    selectedItem = DOCUMENT_NODE;
    renderAll();
  }

  $("#templateSelect").innerHTML = BASE.templateCatalog.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join("");
  initialize();
})();
