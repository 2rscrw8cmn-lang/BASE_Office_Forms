/* Fillable PDF export for BASE forms (kind:"form" only). Redraws the same
   layout engine.js renders to HTML/CSS, but as vector PDF content via
   pdf-lib, with real AcroForm widgets over every write-in field/check/sign
   box. Deliberately does not cover kind:"document"/"package" content blocks
   (tables, budgets, prose, etc.) -- those rarely carry write-in fields and
   are out of scope for v1; "Export PDF" falls back to print for them. */
(function (root) {
  "use strict";

  const PX = 0.75; // 1 CSS px (96/in) -> PDF points (72/in)
  const IN = 72;
  const ORG_LINES = ["BASE Construction LLC", "1601 Minnesota Ave, Winter Park, FL 32789"];
  const CONTROL_KEYS = ["Revision", "Effective", "Classification", "Doc. Control"];
  const INK = "#232327", MONO = "#6f6f74", FIELD_BORDER = "#bdbdc2", DIVIDER = "#cdced2";

  let pdfLibPromise = null;
  function loadPdfLib() {
    if (root.PDFLib) return Promise.resolve(root.PDFLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/pdf-lib.min.js";
      script.onload = () => resolve(root.PDFLib);
      script.onerror = () => reject(new Error("Could not load the PDF engine (vendor/pdf-lib.min.js)."));
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  function hex(value) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(value || "").trim());
    const clean = m ? m[1] : "232327";
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
    };
  }

  // pdf-lib's standard fonts support the WinAnsi repertoire, which includes
  // plenty of characters above U+00FF (em dash, curly quotes, daggers...).
  // Rather than guess that set, ask the font itself and cache the answer
  // per character -- only truly unencodable characters (CJK, emoji, ...)
  // get replaced, so common typographic punctuation survives untouched.
  const encodableCache = new WeakMap();
  function isEncodable(font, ch) {
    let cache = encodableCache.get(font);
    if (!cache) { cache = new Map(); encodableCache.set(font, cache); }
    if (cache.has(ch)) return cache.get(ch);
    let ok = true;
    try { font.widthOfTextAtSize(ch, 10); } catch (_) { ok = false; }
    cache.set(ch, ok);
    return ok;
  }
  function safeText(value, font) {
    const str = String(value == null ? "" : value);
    if (!font) return str.replace(/[^\x00-\xFF]/g, "?");
    return [...str].map(ch => (isEncodable(font, ch) ? ch : "?")).join("");
  }

  async function rasterizeLogo(url, targetHeightPx) {
    const res = await fetch(url);
    const svgText = await res.text();
    const svgUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not rasterize the BASE logo."));
        image.src = svgUrl;
      });
      const aspect = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 690.71 / 272.92;
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(targetHeightPx * aspect * scale);
      canvas.height = Math.round(targetHeightPx * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      return { bytes: new Uint8Array(await blob.arrayBuffer()), aspect };
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function makeDrawer(PDFLib, pdfDoc, fonts) {
    let page, cursor, pageW, pageH, marginX, marginY, bottomMarginPt, bottomLimit, fieldSeq = 0;

    function trackedWidth(text, font, size, tracking) {
      return font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * (tracking || 0);
    }

    function drawText(text, x, yFromTop, opts) {
      opts = opts || {};
      const font = opts.font || fonts.sans;
      const size = opts.size || 9;
      const color = hex(opts.color || INK);
      const tracking = opts.tracking || 0;
      const str = safeText(text, font);
      let cx = x;
      const y = pageH - yFromTop - size * 0.82;
      if (opts.align === "right" || opts.align === "center") {
        const width = trackedWidth(str, font, size, tracking);
        cx = opts.align === "right" ? x - width : x - width / 2;
      }
      if (!tracking) {
        page.drawText(str, { x: cx, y, size, font, color: PDFLib.rgb(color.r, color.g, color.b) });
        return;
      }
      [...str].forEach(ch => {
        page.drawText(ch, { x: cx, y, size, font, color: PDFLib.rgb(color.r, color.g, color.b) });
        cx += font.widthOfTextAtSize(ch, size) + tracking;
      });
    }

    // Greedy word-wrap for prose blocks; returns drawn line count.
    function drawWrapped(text, x, yFromTop, maxWidth, opts) {
      opts = opts || {};
      const font = opts.font || fonts.sans;
      const size = opts.size || 10;
      const lineHeight = opts.lineHeight || size * 1.35;
      const paragraphs = safeText(text, font).split(/\r\n?|\n/);
      let line = 0;
      paragraphs.forEach(paragraph => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let current = "";
        words.forEach(word => {
          const trial = current ? `${current} ${word}` : word;
          if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
            drawText(current, x, yFromTop + line * lineHeight, { font, size, color: opts.color });
            line++;
            current = word;
          } else {
            current = trial;
          }
        });
        if (current || !words.length) {
          drawText(current, x, yFromTop + line * lineHeight, { font, size, color: opts.color });
          line++;
        }
      });
      return line * lineHeight;
    }

    function rect(x, yFromTop, w, h, opts) {
      opts = opts || {};
      const y = pageH - yFromTop - h;
      const params = { x, y, width: w, height: h };
      if (opts.fill) { const c = hex(opts.fill); params.color = PDFLib.rgb(c.r, c.g, c.b); }
      if (opts.border) {
        const bc = hex(opts.border);
        params.borderColor = PDFLib.rgb(bc.r, bc.g, bc.b);
        params.borderWidth = opts.borderWidth || 1;
      }
      page.drawRectangle(params);
    }

    function hline(x, yFromTop, w, thickness, color) {
      const c = hex(color);
      page.drawRectangle({ x, y: pageH - yFromTop - thickness, width: w, height: thickness, color: PDFLib.rgb(c.r, c.g, c.b) });
    }

    function newPage(landscape) {
      pageW = landscape ? 11 * IN : 8.5 * IN;
      pageH = landscape ? 8.5 * IN : 11 * IN;
      page = pdfDoc.addPage([pageW, pageH]);
      cursor = marginY;
      bottomLimit = pageH - Math.max(marginY, bottomMarginPt);
    }

    function ensureRoom(height, form) {
      if (cursor + height > bottomLimit) {
        newPage(page.getWidth() > page.getHeight());
        drawHeader(form);
      }
    }

    function drawHeader(form) {
      if (form.showHeader === false) return;
      const logoHeightPt = 50 * PX;
      const logoWidthPt = logoHeightPt * (fonts.logoAspect || 2.53);
      if (fonts.logoBytes) {
        page.drawImage(fonts.logoImage, { x: marginX, y: pageH - cursor - logoHeightPt, width: logoWidthPt, height: logoHeightPt });
      }
      const orgSize = 8.5 * PX;
      const orgLineHeight = orgSize * 1.5;
      ORG_LINES.forEach((line, i) => {
        drawText(line.toUpperCase(), pageW - marginX, cursor + i * orgLineHeight, { font: fonts.mono, size: orgSize, color: MONO, align: "right", tracking: 0.35 });
      });
      const headerH = Math.max(logoHeightPt, ORG_LINES.length * orgLineHeight);
      cursor += headerH + 11 * PX;
      hline(marginX, cursor, pageW - 2 * marginX, 3 * PX, INK);
      cursor += 3 * PX + 3 * PX;
      hline(marginX, cursor, pageW - 2 * marginX, 1 * PX, INK);
      cursor += 1 * PX;
    }

    function drawTag(form) {
      if (form.showTag === false) return;
      cursor += 15 * PX;
      const label = `${form.typeLabel || "Form"} ${form.no || ""}`.trim().toUpperCase();
      drawText(label, marginX, cursor, { font: fonts.monoBold, size: 10 * PX, color: form.appearance && form.appearance.accent || "#7a1e22", tracking: 1.5 });
      cursor += 10 * PX * 1.1;
    }

    function drawTitle(form) {
      cursor += 7 * PX;
      const size = 23 * PX;
      drawText(String(form.title || "").toUpperCase(), marginX, cursor, { font: fonts.sansBold, size, color: INK });
      cursor += size * 1.1;
      if (form.sub) {
        cursor += 6 * PX;
        const h = drawWrapped(form.sub, marginX, cursor, pageW - 2 * marginX, { font: fonts.mono, size: 10 * PX, color: MONO, lineHeight: 10 * PX * 1.4 });
        cursor += h;
      }
    }

    function drawControl(form) {
      if (form.showControl === false) return;
      const visibility = form.controlVisibility || {};
      const cells = [];
      if (visibility.no !== false && form.no) cells.push(["Form No.", form.no]);
      CONTROL_KEYS.forEach(key => {
        if (visibility[key] !== false && form.control && form.control[key] !== undefined && form.control[key] !== "") {
          cells.push([key, form.control[key]]);
        }
      });
      if (!cells.length) return;
      cursor += 14 * PX;
      const boxH = 30 * PX;
      const w = (pageW - 2 * marginX) / cells.length;
      rect(marginX, cursor, pageW - 2 * marginX, boxH, { border: INK, borderWidth: 1 });
      cells.forEach((cell, i) => {
        const cx = marginX + i * w;
        if (i > 0) hline_v(cx, cursor, boxH, DIVIDER);
        drawText(cell[0].toUpperCase(), cx + 8 * PX, cursor + 5 * PX, { font: fonts.mono, size: 7 * PX, color: MONO, tracking: 0.3 });
        drawText(String(cell[1]), cx + 8 * PX, cursor + 5 * PX + 7 * PX + 3 * PX, { font: fonts.sansBold, size: 11 * PX, color: INK });
      });
      cursor += boxH;
    }

    function hline_v(x, yFromTop, h, color) {
      const c = hex(color);
      page.drawRectangle({ x, y: pageH - yFromTop - h, width: 1, height: h, color: PDFLib.rgb(c.r, c.g, c.b) });
    }

    function sectionBarHeight() { return 26 * PX; }

    function drawSectionBar(no, name, req) {
      const h = sectionBarHeight();
      const accent = fonts.accent;
      rect(marginX, cursor, 30 * PX, h, { fill: accent });
      drawText(no, marginX + 9 * PX, cursor + h / 2 - 6 * PX, { font: fonts.monoBold, size: 11 * PX, color: "#ffffff", tracking: 0.5 });
      drawText(String(name || "").toUpperCase(), marginX + 30 * PX + 11 * PX, cursor + h / 2 - 6 * PX, { font: fonts.sansBold, size: 12 * PX, color: INK, tracking: 0.8 });
      if (req) drawText(String(req).toUpperCase(), pageW - marginX, cursor + h - 8 * PX, { font: fonts.mono, size: 8 * PX, color: MONO, align: "right", tracking: 0.3 });
      hline(marginX, cursor + h, pageW - 2 * marginX, 1.5 * PX, INK);
      cursor += h + 1.5 * PX + 10 * PX;
    }

    return {
      get page() { return page; }, get cursor() { return cursor; }, set cursor(v) { cursor = v; },
      get pageW() { return pageW; }, get pageH() { return pageH; },
      get marginX() { return marginX; }, get marginY() { return marginY; },
      setMargins(x, y, bottom) { marginX = x; marginY = y; bottomMarginPt = bottom; },
      drawText, drawWrapped, rect, hline, hline_v, newPage, ensureRoom, drawHeader, drawTag, drawTitle, drawControl,
      drawSectionBar, sectionBarHeight,
      nextFieldSeq: () => ++fieldSeq,
    };
  }

  function rowsFromBreak(fields) {
    const rows = [];
    fields.forEach(field => { if (field.break || !rows.length) rows.push([]); rows[rows.length - 1].push(field); });
    return rows;
  }

  function widgetRect(x, yFromTop, w, h, pageH) {
    return { x, y: pageH - yFromTop - h, width: w, height: h };
  }

  function makeFieldPlacer(PDFLib, pdfDoc, form) {
    const acroForm = pdfDoc.getForm();
    const used = new Set();
    function uniqueName(base) {
      let name = base, i = 1;
      while (used.has(name)) name = `${base}_${i++}`;
      used.add(name);
      return name;
    }
    return { acroForm, uniqueName };
  }

  function fieldFontSize(boxHeight) {
    return Math.min(10, Math.max(7, boxHeight * 0.28));
  }

  // In the HTML/CSS rendering, a field's write-in element gets an explicit
  // `height:${textHeight}px` (see writeBox/CSS `.field`, `.sign`) which can
  // grow the box well past its own nominal `height` -- CSS block/flex flow
  // just expands to fit. A vector-drawn box has no such auto-growth, so the
  // outer box height must be computed the same way everywhere it's used
  // (row-height aggregation AND the individual box/widget placement), or
  // the widget ends up taller than the box drawn around it.
  const LABEL_RESERVE_PX = 28;
  function fieldBoxHeightPx(field, tall) {
    const nominal = tall ? Math.max(76, field.height) : field.height;
    return field.textHeight ? Math.max(nominal, field.textHeight + LABEL_RESERVE_PX) : nominal;
  }
  function signBoxHeightPx(field) {
    const nominal = Math.max(54, field.height);
    return field.textHeight ? Math.max(nominal, field.textHeight + LABEL_RESERVE_PX) : nominal;
  }

  function placeTextField(ctx, placer, page, field, x, yFromTop, w, h, answer) {
    const isMultiline = field.type === "multiline" || Boolean(field.multiline);
    ctx.rect(x, yFromTop, w, h, { border: FIELD_BORDER, borderWidth: 1 });
    const labelSize = 7.5 * PX;
    ctx.drawText(String(field.label || "").toUpperCase(), x + 8, yFromTop + 5, { font: ctx.fonts ? ctx.fonts.mono : undefined, size: labelSize, color: MONO, tracking: 0.25 });
    const labelBand = labelSize + 8;
    let boxY = yFromTop + labelBand, boxH = h - labelBand - 4;
    if (field.textHeight) {
      const th = field.textHeight * PX;
      const align = field.align || "top";
      if (align === "bottom") boxY = yFromTop + h - th - 4;
      else if (align === "center") boxY = yFromTop + labelBand + Math.max(0, (boxH - th) / 2);
      boxH = th;
    }
    boxH = Math.max(10, boxH);
    const name = placer.uniqueName(field.id || `field_${ctx.nextFieldSeq()}`);
    const tf = placer.acroForm.createTextField(name);
    if (isMultiline) tf.enableMultiline();
    tf.addToPage(page, Object.assign({ borderWidth: 0 }, widgetRect(x + 3, boxY, w - 6, boxH, ctx.pageH)));
    tf.setFontSize(fieldFontSize(boxH));
    if (answer != null && answer !== "") tf.setText(String(answer));
  }

  function placeSignField(ctx, placer, page, field, x, yFromTop, w, h, answer) {
    ctx.rect(x, yFromTop, w, h, { border: FIELD_BORDER, borderWidth: 1 });
    const labelSize = 7.5 * PX;
    ctx.drawText(String(field.label || "").toUpperCase(), x + 8, yFromTop + 5, { size: labelSize, color: MONO, tracking: 0.25 });
    const th = field.textHeight ? field.textHeight * PX : 24;
    const align = field.align || "bottom";
    let boxY;
    if (align === "top") boxY = yFromTop + labelSize + 10;
    else if (align === "center") boxY = yFromTop + (h - th) / 2;
    else boxY = yFromTop + h - th - 6;
    const name = placer.uniqueName(field.id || `sign_${ctx.nextFieldSeq()}`);
    const tf = placer.acroForm.createTextField(name);
    tf.addToPage(page, Object.assign({ borderWidth: 0 }, widgetRect(x + 3, boxY, w - 6, th, ctx.pageH)));
    tf.setFontSize(fieldFontSize(th));
    if (answer != null && answer !== "") tf.setText(String(answer));
  }

  function drawFieldsRows(ctx, placer, form, fields, tall, answers) {
    const rows = rowsFromBreak(fields);
    rows.forEach((row, ri) => {
      const totalFr = row.reduce((sum, f) => sum + (Number(f.w) || 1), 0);
      const contentW = ctx.pageW - 2 * ctx.marginX;
      // CSS Grid stretches every cell in a row to the tallest cell's height
      // (align-items: stretch is the default) -- draw every box in the row
      // at rowH, not each field's own height, so bottoms line up.
      const rowH = Math.max(...row.map(f => fieldBoxHeightPx(f, tall))) * PX;
      ctx.ensureRoom(rowH + (ri > 0 ? 4.5 : 0), form);
      if (ri > 0) ctx.cursor += 4.5;
      let x = ctx.marginX;
      row.forEach(field => {
        const w = contentW * ((Number(field.w) || 1) / totalFr);
        placeTextField(ctx, placer, ctx.page, field, x, ctx.cursor, w, rowH, answers && answers[field.id]);
        x += w;
      });
      ctx.cursor += rowH;
    });
  }

  function drawSignRows(ctx, placer, form, fields, answers) {
    const rows = rowsFromBreak(fields);
    rows.forEach((row, ri) => {
      const totalFr = row.reduce((sum, f) => sum + (Number(f.w) || 1), 0);
      const contentW = ctx.pageW - 2 * ctx.marginX;
      const rowH = Math.max(...row.map(f => signBoxHeightPx(f))) * PX;
      ctx.ensureRoom(rowH + (ri > 0 ? 4.5 : 0), form);
      if (ri > 0) ctx.cursor += 4.5;
      let x = ctx.marginX;
      row.forEach(field => {
        const w = contentW * ((Number(field.w) || 1) / totalFr);
        placeSignField(ctx, placer, ctx.page, field, x, ctx.cursor, w, rowH, answers && answers[field.id]);
        x += w;
      });
      ctx.cursor += rowH;
    });
  }

  function drawChecks(ctx, placer, form, section, answers, headingForGid) {
    const options = (section.checks || []).map(o => String(o).replace(/[†‡]\s*$/, "").trim());
    const columns = Math.max(1, Number(section.cols) || 1);
    const rowH = 18 * PX;
    const totalH = Math.ceil(options.length / columns) * rowH + 22 * PX;
    ctx.ensureRoom(totalH, form);
    const boxTop = ctx.cursor;
    const contentW = ctx.pageW - 2 * ctx.marginX;
    ctx.rect(ctx.marginX, boxTop, contentW, totalH, { border: FIELD_BORDER, borderWidth: 1 });
    const colW = contentW / columns;
    // Prepared top-level check sections already carry a stable `_gid` from
    // BASE.prepareForm; typed blocks (approval/checks) inside a form are
    // never walked by prepareForm, so fall back to the same `id || slug`
    // scheme engine.js's docBlock uses for them at render time.
    const gid = section._gid || section.id || (root.BASE ? root.BASE.slug(headingForGid || section.name) : "choice");
    const answerList = answers && answers[gid];
    const selectedSet = new Set(Array.isArray(answerList) ? answerList : answerList != null ? [answerList] : []);
    // A single-select section shares ONE radio group across all its options
    // (mutually exclusive); choose_any gets one independent checkbox each.
    const radioGroup = section.single ? placer.acroForm.createRadioGroup(placer.uniqueName(gid)) : null;
    let selectedOption = null;
    options.forEach((text, i) => {
      const col = Math.floor(i / Math.ceil(options.length / columns));
      const row = i % Math.ceil(options.length / columns);
      const x = ctx.marginX + col * colW + 11 * PX;
      const y = boxTop + 11 * PX + row * rowH;
      const boxSize = 10 * PX;
      if (selectedSet.has(text)) selectedOption = text;
      if (radioGroup) {
        radioGroup.addOptionToPage(text, ctx.page, Object.assign({}, widgetRect(x, y, boxSize, boxSize, ctx.pageH)));
      } else {
        const name = placer.uniqueName(`${gid}__${(root.BASE ? root.BASE.slug(text) : text.toLowerCase())}`);
        const cb = placer.acroForm.createCheckBox(name);
        cb.addToPage(ctx.page, Object.assign({}, widgetRect(x, y, boxSize, boxSize, ctx.pageH)));
        if (selectedSet.has(text)) cb.check();
      }
      ctx.drawText(text, x + boxSize + 6, y - 1, { size: 9 * PX * 1.3, color: INK });
    });
    if (radioGroup && selectedOption) radioGroup.select(selectedOption);
    ctx.cursor += totalH;
  }

  async function exportFormPdf(form, options) {
    options = options || {};
    const answers = options.answers || {};
    const PDFLib = await loadPdfLib();
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    if (root.BASE) root.BASE.prepareForm(form);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(form.title || form.no || "BASE Form");
    pdfDoc.setProducer("BASE Office Forms");

    const [sans, sansBold, mono, monoBold] = await Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
      pdfDoc.embedFont(StandardFonts.Courier),
      pdfDoc.embedFont(StandardFonts.CourierBold),
    ]);

    let logo = null;
    if (form.showHeader !== false) {
      try {
        const raster = await rasterizeLogo(form.logo && !form.logo.includes("assets/base-logo") ? form.logo : "assets/base-logo.svg", 50 * PX);
        logo = { bytes: raster.bytes, aspect: raster.aspect, image: await pdfDoc.embedPng(raster.bytes) };
      } catch (_) {
        logo = null; // Missing/blocked logo asset shouldn't fail the whole export.
      }
    }

    const appearance = form.appearance || {};
    const fonts = {
      sans, sansBold, mono, monoBold,
      accent: appearance.accent || "#7a1e22",
      logoBytes: logo && logo.bytes,
      logoImage: logo && logo.image,
      logoAspect: logo && logo.aspect,
    };

    const ctx = makeDrawer(PDFLib, pdfDoc, fonts);
    ctx.fonts = fonts;
    const landscape = appearance.orientation === "landscape";
    const marginXIn = Math.max(0.25, Number(appearance.marginX) || 0.7);
    const marginYIn = Math.max(0.25, Number(appearance.marginY) || 0.55);
    ctx.setMargins(marginXIn * IN, marginYIn * IN, 0.45 * IN);
    ctx.newPage(landscape);
    ctx.drawHeader(form);
    ctx.drawTag(form);
    ctx.drawTitle(form);
    ctx.drawControl(form);

    const placer = makeFieldPlacer(PDFLib, pdfDoc, form);
    let sectionNo = 0;
    // Types that carry write-in content and are meaningful inside a form
    // (mirrors engine.js's docBlock, which is what actually renders these --
    // a "form" section with a `type` is dispatched there, not through the
    // plain fields/checks/sign branch below). Purely-static block types
    // (prose, table, budget, etc.) stay out of v1 scope.
    const TYPE_DEFAULTS = {
      fields: { heading: "Information" },
      checks: { heading: "Checklist" },
      signature: { heading: "Authorization" },
      ack: { heading: "Acknowledgment", req: "REQUIRED" },
      attachments: { heading: "Attachments / References" },
      approval: { heading: "Review Decision", req: "REQUIRED" },
    };

    (form.sections || []).forEach(section => {
      if (section.row) return; // Side-by-side section groups: out of scope for v1 vector export.
      if (section.type === "pagebreak") { ctx.newPage(ctx.pageW > ctx.pageH); ctx.drawHeader(form); return; }
      if (section.type && !TYPE_DEFAULTS[section.type]) return; // Static content blocks: out of scope for v1.
      sectionNo++;
      const no = String(sectionNo).padStart(2, "0");
      const defaults = section.type ? TYPE_DEFAULTS[section.type] : null;
      const heading = defaults ? (section.heading || defaults.heading) : section.name;
      const req = defaults ? (section.req || defaults.req) : section.req;
      ctx.cursor += 16 * PX;
      ctx.ensureRoom(ctx.sectionBarHeight() + 30, form);
      ctx.drawSectionBar(no, heading, req);
      if (section.type === "ack" && section.intro) {
        const h = ctx.drawWrapped(section.intro, ctx.marginX, ctx.cursor, ctx.pageW - 2 * ctx.marginX, { size: 10 * PX, lineHeight: 10 * PX * 1.4 });
        ctx.cursor += h + 8 * PX;
      }
      if (section.fields && section.fields.length) drawFieldsRows(ctx, placer, form, section.fields, section.tall, answers);
      if (section.checks && section.checks.length) drawChecks(ctx, placer, form, section, answers, heading);
      if (section.sign && section.sign.length) drawSignRows(ctx, placer, form, section.sign, answers);
      if (!section.type && section.text) {
        const h = ctx.drawWrapped(section.text, ctx.marginX, ctx.cursor, ctx.pageW - 2 * ctx.marginX, { size: 10 * PX, lineHeight: 10 * PX * 1.4 });
        ctx.cursor += h;
      }
    });

    if ((form.footnotes || []).length) {
      ctx.ensureRoom(20, form);
      ctx.cursor += 14 * PX;
      ctx.hline(ctx.marginX, ctx.cursor, ctx.pageW - 2 * ctx.marginX, 1, FIELD_BORDER);
      ctx.cursor += 8 * PX;
      const h = ctx.drawWrapped(form.footnotes.join("\n"), ctx.marginX, ctx.cursor, ctx.pageW - 2 * ctx.marginX, { font: mono, size: 8 * PX, color: MONO, lineHeight: 8 * PX * 1.5 });
      ctx.cursor += h;
    }

    return pdfDoc.save();
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  async function downloadFormPdf(form, options) {
    const bytes = await exportFormPdf(form, options);
    downloadBytes(bytes, `${(form.no || form.title || "BASE-form").replace(/[^a-z0-9-]+/gi, "_")}.pdf`);
  }

  root.BASE_PDF = { exportFormPdf, downloadFormPdf, loadPdfLib };
})(window);
