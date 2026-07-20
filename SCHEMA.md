# Definition format (for describe-mode)

Every form and document is one JSON object — a **definition**. The builder makes them,
and Claude / Claude Code can make them from a plain description. Any definition loads
into `public/builder.html` (Load) and renders through `public/engine.js`, so it always looks on-brand.

To generate one by describing it, paste this file plus a request like:
*"Make a definition for a subcontractor daily sign-in form: company, worker name, trade
(pick one: electrical/plumbing/HVAC/other), time in, time out, signature."*

---

## Form

```json
{
  "kind": "form",
  "no": "SI-1",
  "title": "Subcontractor Daily Sign-In",
  "sub": "One line per worker, per day.",
  "org": "Office Process & Compliance Division",
  "control": { "Revision": "1.0", "Effective": "2026-07-17", "Classification": "Internal", "Doc. Control": "BASE-FIELD-SI-1" },
  "sections": [
    { "name": "Worker", "req": "REQUIRED",
      "fields": [ ["Company", 2], ["Worker Name", 2], ["Time In", 1], ["Time Out", 1] ] },
    { "name": "Trade", "req": "SELECT ONE", "single": true, "cols": 2,
      "checks": ["Electrical", "Plumbing", "HVAC", "Other"] },
    { "name": "Authorization", "req": "REQUIRED",
      "sign": [ ["Worker Signature", 2], ["Super Initials", 1] ] }
  ],
  "footnotes": ["Retain with the daily report."]
}
```

Section types (one per section object):
- `fields`: either `[[label, width], …]` or objects such as
  `{ "label": "Description", "w": 2, "height": 92, "multiline": true }`.
  Width is relative; height is the write-in area in screen pixels.
- `checks`: `["Option", …]` — add `"single": true` for pick-one (radio), `"cols": N` for a grid.
  End a label with `†` or `‡` to tie it to a footnote.
- `sign`: `[[label, width], …]` — signature / authorization boxes.
- `row`: `[ {section}, {section} ]` — place two sections side by side.

Top-level `"titleFrom": ["field_id", …]` makes the big title heading live: while the form
is being filled (`public/form-generator.html`), it fills in from those write-in fields'
values, joined with " — ", and falls back to `title` when they're empty. Field ids come
from the field's `label`, lowercased and slugified (e.g. "Submittal Title" → `submittal_title`),
unless you set one explicitly.

---

## Document

```json
{
  "kind": "document",
  "no": "SM-1",
  "tag": "Safety Manual · SM-1",
  "title": "Construction Safety Manual",
  "subtitle": "BASE Construction, LLC",
  "standard": "Minimum safety standards for all company operations, written to meet or exceed OSHA 29 CFR 1926.",
  "org": "Health, Safety & Environmental Division",
  "control": { "Revision": "001", "Effective": "2026-07-17", "Classification": "Controlled", "Doc. Control": "BASE-SAF-SM-1" },
  "authority": "Issued under authority of Travis Bonnett, President",
  "toc": true,
  "blocks": [
    { "type": "prose", "eyebrow": "Front Matter", "heading": "Safety Policy Statement", "number": false,
      "paras": ["First paragraph.", "Second paragraph."] },
    { "type": "callout", "text": "No task is so urgent that it cannot be done safely." },
    { "type": "signatory", "name": "Travis Bonnett", "role": "President · BASE Construction, LLC" },
    { "type": "prose", "heading": "Purpose and Scope", "paras": ["This manual applies to all job sites…"] },
    { "type": "note", "title": "Reminder", "text": "Where this manual and law conflict, the stricter standard governs." },
    { "type": "table", "columns": ["Hazard", "Primary Control"], "rows": [["Falls","Guardrails / PFAS"], ["Silica","Wet-cutting"]] },
    { "type": "ack", "heading": "Employee Acknowledgment", "req": "REQUIRED",
      "intro": "I have received and understand this manual.",
      "fields": [["Employee Name", 2], ["Date", 1]], "sign": [["Signature", 2]] }
  ]
}
```

Block types (`type` field):
- `prose`: `heading`, `paras: [...]`, optional `eyebrow`, `"number": false` to skip the section number.
- `callout`: `text`, optional `attribution` — the big maroon pull-quote.
- `note`: `title`, `text` — a bordered reminder box.
- `signatory`: `name`, `role`.
- `table`: `columns: [...]`, `rows: [[...], ...]`.
- `list`: `heading`, `items: [...]`, optional `ordered: true`.
- `checklist`: `heading`, `items: [...]`.
- `keyvalue`: `items: [[label, value], ...]` for memo and cover-sheet metadata.
- `fields`: a form-style field block inside a document.
- `checks`: a form-style choice block inside a document.
- `signature`: a signature-field block.
- `ack`: acknowledgment block with `fields` and `sign` (same shape as a form).
- `pagebreak`: forces the following content onto a new printed page.

`toc: true` auto-builds the contents page from every numbered `prose` block and `ack`.

---

## Package

```json
{
  "kind": "package",
  "documentType": "Proposal Package",
  "no": "PROP-1",
  "title": "Project Proposal",
  "subtitle": "Prepared for Example Client",
  "control": { "Revision": "1.0", "Effective": "2026-07-17", "Classification": "Internal", "Doc. Control": "BASE-PROP-1" },
  "documents": [
    { "def": { "kind": "document", "no": "LTR-1", "title": "Cover Letter", "blocks": [] } },
    { "def": { "kind": "document", "no": "QUAL-1", "title": "Company Qualifications", "blocks": [] } }
  ]
}
```

The studio normally adds package documents from its saved browser library. The package
stores snapshots so downloaded JSON and shared links remain portable. Cover and index
entries are regenerated from the current `documents` array whenever the package renders.

---

## Shared controls and appearance

Forms, documents, and packages may use:

```json
{
  "showControl": true,
  "controlVisibility": {
    "no": true,
    "Revision": true,
    "Effective": true,
    "Classification": false,
    "Doc. Control": true
  },
  "showHeader": true,
  "appearance": {
    "accent": "#7a1e22",
    "ink": "#232327",
    "orientation": "portrait",
    "marginX": 0.7,
    "marginY": 0.55,
    "bodyScale": 1
  }
}
```

---

## Rules for a valid definition
- `kind` is `"form"`, `"document"`, or `"package"`.
- Widths, heights, margins, scale, and `cols` are numbers; visibility and layout toggles are booleans.
- Prefer the documented keys. If something does not fit a block type above, use `prose` or `note`.
- Keep `no` unique; it's the id used for the file name and links.
