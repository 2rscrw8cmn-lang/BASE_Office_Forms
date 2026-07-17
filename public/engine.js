/* BASE Studio render engine: forms, documents, and multi-document packages. */
(function (root) {
  "use strict";

  const ORG_DEFAULT = "Office Process & Compliance Division";
  const CONTROL_KEYS = ["Revision", "Effective", "Classification", "Doc. Control"];
  const esc = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const slug = value => String(value || "field").toLowerCase().replace(/[†‡]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  const clone = value => JSON.parse(JSON.stringify(value));
  const today = () => new Date().toISOString().slice(0, 10);

  function appearance(def) {
    const a = def.appearance || {};
    const marginX = Math.max(.25, Number(a.marginX) || .7);
    const marginY = Math.max(.25, Number(a.marginY) || .55);
    return `--accent:${esc(a.accent || "#7a1e22")};--ink:${esc(a.ink || "#232327")};` +
      `--paper:${esc(a.paper || "#ffffff")};--pad-x:${marginX}in;--pad-y:${marginY}in;` +
      `--body-scale:${Math.max(.8, Math.min(1.35, Number(a.bodyScale) || 1))};`;
  }

  function sheetClass(def, extra) {
    const orientation = def.appearance && def.appearance.orientation === "landscape" ? " landscape" : "";
    return `sheet${orientation}${extra ? " " + extra : ""}`;
  }

  function topBar(def) {
    if (def.showHeader === false) return "";
    return `<div class="page-header"><div class="doc-top">
      <img class="doc-logo" src="${esc(def.logo || "assets/base-logo.svg?v=20260717")}" alt="BASE">
      <div class="doc-org">${esc(def.org || ORG_DEFAULT)}<br>${esc(def.headerNote || "Controlled Document — Do Not Reproduce")}</div>
    </div><div class="rule"></div></div>`;
  }

  function ctrlGrid(def, numberLabel) {
    if (def.showControl === false) return "";
    const visibility = def.controlVisibility || {};
    const cells = [];
    if (visibility.no !== false && def.no) cells.push([numberLabel || "Document No.", def.no]);
    CONTROL_KEYS.forEach(key => {
      if (visibility[key] !== false && def.control && def.control[key] !== undefined) {
        cells.push([key, def.control[key]]);
      }
    });
    if (!cells.length) return "";
    return `<div class="doc-control" style="--dc-cols:${cells.length}">` +
      cells.map(([label, value]) => `<div class="dc-cell"><div class="dc-label">${esc(label)}</div><div class="dc-val">${esc(value)}</div></div>`).join("") +
      `</div>`;
  }

  function sectionBar(no, name, req) {
    return `<div class="sec-head"><div class="sec-no">${esc(no)}</div>` +
      `<div class="sec-name">${esc(name)}</div>` +
      (req ? `<div class="sec-req">${esc(req)}</div>` : "") + `</div>`;
  }

  function normField(input, uid, schema, defaultType) {
    const source = Array.isArray(input)
      ? { label: input[0], w: input[1], id: input[2], height: input[3], type: input[4] }
      : (input || {});
    const label = source.label || "Field";
    const id = uid(slug(source.id || label));
    const type = source.type || defaultType || "text";
    if (schema) schema.push({ id, type, label });
    return {
      label,
      w: Number(source.w) || 1,
      id,
      type,
      height: Math.max(36, Number(source.height || source.h) || 46),
      multiline: Boolean(source.multiline)
    };
  }

  function prepareForm(form) {
    if (form._ready) return form;
    const seen = {}, schema = [];
    const uid = base => {
      seen[base] = (seen[base] || 0) + 1;
      return seen[base] > 1 ? `${base}_${seen[base]}` : base;
    };
    const walk = section => {
      if (section.row) return section.row.forEach(walk);
      if (section.fields) section.fields = section.fields.map(field => normField(field, uid, schema, "text"));
      if (section.sign) section.sign = section.sign.map(field => normField(field, uid, schema, "text"));
      if (section.checks) {
        section._gid = uid(slug(section.id || section.name || "choice"));
        section._opts = section.checks.map(option => String(option).replace(/[†‡]\s*$/, "").trim());
        schema.push({ id: section._gid, type: section.single ? "choose_one" : "choose_any", label: section.name, options: section._opts });
      }
    };
    (form.sections || []).forEach(walk);
    form._schema = schema;
    form._ready = true;
    return form;
  }

  function fieldsBlock(fields, fill, tall, namePrefix) {
    const normalized = fields.map((field, index) => field.id ? field : normField(field, value => value + "_" + index, null, "text"));
    const template = normalized.map(field => `${field.w}fr`).join(" ");
    return `<div class="grid" style="--tpl:${template};">` + normalized.map(field => {
      const height = tall ? Math.max(76, field.height) : field.height;
      const input = fill
        ? ((field.multiline || height >= 70)
          ? `<textarea class="ftx" name="${esc((namePrefix || "") + field.id)}"></textarea>`
          : `<input class="fin" name="${esc((namePrefix || "") + field.id)}">`)
        : "";
      return `<div class="field${height >= 70 ? " field-tall" : ""}" style="--fh:${height}px"><div class="field-label">${esc(field.label)}</div>${input}</div>`;
    }).join("") + `</div>`;
  }

  function checksBlock(section, fill, namePrefix) {
    const columns = Math.max(1, Number(section.cols) || 1);
    const type = section.single ? "radio" : "checkbox";
    return `<div class="check-box${columns > 1 ? " cols" : ""}" style="--ccols:${columns}">` +
      (section.checks || []).map(option => {
        const raw = String(option);
        const marker = raw.match(/([†‡])\s*$/);
        const text = raw.replace(/[†‡]\s*$/, "").trim();
        const input = fill ? `<input type="${type}" name="${esc((namePrefix || "") + (section._gid || slug(section.name)))}" value="${esc(text)}">` : "";
        return `<label class="check">${input}<span class="box"></span>${esc(text)}${marker ? `<sup class="dagger">${marker[1]}</sup>` : ""}</label>`;
      }).join("") + `</div>`;
  }

  function signBlock(fields, fill, namePrefix) {
    const normalized = fields.map((field, index) => field.id ? field : normField(field, value => value + "_" + index, null, "text"));
    return `<div class="sign-grid" style="--sign-tpl:${normalized.map(field => field.w + "fr").join(" ")};">` +
      normalized.map(field => `<div class="sign" style="min-height:${Math.max(54, field.height)}px"><div class="field-label">${esc(field.label)}</div>${fill ? `<input class="fin" name="${esc((namePrefix || "") + field.id)}">` : ""}</div>`).join("") +
      `</div>`;
  }

  function formSection(section, counter, fill, namePrefix) {
    if (section.row) return `<div class="grid paired" style="--cols:${section.row.length};--gap:14px">${section.row.map(item => formSection(item, counter, fill, namePrefix)).join("")}</div>`;
    const no = String(++counter.n).padStart(2, "0");
    let body = "";
    if (section.fields) body = fieldsBlock(section.fields, fill, section.tall, namePrefix);
    else if (section.checks) body = checksBlock(section, fill, namePrefix);
    else if (section.sign) body = signBlock(section.sign, fill, namePrefix);
    else if (section.text) body = `<p class="prose">${esc(section.text)}</p>`;
    return `<section class="section">${sectionBar(no, section.name, section.req)}${body}</section>`;
  }

  function renderForm(form, options) {
    options = options || {};
    prepareForm(form);
    const counter = { n: 0 };
    const footnotes = (form.footnotes || []).length ? `<div class="footnote">${form.footnotes.map(esc).join("<br>")}</div>` : "";
    return `<div class="${sheetClass(form)}" style="${appearance(form)}" id="sheet-${esc(form.no)}" data-paginate="true">${topBar(form)}
      <div class="form-tag">${esc(form.typeLabel || "Form")} ${esc(form.no)}</div>
      <h1 class="form-title">${esc(form.title)}</h1>
      ${form.sub ? `<p class="form-sub">${esc(form.sub)}</p>` : ""}
      ${ctrlGrid(form, "Form No.")}
      <div class="page-flow">${(form.sections || []).map(section => formSection(section, counter, options.fill, options.namePrefix)).join("")}${footnotes}</div></div>`;
  }

  function docFields(block) {
    return fieldsBlock(block.fields || [], false, block.tall);
  }

  function docBlock(block, counter) {
    switch (block.type) {
      case "prose": {
        const numbered = block.number === false ? null : String(++counter.n).padStart(2, "0");
        const heading = block.heading ? (numbered
          ? `<div class="section big">${sectionBar(numbered, block.heading)}</div>`
          : `<div class="doc-eyebrow-wrap">${block.eyebrow ? `<div class="eyebrow">${esc(block.eyebrow)}</div>` : ""}<h2 class="doc-h2">${esc(block.heading)}</h2></div>`) : "";
        const paras = block.paras || [];
        const first = `<div class="avoid">${heading}${paras.length ? `<p class="prose">${esc(paras[0])}</p>` : ""}</div>`;
        return first + paras.slice(1).map(text => `<p class="prose flow-paragraph">${esc(text)}</p>`).join("");
      }
      case "callout": return `<div class="pull avoid"><div class="pull-q">${esc(block.text)}</div>${block.attribution ? `<div class="pull-a">${esc(block.attribution)}</div>` : ""}</div>`;
      case "note": return `<div class="note avoid">${block.title ? `<div class="note-t">${esc(block.title)}</div>` : ""}<div class="note-b">${esc(block.text)}</div></div>`;
      case "signatory": return `<div class="signatory avoid"><div class="sig-line"></div><div class="sig-name">${esc(block.name)}</div><div class="sig-role">${esc(block.role)}</div></div>`;
      case "table": {
        const header = `<tr>${(block.columns || []).map(column => `<th>${esc(column)}</th>`).join("")}</tr>`;
        const rows = (block.rows || []).map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("");
        return `<table class="dtable avoid"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
      }
      case "list": return `<div class="list-block avoid">${block.heading ? `<h3>${esc(block.heading)}</h3>` : ""}<${block.ordered ? "ol" : "ul"}>${(block.items || []).map(item => `<li>${esc(item)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}></div>`;
      case "checklist": return `<div class="checklist-block avoid">${block.heading ? `<h3>${esc(block.heading)}</h3>` : ""}${(block.items || []).map(item => `<div class="checkline"><span class="box"></span><span>${esc(item)}</span></div>`).join("")}</div>`;
      case "keyvalue": return `<div class="keyvalue avoid">${(block.items || []).map(item => `<div class="key">${esc(item[0] || item.label)}</div><div class="value">${esc(item[1] || item.value)}</div>`).join("")}</div>`;
      case "fields": return `<section class="section big">${sectionBar(String(++counter.n).padStart(2, "0"), block.heading || "Information", block.req)}${docFields(block)}</section>`;
      case "checks": return `<section class="section big">${sectionBar(String(++counter.n).padStart(2, "0"), block.heading || "Checklist", block.req)}${checksBlock({ ...block, name: block.heading, _gid: slug(block.heading) }, false)}</section>`;
      case "signature": return `<section class="section big">${sectionBar(String(++counter.n).padStart(2, "0"), block.heading || "Authorization", block.req)}${signBlock(block.fields || [], false)}</section>`;
      case "ack": return `<section class="section big">${sectionBar(String(++counter.n).padStart(2, "0"), block.heading || "Acknowledgment", block.req || "REQUIRED")}${block.intro ? `<p class="prose">${esc(block.intro)}</p>` : ""}${docFields(block)}${block.sign ? `<div class="block-gap">${signBlock(block.sign, false)}</div>` : ""}</section>`;
      case "pagebreak": return `<div class="page-break" aria-hidden="true"></div>`;
      default: return "";
    }
  }

  function tocSheet(doc) {
    const entries = [];
    let number = 0;
    (doc.blocks || []).forEach(block => {
      if ((block.type === "prose" && block.heading) || ["fields", "checks", "signature", "ack"].includes(block.type)) {
        const label = block.type === "prose" && block.number === false ? "—" : String(++number).padStart(2, "0");
        entries.push([label, block.heading || "Acknowledgment"]);
      }
    });
    return `<div class="${sheetClass(doc, "toc-sheet")}" style="${appearance(doc)}" data-paginate="true">${topBar(doc)}<h2 class="form-title page-title">Contents</h2><div class="toc page-flow">` +
      entries.map(([no, title]) => `<div class="formrow static"><span class="no">${no}</span><span class="nm">${esc(title)}</span></div>`).join("") + `</div></div>`;
  }

  function renderDoc(doc) {
    const counter = { n: 0 };
    const bodyContent = (doc.blocks || []).map(block => docBlock(block, counter)).join("");
    const hasCover = !(doc.layout && doc.layout.cover === false);
    let output = "";
    if (hasCover) {
      output += `<div class="${sheetClass(doc, "cover")}" style="${appearance(doc)}">${topBar(doc)}<div class="cover-mid">
        <div class="form-tag">${esc(doc.tag || `${doc.documentType || "Document"} · ${doc.no || ""}`)}</div>
        <h1 class="cover-title">${esc(doc.title)}</h1><div class="cover-bar"></div>
        ${doc.subtitle ? `<div class="cover-sub">${esc(doc.subtitle)}</div>` : ""}
        ${doc.standard ? `<p class="cover-standard">${esc(doc.standard)}</p>` : ""}</div>
        ${ctrlGrid(doc, "Document No.")}${doc.authority ? `<div class="cover-auth">${esc(doc.authority)}</div>` : ""}</div>`;
      if (doc.toc) output += tocSheet(doc);
      output += `<div class="${sheetClass(doc, "doc-body-sheet")}" style="${appearance(doc)}" data-paginate="true">${topBar(doc)}<div class="doc-body page-flow">${bodyContent}</div></div>`;
    } else {
      output += `<div class="${sheetClass(doc, "doc-body-sheet")}" style="${appearance(doc)}" data-paginate="true">${topBar(doc)}
        <div class="form-tag">${esc(doc.tag || doc.documentType || "Document")}</div><h1 class="form-title">${esc(doc.title)}</h1>
        ${doc.subtitle ? `<p class="form-sub">${esc(doc.subtitle)}</p>` : ""}${ctrlGrid(doc, "Document No.")}<div class="doc-body page-flow">${bodyContent}</div></div>`;
    }
    return output;
  }

  function renderPackage(pkg, options) {
    options = options || {};
    const documents = (pkg.documents || []).map(item => item.def || item).filter(item => item && item.kind !== "package");
    const rendered = documents.map((item, index) => render(item, { fill: Boolean(options.fill), namePrefix: `package_${index}_` }));
    let page = 3;
    const entries = rendered.map((html, index) => {
      const pages = Math.max(1, (html.match(/class="sheet/g) || []).length);
      const start = page;
      const end = page + pages - 1;
      page = end + 1;
      return { no: documents[index].no || String(index + 1).padStart(2, "0"), title: documents[index].title || "Untitled", range: start === end ? String(start) : `${start}-${end}` };
    });
    const cover = `<div class="${sheetClass(pkg, "cover package-cover")}" style="${appearance(pkg)}">${topBar(pkg)}<div class="cover-mid"><div class="form-tag">${esc(pkg.tag || "Document Package")}</div><h1 class="cover-title">${esc(pkg.title)}</h1><div class="cover-bar"></div>${pkg.subtitle ? `<div class="cover-sub">${esc(pkg.subtitle)}</div>` : ""}<p class="cover-standard">${documents.length} controlled document${documents.length === 1 ? "" : "s"} · Index generated ${today()}</p></div>${ctrlGrid(pkg, "Package No.")}</div>`;
    const index = `<div class="${sheetClass(pkg, "package-index")}" style="${appearance(pkg)}" data-paginate="true">${topBar(pkg)}<h2 class="form-title page-title">Package Index</h2><div class="package-index-list page-flow">${entries.map((entry, i) => `<div class="package-index-row" data-package-index="${i}"><span class="seq">${String(i + 1).padStart(2, "0")}</span><span><strong>${esc(entry.title)}</strong><small>${esc(entry.no)}</small></span><span class="leader"></span><span class="pages">${entry.range}</span></div>`).join("")}</div></div>`;
    return cover + index + rendered.map((html, index) => `<div class="package-document" data-package-item="${index + 1}">${html}</div>`).join("");
  }

  function updatePackageIndex(container) {
    if (!container || !container.querySelectorAll) return;
    const documents = [...container.querySelectorAll(".package-document")];
    if (!documents.length) return;
    const allSheets = [...container.querySelectorAll(".sheet")];
    const firstDocumentSheet = documents[0] && documents[0].querySelector(".sheet");
    let page = Math.max(1, allSheets.indexOf(firstDocumentSheet) + 1);
    documents.forEach((documentElement, index) => {
      const pages = Math.max(1, documentElement.querySelectorAll(".sheet").length);
      const start = page, end = page + pages - 1;
      const target = container.querySelector(`.package-index-row[data-package-index="${index}"] .pages`);
      if (target) target.textContent = start === end ? String(start) : `${start}-${end}`;
      page = end + 1;
    });
  }

  function paginate(container) {
    if (!container || !container.querySelectorAll) return;
    [...container.querySelectorAll('.sheet[data-paginate="true"]')].forEach(source => {
      if (source.dataset.paginationReady === "true") return;
      const flow = source.querySelector(":scope > .page-flow");
      if (!flow) return;
      const items = [...flow.children];
      flow.replaceChildren();
      let page = source;
      let pageFlow = flow;
      let lastPage = source;
      const pageHeight = source.classList.contains("landscape") ? 816 : 1056;
      const continuation = () => {
        const next = source.cloneNode(false);
        next.removeAttribute("id");
        next.removeAttribute("data-paginate");
        next.dataset.autoPage = "true";
        const header = source.querySelector(":scope > .page-header");
        if (header) next.appendChild(header.cloneNode(true));
        const nextFlow = flow.cloneNode(false);
        nextFlow.replaceChildren();
        next.appendChild(nextFlow);
        lastPage.after(next);
        lastPage = next;
        page = next;
        pageFlow = nextFlow;
      };
      items.forEach(item => {
        if (item.classList.contains("page-break")) {
          if (pageFlow.children.length) continuation();
          return;
        }
        pageFlow.appendChild(item);
        if (page.scrollHeight > pageHeight + 1 && pageFlow.children.length > 1) {
          pageFlow.removeChild(item);
          continuation();
          pageFlow.appendChild(item);
        }
        if (page.scrollHeight > pageHeight + 1 && pageFlow.children.length === 1) page.classList.add("oversize");
      });
      source.dataset.paginationReady = "true";
    });
  }

  function render(definition, options) {
    const def = clone(definition || blankForm());
    if (def.kind === "package") return renderPackage(def, options || {});
    if (def.kind === "document") return renderDoc(def);
    return renderForm(def, options || {});
  }

  function controls(prefix) {
    return {
      Revision: "1.0", Effective: today(), Classification: "Internal", "Doc. Control": `BASE-${prefix}`
    };
  }

  function blankForm() {
    return { kind: "form", documentType: "Controlled Form", typeLabel: "Form", no: "NEW-1", title: "Untitled Form", sub: "", org: ORG_DEFAULT,
      control: controls("NEW-1"), controlVisibility: {}, showControl: true, appearance: {},
      sections: [{ name: "Section One", req: "REQUIRED", fields: [{ label: "Field label", w: 1, height: 46 }] }], footnotes: [] };
  }

  function blankDoc() {
    return { kind: "document", documentType: "Document", no: "DOC-1", tag: "Document · DOC-1", title: "Untitled Document", subtitle: "", standard: "", org: ORG_DEFAULT,
      control: controls("DOC-1"), controlVisibility: {}, showControl: true, appearance: {}, authority: "", toc: true, layout: { cover: true },
      blocks: [{ type: "prose", heading: "First Section", paras: ["Write the first paragraph here."] }] };
  }

  function blankPackage() {
    return { kind: "package", documentType: "Package", no: "PKG-1", tag: "Controlled Package", title: "Untitled Package", subtitle: "", org: ORG_DEFAULT,
      control: controls("PKG-1"), controlVisibility: {}, showControl: true, appearance: {}, documents: [] };
  }

  function docTemplate(type, title, no, options) {
    const doc = blankDoc();
    Object.assign(doc, { documentType: type, title, no, tag: `${type} · ${no}` }, options || {});
    doc.control["Doc. Control"] = `BASE-${no}`;
    return doc;
  }

  const templateCatalog = [
    ["controlled-form", "Controlled Form"], ["authorization", "Request / Authorization"], ["checklist", "Checklist / Inspection"],
    ["log", "Log / Register"], ["memo", "Memorandum"], ["letter", "Business Letter"], ["cover-sheet", "Cover / Transmittal Sheet"],
    ["policy", "Policy"], ["procedure", "Procedure / SOP"], ["safety-manual", "Safety Manual"], ["scope", "Scope of Work"],
    ["proposal", "Proposal Package"], ["safety-package", "Safety Manual Package"], ["qualifications", "Qualification Statement"], ["project-sheet", "Project / Case Study"],
    ["faq", "FAQ / Reference Binder"], ["acknowledgment", "Acknowledgment / Waiver"], ["package", "Multi-Document Package"]
  ].map(([id, label]) => ({ id, label }));

  function fromTemplate(id) {
    if (id === "controlled-form") return blankForm();
    if (id === "authorization") {
      const form = blankForm(); Object.assign(form, { documentType: "Authorization", no: "AUTH-1", title: "Request Authorization" });
      form.control["Doc. Control"] = "BASE-AUTH-1";
      form.sections = [
        { name: "Requestor Information", req: "REQUIRED", fields: [{ label: "Name", w: 2 }, { label: "Date", w: 1 }, { label: "Project / Department", w: 2 }] },
        { name: "Request", req: "REQUIRED", fields: [{ label: "Description", w: 1, height: 92, multiline: true }] },
        { name: "Approval", req: "REQUIRED", sign: [{ label: "Authorized By", w: 2 }, { label: "Date", w: 1 }] }
      ]; return form;
    }
    if (id === "checklist") {
      const form = blankForm(); Object.assign(form, { documentType: "Checklist", no: "CHK-1", title: "Inspection Checklist" });
      form.sections = [{ name: "Inspection Details", fields: [{ label: "Project", w: 2 }, { label: "Date", w: 1 }, { label: "Inspector", w: 1.5 }] }, { name: "Checklist", req: "CHECK ALL", checks: ["Item one", "Item two", "Item three"], cols: 1 }, { name: "Certification", sign: [{ label: "Inspector Signature", w: 2 }, { label: "Date", w: 1 }] }]; return form;
    }
    if (id === "package" || id === "proposal" || id === "safety-package") {
      const pkg = blankPackage();
      if (id === "proposal") {
        Object.assign(pkg, { documentType: "Proposal Package", no: "PROP-1", tag: "Proposal", title: "Project Proposal", subtitle: "Prepared for [Client]" });
        const coverLetter = fromTemplate("letter"); Object.assign(coverLetter, { no: "PROP-1A", title: "Letter of Interest", tag: "Proposal Cover Letter" });
        const qualifications = fromTemplate("qualifications"); Object.assign(qualifications, { no: "PROP-1B", title: "Company Qualifications" });
        const approach = docTemplate("Project Approach", "Project Delivery Approach", "PROP-1C", { blocks: [{ type: "prose", heading: "Methodology", paras: ["Describe the team’s project-specific methodology, communication plan, and decision process."] }, { type: "prose", heading: "Project Management", paras: ["Describe staffing, scheduling, cost control, quality, safety, and closeout."] }, { type: "checklist", heading: "Commitments", items: ["Principal involvement", "Responsive decision-making", "Quality control", "Safety planning"] }] });
        const experience = fromTemplate("project-sheet"); Object.assign(experience, { no: "PROP-1D", title: "Recent Relevant Experience" });
        const capabilities = docTemplate("Corporate Information", "References and Financial Capability", "PROP-1E", { blocks: [{ type: "table", columns: ["Reference", "Organization", "Contact"], rows: [["", "", ""], ["", "", ""]] }, { type: "keyvalue", items: [["Insurance", "Provider and limits"], ["Bonding", "Provider and capacity"], ["Banking", "Institution and contact"], ["Safety", "Record and program summary"]] }] });
        pkg.documents = [coverLetter, qualifications, approach, experience, capabilities].map(document => ({ def: document }));
      }
      if (id === "safety-package") {
        Object.assign(pkg, { documentType: "Safety Manual Package", no: "SAF-PKG-1", tag: "Safety Package", title: "Project Safety Manual Package", subtitle: "Policies, procedures, forms, and acknowledgments" });
        const manual = fromTemplate("safety-manual");
        const checklist = fromTemplate("checklist"); Object.assign(checklist, { no: "SAF-CHK-1", title: "Project Safety Inspection" });
        const acknowledgment = fromTemplate("acknowledgment"); Object.assign(acknowledgment, { no: "SAF-ACK-1", title: "Safety Manual Acknowledgment" });
        pkg.documents = [manual, checklist, acknowledgment].map(document => ({ def: document }));
      }
      return pkg;
    }
    if (id === "log") return docTemplate("Log / Register", "Controlled Log", "LOG-1", { toc: false, layout: { cover: false }, blocks: [{ type: "table", columns: ["Date", "Item", "Owner", "Status", "Notes"], rows: [["", "", "", "", ""], ["", "", "", "", ""]] }] });
    if (id === "memo") return docTemplate("Memorandum", "Memorandum", "MEM-1", { toc: false, layout: { cover: false }, blocks: [{ type: "keyvalue", items: [["To", ""], ["From", ""], ["Date", today()], ["Subject", ""]] }, { type: "prose", heading: "Purpose", number: false, paras: ["State the purpose of this memorandum."] }, { type: "signatory", name: "Name", role: "Title" }] });
    if (id === "letter") return docTemplate("Business Letter", "Project Correspondence", "LTR-1", { toc: false, layout: { cover: false }, blocks: [{ type: "keyvalue", items: [["To", ""], ["Company", ""], ["Date", today()], ["Re", ""]] }, { type: "prose", heading: "", number: false, paras: ["Dear Recipient,", "Write the letter here.", "Sincerely,"] }, { type: "signatory", name: "Name", role: "Title" }] });
    if (id === "cover-sheet") return docTemplate("Cover Sheet", "Document Package", "COV-1", { toc: false, blocks: [{ type: "fields", heading: "Package Information", fields: [{ label: "Prepared For", w: 2 }, { label: "Prepared By", w: 2 }, { label: "Date", w: 1 }] }, { type: "note", title: "Contents", text: "Describe the enclosed documents." }] });
    if (id === "policy") return docTemplate("Policy", "Policy Title", "POL-1", { blocks: [{ type: "prose", heading: "Purpose", paras: ["Define why this policy exists."] }, { type: "prose", heading: "Policy", paras: ["State the governing requirements."] }, { type: "prose", heading: "Responsibilities", paras: ["Identify responsible roles."] }, { type: "ack", heading: "Acknowledgment", intro: "I acknowledge receipt and understanding of this policy.", fields: [{ label: "Name", w: 2 }, { label: "Date", w: 1 }], sign: [{ label: "Signature", w: 2 }] }] });
    if (id === "procedure") return docTemplate("Procedure / SOP", "Standard Operating Procedure", "SOP-1", { blocks: [{ type: "prose", heading: "Purpose and Scope", paras: ["Define the procedure objective and boundaries."] }, { type: "list", heading: "Procedure", ordered: true, items: ["Complete step one.", "Complete step two.", "Document completion."] }, { type: "checklist", heading: "Completion Check", items: ["Required records attached", "Approvals complete"] }] });
    if (id === "safety-manual") return docTemplate("Safety Manual", "Project Safety Manual", "SAF-1", { subtitle: "Policies, procedures, and project controls", blocks: [{ type: "prose", heading: "Safety Commitment", paras: ["State the organization’s safety commitment."] }, { type: "prose", heading: "Roles and Responsibilities", paras: ["Define management, supervisor, and worker responsibilities."] }, { type: "checklist", heading: "Core Requirements", items: ["Daily pre-task planning", "PPE compliance", "Incident reporting", "Emergency readiness"] }, { type: "ack", heading: "Employee Acknowledgment", intro: "I have read and understand this safety manual.", fields: [{ label: "Employee Name", w: 2 }, { label: "Date", w: 1 }], sign: [{ label: "Signature", w: 2 }] }] });
    if (id === "scope") return docTemplate("Scope of Work", "Standard Scope of Work", "SOW-1", { subtitle: "Trade / Project", blocks: [{ type: "prose", heading: "Scope Overview", paras: ["Describe the complete work package."] }, { type: "list", heading: "Included Work", items: ["Labor, materials, equipment, supervision, and coordination.", "Permits, inspections, testing, and closeout."] }, { type: "list", heading: "Exclusions", items: ["Work not specifically listed or shown in the contract documents."] }, { type: "prose", heading: "Job-Specific Requirements", paras: ["Add project-specific requirements, alternates, and clarifications."] }] });
    if (id === "qualifications") return docTemplate("Qualification Statement", "Company Qualifications", "QUAL-1", { blocks: [{ type: "prose", heading: "About Us", paras: ["Provide the company overview and value proposition."] }, { type: "prose", heading: "Management Team", paras: ["Describe leadership and key personnel."] }, { type: "prose", heading: "Company Approach", paras: ["Describe methodology, project management, safety, and quality."] }, { type: "table", columns: ["Reference", "Organization", "Contact"], rows: [["", "", ""]] }] });
    if (id === "project-sheet") return docTemplate("Project Sheet", "Relevant Project Experience", "EXP-1", { toc: false, layout: { cover: false }, blocks: [{ type: "fields", heading: "Project Summary", fields: [{ label: "Project", w: 2 }, { label: "Client", w: 2 }, { label: "Location", w: 2 }, { label: "Size", w: 1 }, { label: "Value", w: 1 }, { label: "Completion", w: 1 }] }, { type: "prose", heading: "Scope and Outcome", paras: ["Summarize the project scope, challenges, and results."] }] });
    if (id === "faq") return docTemplate("FAQ / Reference", "Frequently Asked Questions", "FAQ-1", { blocks: [{ type: "prose", heading: "How should this document be used?", number: false, paras: ["Provide the answer here."] }, { type: "prose", heading: "Who should I contact?", number: false, paras: ["Provide the answer here."] }] });
    if (id === "acknowledgment") return docTemplate("Acknowledgment / Waiver", "Acknowledgment and Certification", "ACK-1", { toc: false, layout: { cover: false }, blocks: [{ type: "ack", heading: "Acknowledgment", intro: "I acknowledge that I have reviewed and understand the information above.", fields: [{ label: "Printed Name", w: 2 }, { label: "Date", w: 1 }], sign: [{ label: "Signature", w: 2 }, { label: "Witness", w: 1 }] }] });
    return blankDoc();
  }

  root.BASE = { render, renderForm, renderDoc, renderPackage, paginate, updatePackageIndex, prepareForm, slug, esc, clone, blankForm, blankDoc, blankPackage, templateCatalog, fromTemplate, controlKeys: CONTROL_KEYS };
})(window);
