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
  let activeTemplateKey = null;
  const collapsedItems = new WeakSet();
  const panelStates = new Map();
  let def = loadInitial();

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
    if (!Array.isArray(value)) return { label: value.label || "Field", w: Number(value.w) || 1, height: Number(value.height || value.h) || 46, multiline: Boolean(value.multiline), id: value.id || "", break: Boolean(value.break) };
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
    return `<details class="panel collapsible" data-panel-key="details"${openAttribute("details", true)}><summary>${esc(def.documentType || def.kind)} details</summary>
      <div class="two">${textInput(isPackage ? "Package No." : (def.kind === "form" ? "Form No." : "Document No."), "no", def.no)}${textInput("Type", "documentType", def.documentType)}</div>
      ${textInput("Title", "title", def.title)}
      ${textInput(isDoc ? "Subtitle" : "Supporting line", isDoc || isPackage ? "subtitle" : "sub", isDoc || isPackage ? def.subtitle : def.sub)}
      <div class="two">${textInput("Division / Organization", "org", def.org)}${textInput("Header notice", "headerNote", def.headerNote === undefined ? "Controlled Document — Do Not Reproduce" : def.headerNote)}</div>
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

  function fieldRows(base, fields, label, defaultAlign) {
    defaultAlign = defaultAlign || "top";
    return `<label class="lbl">${esc(label || "Fields")}</label>` + (fields || []).map((field, index) => {
      const align = field.align || defaultAlign;
      return `<div class="field-editor">
      <input class="in" data-path="${base}.${index}.label" value="${esc(field.label)}" placeholder="Label">
      <input class="in small" type="number" min=".25" step=".25" data-path="${base}.${index}.w" data-value-type="number" value="${field.w || 1}" title="Relative width">
      <input class="in small" type="number" min="36" step="4" data-path="${base}.${index}.height" data-value-type="number" value="${field.height || 46}" title="Field height in pixels">
      <label class="icon-toggle" title="Multiline"><input type="checkbox" data-path="${base}.${index}.multiline" data-value-type="bool"${field.multiline ? " checked" : ""}>↵</label>
      <select class="sel small" data-path="${base}.${index}.align" title="Where the write-in box sits inside a taller field">
        <option value="top"${align === "top" ? " selected" : ""}>Top</option>
        <option value="center"${align === "center" ? " selected" : ""}>Middle</option>
        <option value="bottom"${align === "bottom" ? " selected" : ""}>Bottom</option>
      </select>
      <button class="mini del" data-action="delete-field" data-base="${base}" data-index="${index}" title="Delete field">×</button>
    </div>`;
    }).join("") + `<button class="addrow" data-action="add-field" data-base="${base}">+ field</button><div class="micro">Width is relative. Height controls the write-in area. Top/Middle/Bottom controls where the write-in box sits when the field is taller than one line.</div>`;
  }

  function cardHead(type, index, noun) {
    return `<div class="card-head"><span class="tag">${esc(type)}</span><span class="spacer"></span><button class="mini" data-action="move-up" data-index="${index}" data-noun="${noun}">↑</button><button class="mini" data-action="move-down" data-index="${index}" data-noun="${noun}">↓</button><button class="mini del" data-action="delete-item" data-index="${index}" data-noun="${noun}">×</button></div>`;
  }

  function editorCard(type, index, noun, title, body, item) {
    const open = collapsedItems.has(item) ? "" : " open";
    return `<details class="card editor-card" data-editor-noun="${noun}" data-index="${index}"${open}><summary class="editor-card-summary"><span class="tag">${esc(type)}</span><span class="editor-card-title">${esc(title || "Untitled block")}</span><span class="spacer"></span><button class="mini" data-action="move-up" data-index="${index}" data-noun="${noun}" title="Move up">↑</button><button class="mini" data-action="move-down" data-index="${index}" data-noun="${noun}" title="Move down">↓</button><button class="mini del" data-action="delete-item" data-index="${index}" data-noun="${noun}" title="Delete">×</button><span class="collapse-indicator" aria-hidden="true"></span></summary><div class="editor-card-body">${body}</div></details>`;
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
      sign: `<path d="M3 17c3-8 4-10 5-10 2 0-1 10 1 10 1 0 3-6 4-6 1 0-1 6 1 6 1 0 3-3 4-3 1 0 1 2 3 2"/>`
    };
    return `<span class="block-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[type] || icons.prose}</svg></span>`;
  }

  function pickerButton(attribute, type, label, description) {
    return `<button ${attribute}="${type}">${blockIcon(type)}<span class="block-copy"><strong>${esc(label)}</strong><span>${esc(description)}</span></span></button>`;
  }

  function pickerGroup(title, buttons) {
    return `<h4 class="block-group-title">${esc(title)}</h4>${buttons.join("")}`;
  }

  function blockPicker(attribute) {
    return `<details class="block-picker" data-panel-key="block-picker"${openAttribute("block-picker", true)}><summary>Add a block</summary><div class="addmenu">
      ${pickerGroup("Write & organize", [
        pickerButton(attribute, "prose", "Text section", "Narrative with an optional numbered heading."),
        pickerButton(attribute, "header", "Header", "The BASE logo alongside your company's contact information."),
        pickerButton(attribute, "list", "List", "Ordered steps or a simple bulleted list."),
        pickerButton(attribute, "table", "Table", "Repeated records arranged in columns and rows."),
        pickerButton(attribute, "keyvalue", "Key / value", "Compact label-and-value document facts.")
      ])}
      ${pickerGroup("Collect & verify", [
        pickerButton(attribute, "fields", "Fields", "Labeled areas for written information."),
        pickerButton(attribute, "checks", "Choices", "Single- or multiple-choice options."),
        pickerButton(attribute, "checklist", "Checklist", "Tasks or compliance items with check boxes."),
        pickerButton(attribute, "attachments", "Attachments", "Drawing, file, and reference tracking rows.")
      ])}
      ${pickerGroup("Plan & track", [
        pickerButton(attribute, "budget", "Budget", "Cost codes, quantities, unit costs, and totals."),
        pickerButton(attribute, "schedule", "Schedule", "Milestones, owners, dates, and status."),
        pickerButton(attribute, "contacts", "Project contacts", "Companies, roles, and contact information."),
        pickerButton(attribute, "revisions", "Revision history", "Track revisions, dates, authors, and changes."),
        pickerButton(attribute, "evidence", "Evidence log", "Photo, file, location, and caption references.")
      ])}
      ${pickerGroup("Approve & acknowledge", [
        pickerButton(attribute, "signature", "Signature", "Signature, authorization, and date fields."),
        pickerButton(attribute, "ack", "Acknowledgment", "A statement of understanding with signature."),
        pickerButton(attribute, "approval", "Review decision", "Disposition, comments, and reviewer sign-off."),
        pickerButton(attribute, "signatory", "Signatory", "The author or responsible person by name and role.")
      ])}
      ${pickerGroup("Emphasize & arrange", [
        pickerButton(attribute, "note", "Note", "A short caution, reminder, or explanation."),
        pickerButton(attribute, "callout", "Callout", "An important statement with emphasis."),
        pickerButton(attribute, "pagebreak", "Page break", "Start the next block on a new printed page.")
      ])}
    </div></details>`;
  }

  function formEditor() {
    return `<div class="editor-hint">Form blocks — use any content block, then collapse finished sections to keep the builder easy to scan.</div>` +
      (def.sections || []).map((section, index) => {
        if (section.type) return blockEditor(section, index, "sections", "section");
        const type = section.fields ? "fields" : section.checks ? "choices" : section.sign ? "signature" : "text";
        let body = `<div class="two">${textInput("Section name", `sections.${index}.name`, section.name)}${textInput("Requirement", `sections.${index}.req`, section.req)}</div>`;
        if (section.fields) body += fieldRows(`sections.${index}.fields`, section.fields, "Write-in fields", "top");
        if (section.sign) body += fieldRows(`sections.${index}.sign`, section.sign, "Signature fields", "bottom");
        if (section.checks) body += textArea("Options — one per line", `sections.${index}.checks`, section.checks.join("\n"), "lines") + `<div class="two">${boolInput("Select one", `sections.${index}.single`, Boolean(section.single))}${textInput("Columns", `sections.${index}.cols`, section.cols || 1, { type: "number", valueType: "number", min: 1 })}</div>`;
        if (section.text !== undefined) body += textArea("Instruction text", `sections.${index}.text`, section.text);
        return editorCard(type, index, "section", section.name || "Untitled section", body, section);
      }).join("") + blockPicker("data-add-form-block");
  }

  function blockEditor(block, index, collection, noun) {
    collection = collection || "blocks";
    noun = noun || "block";
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
    const titles = { prose: block.heading, fields: block.heading, checks: block.heading, checklist: block.heading, list: block.heading, signature: block.heading, ack: block.heading, attachments: block.heading, approval: block.heading, budget: block.heading, schedule: block.heading, contacts: block.heading, revisions: block.heading, evidence: block.heading, note: block.title, callout: "Highlighted statement", table: "Data table", keyvalue: "Key / value facts", signatory: block.name, header: block.companyName || "Header", pagebreak: "Page break" };
    return editorCard(block.type, index, noun, titles[block.type] || "Untitled block", body, block);
  }

  function documentEditor() {
    return `<div class="editor-hint">Document blocks — collapse finished sections to keep long documents easy to scan.</div>` +
      (def.blocks || []).map((block, index) => blockEditor(block, index)).join("") +
      blockPicker("data-add-block");
  }

  function packageEditor() {
    const docs = def.documents || [];
    return `<details class="panel collapsible package-tools" data-panel-key="package-tools"${openAttribute("package-tools", true)}><summary>Package documents</summary><p class="micro">A package is a controlled snapshot of several documents. Add a new item here or bring in an existing library record; its cover and page index regenerate automatically.</p><div class="package-add-grid"><button data-action="add-package-blank" data-kind="document">+ Blank document</button><button data-action="add-package-blank" data-kind="form">+ Blank form</button><button data-action="open-package-templates">+ From template</button><button data-action="open-library">+ From library</button></div></details>` +
      (docs.length ? docs.map((item, index) => {
        const doc = item.def || item;
        return `<article class="card package-card">${cardHead(doc.documentType || doc.kind, index, "package")}<strong>${esc(doc.title || "Untitled")}</strong><span>${esc(doc.no || "")} · ${esc(doc.kind || "document")}${item.sourceId ? " · Library snapshot" : ""}</span><div class="package-card-actions"><button class="wide-action" data-action="duplicate-package-document" data-index="${index}">Duplicate</button><button class="wide-action package-edit" data-action="edit-package-document" data-index="${index}">Edit document</button></div></article>`;
      }).join("") : `<div class="empty-state">This package is empty. Add a blank item, use a template, or bring in a controlled document from the library.</div>`);
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
    updateCommandState();
  }

  function updateCommandState() {
    const button = $("#deleteButton");
    if (button) button.hidden = !activeId || !BASE_LIBRARY.editKey(activeId) || Boolean(packageContext);
    const updateTemplate = $("#updateTemplateButton");
    if (updateTemplate) updateTemplate.hidden = !activeTemplateKey || Boolean(packageContext);
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
    def.sections.push(templates[type]);
    const index = def.sections.length - 1;
    renderAll(); jumpToPreview("section", index);
  }

  function newBlock(type) {
    const templates = {
      prose: { type, heading: "New Section", paras: ["Write here."] }, fields: { type, heading: "Information", req: "REQUIRED", fields: [{ label: "Field", w: 1, height: 46 }] },
      checks: { type, heading: "Options", req: "SELECT ONE", single: true, cols: 1, checks: ["Option A", "Option B"] }, checklist: { type, heading: "Checklist", items: ["Item one", "Item two"] },
      list: { type, heading: "List", ordered: false, items: ["Item one", "Item two"] }, table: { type, columns: ["Column A", "Column B"], rows: [["", ""]] },
      keyvalue: { type, items: [["Label", "Value"], ["Label", "Value"]] }, callout: { type, text: "Important callout." }, note: { type, title: "Note", text: "Important note." },
      signature: { type, heading: "Authorization", req: "REQUIRED", fields: [{ label: "Signature", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      ack: { type, heading: "Acknowledgment", req: "REQUIRED", intro: "I acknowledge and understand this document.", fields: [{ label: "Printed Name", w: 2, height: 46 }], sign: [{ label: "Signature", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      attachments: { type, heading: "Attachments / References", req: "AS APPLICABLE", fields: [{ label: "Attachment / drawing / reference 1", w: 1, height: 46 }, { label: "Attachment / drawing / reference 2", w: 1, height: 46 }] },
      approval: { type, heading: "Review Decision", req: "SELECT ONE", single: true, cols: 2, checks: ["Approved", "Approved as Noted", "Revise and Resubmit", "Rejected"], fields: [{ label: "Review comments", w: 1, height: 78, multiline: true }], sign: [{ label: "Reviewed By", w: 2, height: 54 }, { label: "Date", w: 1, height: 54 }] },
      budget: { type, heading: "Budget / Cost Breakdown", currency: "$", rows: [["01", "Labor", "1", "0.00", ""], ["02", "Materials", "1", "0.00", ""], ["03", "Equipment", "1", "0.00", ""]] },
      schedule: { type, heading: "Schedule / Milestones", columns: ["Milestone", "Owner", "Start", "Due", "Status"], rows: [["Milestone one", "", "", "", "Not Started"], ["Milestone two", "", "", "", "Not Started"]] },
      contacts: { type, heading: "Project Contacts", columns: ["Company / Person", "Role", "Email", "Phone"], rows: [["", "", "", ""], ["", "", "", ""]] },
      revisions: { type, heading: "Revision History", columns: ["Revision", "Date", "Author", "Description"], rows: [["1.0", "", "", "Initial issue"]] },
      evidence: { type, heading: "Evidence / Photo Log", columns: ["Photo / File Ref.", "Caption", "Date", "Location"], rows: [["", "", "", ""], ["", "", "", ""]] },
      signatory: { type, name: "Name", role: "Title" },
      header: { type, companyName: def.org || "", address: "", phone: "", email: "" },
      pagebreak: { type }
    };
    return BASE.clone(templates[type] || templates.prose);
  }

  function addBlock(type) {
    def.blocks.push(newBlock(type));
    const index = def.blocks.length - 1;
    renderAll(); jumpToPreview("block", index);
  }

  function addFormBlock(type) {
    def.sections.push(newBlock(type));
    const index = def.sections.length - 1;
    renderAll(); jumpToPreview("section", index);
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
    renderAll();
    status("Editing a document inside the package.", "success");
  }

  function backToPackage() {
    if (!packageContext) return;
    syncPackageDocument();
    def = packageContext.packageDef;
    packageContext = null;
    activeTemplateKey = null;
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
      reader.onload = () => { try { def = normalize(JSON.parse(reader.result)); activeId = null; activeVersion = null; activeFolderId = null; packageContext = null; activeTemplateKey = null; renderAll(); status("Backup imported.", "success"); } catch (error) { status(`Could not import backup: ${error.message}`, "error"); } };
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
      updateCommandState();
      status(`Saved to the shared library · version ${saved.document.version}.`, "success");
      return saved.document;
    } catch (error) {
      status(`Could not save: ${error.message}`, "error");
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
    try {
      status("Updating template…");
      const definition = clean(rootDefinition());
      const published = await BASE_TEMPLATES.publishTemplate(activeTemplateKey, {
        name: def.title || label,
        kind: def.kind,
        definition
      });
      status(`Template updated — "${label}" is now on version ${published.publishedVersion.versionNumber}.`, "success");
      return published;
    } catch (error) {
      status(`Could not update template: ${error.message}`, "error");
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
      history.replaceState({}, "", "builder.html");
      renderAll();
      status(`Deleted “${title}” from the controlled library.`, "success");
    } catch (error) { status(`Could not delete document: ${error.message}`, "error"); }
  }

  $("#ed").addEventListener("toggle", event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.matches(".editor-card")) {
      const item = currentArray(details.dataset.editorNoun)[Number(details.dataset.index)];
      if (item) {
        if (details.open) collapsedItems.delete(item);
        else collapsedItems.add(item);
      }
    }
    if (details.dataset.panelKey) panelStates.set(details.dataset.panelKey, details.open);
  }, true);

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
    if (button.closest("summary")) event.preventDefault();
    if (button.dataset.addSection) return addSection(button.dataset.addSection);
    if (button.dataset.addFormBlock) return addFormBlock(button.dataset.addFormBlock);
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
    if (action === "duplicate-package-document") return duplicatePackageDocument(Number(button.dataset.index));
    if (action === "back-to-package") return backToPackage();
    if (action === "add-package-blank") return addBlankPackageDocument(button.dataset.kind);
    if (action === "open-package-templates") return openPackageTemplates();
    if (action === "open-library") openLibrary();
  });

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
        def = normalize(BASE.clone(item.definition)); activeId = key ? item.id : null; activeVersion = key ? item.version : null; activeFolderId = item.folderId || null; packageContext = null; activeTemplateKey = null;
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
      try { const parsed = JSON.parse($("#aiJson").value); def = normalize(parsed.definition || parsed); activeTemplateKey = null; closeModal(); renderAll(); status("AI JSON imported.", "success"); }
      catch (error) { status(`Invalid AI JSON: ${error.message}`, "error"); }
    }
  });

  $("#newButton").addEventListener("click", () => {
    def = normalize(BASE.fromTemplate($("#templateSelect").value));
    activeId = null; activeVersion = null; activeFolderId = null; packageContext = null;
    activeTemplateKey = $("#templateSelect").value;
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
    renderAll();
  }

  $("#templateSelect").innerHTML = BASE.templateCatalog.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join("");
  initialize();
})();
