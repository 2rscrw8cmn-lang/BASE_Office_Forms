/* ============================================================
   BASE render engine — one renderer for forms AND documents.
   Builder preview, describe-mode output, and printing all use this,
   so everything looks identical. Attaches to window.BASE.
   ============================================================ */
(function (root) {
  const ORG_DEFAULT = "Office Process & Compliance Division";

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const slug = s => String(s).toLowerCase().replace(/[†‡]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  /* ---------- shared header pieces ---------- */
  function ctrlGrid(no, control) {
    const cells = [["Form No.", no], ...Object.entries(control || {})];
    return `<div class="doc-control" style="--dc-cols:${cells.length}">` +
      cells.map(([l, v]) => `<div class="dc-cell"><div class="dc-label">${esc(l)}</div><div class="dc-val">${esc(v)}</div></div>`).join("") +
      `</div>`;
  }
  function topBar(org, right) {
    return `<div class="doc-top">
      <img class="doc-logo" src="assets/base-logo.jpg" alt="BASE">
      <div class="doc-org">${org || ORG_DEFAULT}<br>Controlled Document — Do Not Reproduce</div>
    </div><div class="rule"></div>` + (right || "");
  }
  function sectionBar(no, name, req) {
    return `<div class="sec-head"><div class="sec-no">${no}</div>` +
      `<div class="sec-name">${esc(name)}</div>` +
      (req ? `<div class="sec-req">${esc(req)}</div>` : "") + `</div>`;
  }

  /* ============================================================
     FORMS
     ============================================================ */
  function prepareForm(f) {
    if (f._ready) return f;
    const seen = {}, schema = [];
    const uid = b => { b = b || "field"; seen[b] = (seen[b] || 0) + 1; return seen[b] > 1 ? b + "_" + seen[b] : b; };
    const walk = s => {
      if (s.row) { s.row.forEach(walk); return; }
      if (s.fields) s.fields = s.fields.map(a => norm(a, uid, schema, "text"));
      if (s.sign) s.sign = s.sign.map(a => norm(a, uid, schema, "text"));
      if (s.checks) {
        s._gid = uid(slug(s.name || "choice"));
        s._opts = s.checks.map(c => String(c).replace(/[†‡]\s*$/, "").trim());
        schema.push({ id: s._gid, type: s.single ? "choose_one" : "choose_any", label: s.name, options: s._opts });
      }
    };
    (f.sections || []).forEach(walk);
    f._schema = schema; f._ready = true; return f;
  }
  function norm(a, uid, schema, type) {
    const [label, w, ex] = Array.isArray(a) ? a : [a.label, a.w, a.id];
    const id = uid(slug(ex || label)); schema.push({ id, type, label }); return { label, w: w || 1, id };
  }

  function fieldsBlock(fields, tall, fill) {
    const tpl = fields.map(x => x.w + "fr").join(" ");
    return `<div class="grid" style="--tpl:${tpl};">` + fields.map(x =>
      `<div class="field${tall ? " field-tall" : ""}"><div class="field-label">${esc(x.label)}</div>` +
      (fill ? (tall ? `<textarea class="ftx" name="${x.id}"></textarea>` : `<input class="fin" name="${x.id}">`) : "") +
      `</div>`).join("") + `</div>`;
  }
  function checksBlock(s, fill) {
    const cls = s.cols ? `check-box cols" style="--ccols:${s.cols}` : "check-box";
    const type = s.single ? "radio" : "checkbox";
    return `<div class="${cls}">` + s.checks.map(c => {
      const m = String(c).match(/([†‡])\s*$/); const txt = String(c).replace(/[†‡]\s*$/, "").trim();
      const dag = m ? `<sup class="dagger">${m[1]}</sup>` : "";
      const input = fill ? `<input type="${type}" name="${s._gid}" value="${esc(txt)}">` : "";
      return `<label class="check">${input}<span class="box"></span>${esc(txt)}${dag}</label>`;
    }).join("") + `</div>`;
  }
  function signBlock(sign, fill) {
    const tpl = sign.map(x => x.w + "fr").join(" ");
    return `<div class="sign-grid" style="--sign-tpl:${tpl};">` + sign.map(x =>
      `<div class="sign"><div class="field-label">${esc(x.label)}</div>` + (fill ? `<input class="fin" name="${x.id}">` : "") + `</div>`
    ).join("") + `</div>`;
  }
  function formBody(s, fill) {
    if (s.fields) return fieldsBlock(s.fields, s.tall, fill);
    if (s.checks) return checksBlock(s, fill);
    if (s.sign) return signBlock(s.sign, fill);
    return "";
  }
  function formSection(s, ctr, fill) {
    if (s.row) return `<div class="grid" style="--cols:2; --gap:14px;">` + s.row.map(x => formSection(x, ctr, fill)).join("") + `</div>`;
    const n = String(++ctr.n).padStart(2, "0");
    return `<section class="section">${sectionBar(n, s.name, s.req)}${formBody(s, fill)}</section>`;
  }
  function renderForm(f, opts) {
    opts = opts || {}; prepareForm(f); const ctr = { n: 0 };
    const foot = (f.footnotes || []).length ? `<div class="footnote">${f.footnotes.map(esc).join("<br>")}</div>` : "";
    const header = `<header>${topBar(esc(f.org))}
      <div class="form-tag">Form ${esc(f.no)}</div>
      <h1 class="form-title">${esc(f.title)}</h1>
      ${f.sub ? `<p class="form-sub">${esc(f.sub)}</p>` : ""}
      ${ctrlGrid(f.no, f.control)}</header>`;
    return `<div class="sheet" id="sheet-${esc(f.no)}">${header}${(f.sections || []).map(s => formSection(s, ctr, opts.fill)).join("")}${foot}</div>`;
  }

  /* ============================================================
     DOCUMENTS
     ============================================================ */
  function docBlock(b, ctr) {
    switch (b.type) {
      case "prose": {
        const num = b.number === false ? null : String(++ctr.n).padStart(2, "0");
        const head = b.heading ? (num
          ? `<div class="section big">${sectionBar(num, b.heading)}</div>`
          : `<div class="doc-eyebrow-wrap">${b.eyebrow ? `<div class="eyebrow">${esc(b.eyebrow)}</div>` : ""}<h2 class="doc-h2">${esc(b.heading)}</h2></div>`) : "";
        const paras = (b.paras || []).map(p => `<p class="prose">${esc(p)}</p>`).join("");
        return `<div class="avoid">${head}${paras}</div>`;
      }
      case "callout":
        return `<div class="pull avoid"><div class="pull-q">${esc(b.text)}</div>${b.attribution ? `<div class="pull-a">${esc(b.attribution)}</div>` : ""}</div>`;
      case "note":
        return `<div class="note avoid">${b.title ? `<div class="note-t">${esc(b.title)}</div>` : ""}<div class="note-b">${esc(b.text)}</div></div>`;
      case "signatory":
        return `<div class="signatory avoid"><div class="sig-name">${esc(b.name)}</div><div class="sig-role">${esc(b.role)}</div></div>`;
      case "table": {
        const head = `<tr>${(b.columns || []).map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
        const rows = (b.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
        return `<table class="dtable avoid"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
      }
      case "ack": {
        const num = String(++ctr.n).padStart(2, "0");
        const intro = b.intro ? `<p class="prose">${esc(b.intro)}</p>` : "";
        const seen = {}, uid = x => { seen[x] = (seen[x] || 0) + 1; return seen[x] > 1 ? x + "_" + seen[x] : x; };
        const fields = (b.fields || []).map(a => norm(a, uid, [], "text"));
        const sign = (b.sign || []).map(a => norm(a, uid, [], "text"));
        return `<section class="section big">${sectionBar(num, b.heading || "Acknowledgment", b.req || "REQUIRED")}${intro}${fields.length ? fieldsBlock(fields, false, false) : ""}${sign.length ? `<div style="margin-top:8px">${signBlock(sign, false)}</div>` : ""}</section>`;
      }
      default: return "";
    }
  }
  function buildToc(d) {
    const ctr = { n: 0 }; const items = [];
    (d.blocks || []).forEach(b => {
      if ((b.type === "prose" && b.heading) || b.type === "ack") {
        const numbered = b.type === "ack" || b.number !== false;
        const label = numbered ? String(++ctr.n).padStart(2, "0") : "—";
        items.push([label, b.heading || (b.type === "ack" ? "Acknowledgment" : "")]);
      }
    });
    const rows = items.map(([n, t]) =>
      `<div class="formrow" style="cursor:default"><span class="no">${n}</span><span class="nm">${esc(t)}</span></div>`).join("");
    return `<div class="sheet">${topBar(esc(d.org))}
      <h2 class="form-title" style="margin-top:22px">Contents</h2>
      <div class="toc">${rows}</div></div>`;
  }
  function renderDoc(d) {
    const cover = `<div class="sheet cover">${topBar(esc(d.org))}
      <div class="cover-mid">
        <div class="form-tag">${esc(d.tag || ("Document · " + (d.no || "")))}</div>
        <h1 class="cover-title">${esc(d.title)}</h1>
        <div class="cover-bar"></div>
        ${d.subtitle ? `<div class="cover-sub">${esc(d.subtitle)}</div>` : ""}
        ${d.standard ? `<p class="cover-standard">${esc(d.standard)}</p>` : ""}
      </div>
      ${ctrlGrid(d.no, d.control)}
      ${d.authority ? `<div class="cover-auth">${esc(d.authority)}</div>` : ""}</div>`;
    const toc = d.toc ? buildToc(d) : "";
    const ctr = { n: 0 };
    const body = `<div class="sheet">${topBar(esc(d.org), "")}
      <div style="margin-top:20px">${(d.blocks || []).map(b => docBlock(b, ctr)).join("")}</div></div>`;
    return cover + toc + body;
  }

  /* ---------- dispatch + form schema helpers (used by fill side) ---------- */
  function render(def, opts) {
    return (def && def.kind === "document") ? renderDoc(def) : renderForm(def, opts);
  }

  root.BASE = { render, renderForm, renderDoc, prepareForm, slug, esc, blankForm, blankDoc };

  /* ---------- starter templates for the builder ---------- */
  function blankForm() {
    return {
      kind: "form", no: "NEW-1", title: "Untitled Form", sub: "",
      org: ORG_DEFAULT,
      control: { Revision: "1.0", Effective: today(), Classification: "Internal", "Doc. Control": "BASE-XX-NEW-1" },
      sections: [{ name: "Section One", req: "REQUIRED", fields: [["Field label", 1]] }],
      footnotes: []
    };
  }
  function blankDoc() {
    return {
      kind: "document", no: "DOC-1", tag: "Document · DOC-1",
      title: "Untitled Document", subtitle: "", standard: "", org: ORG_DEFAULT,
      control: { Revision: "001", Effective: today(), Classification: "Internal", "Doc. Control": "BASE-XX-DOC-1" },
      authority: "Issued under authority of [Name], President",
      toc: true,
      blocks: [{ type: "prose", heading: "First Section", paras: ["Write the first paragraph here."] }]
    };
  }
  function today() { return new Date().toISOString().slice(0, 10); }
})(window);
