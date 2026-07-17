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
- `fields`: `[[label, width], …]` — write-in boxes. Width is relative (2 is twice as wide as 1).
- `checks`: `["Option", …]` — add `"single": true` for pick-one (radio), `"cols": N` for a grid.
  End a label with `†` or `‡` to tie it to a footnote.
- `sign`: `[[label, width], …]` — signature / authorization boxes.
- `row`: `[ {section}, {section} ]` — place two sections side by side.

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
- `ack`: acknowledgment block with `fields` and `sign` (same shape as a form).

`toc: true` auto-builds the contents page from every numbered `prose` block and `ack`.

---

## Rules for a valid definition
- `kind` is `"form"` or `"document"`.
- Widths and `cols` are numbers; everything else is a string (or list of strings).
- Don't invent new keys — if something doesn't fit a block type above, use `prose` or a `note`.
- Keep `no` unique; it's the id used for the file name and links.
