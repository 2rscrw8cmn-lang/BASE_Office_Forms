# BASE Forms & Documents Kit

One controlled visual identity (`public/base.css`) + one renderer (`public/engine.js`).
Everything you make is a small **definition** (a JSON object). Create them two ways —
click through the builder, or describe them and let Claude generate them — and both
forms and full documents come out in the same house style.

```
public/base.css       the identity: colors, type, header, sections, fields, document styles
public/engine.js      the renderer: turns a definition into styled forms OR documents
public/builder.html   CREATE by clicking — live preview, works for forms and documents
SCHEMA.md             the definition format, for describe-mode (you or Claude Code)
public/safety-manual.json  example definition you can Load in the builder
public/form-generator.html  USE forms — fill in, print, hand off, or load an agent's answers
forms/RR-1.html       reference: a single form as plain hand-written HTML
public/assets/base-logo.svg  the logo, once
```

## Create — by clicking (public/builder.html)
Open the studio and choose a template. Add sections or blocks, adjust write-in height,
page setup, colors, and document-control visibility, then preview it live. Save to the
browser library, download JSON, copy a view-only link, hand the definition to AI, or
export through the browser's PDF print workflow.

Forms provide adjustable write-in fields, checkboxes, signatures, and answer JSON.
Documents provide prose, lists, checklists, tables, key/value rows, callouts, notes,
signatures, acknowledgments, cover pages, and generated contents pages. Packages combine
saved documents and regenerate their cover and index for export. See `DOCUMENT_TYPES.md`.

Try it now: New document isn't blank if you **Load** `public/safety-manual.json`.

## Create — by describing it (Claude / Claude Code)
Open `SCHEMA.md`, paste it to Claude with a request like
*"make a definition for a subcontractor daily sign-in form with company, name, trade
(pick one), time in/out, signature."* You get back a JSON definition — **Load** it into
the builder to fine-tune, or drop it straight into the generator to use.

Because both routes produce the *same* definition format, builder ⇄ describe-mode ⇄
print all round-trip cleanly. Nothing re-derives the design.

## Use a form (public/form-generator.html)
The counterpart for filling things in: open a form, type into it, and
**Print / Save PDF**, **Download answers** (JSON), or **Load answers**.
An AI agent fills it the same way — **Copy AI fill-spec**, hand it to the agent,
load the `{field: value}` JSON it returns, and the form renders completed.

## Deploy on Cloudflare
This repository is configured as a Cloudflare Pages project. The `public/` directory
contains the landing page and all deployable assets, while `wrangler.jsonc` declares
the Pages build output so local development and Cloudflare builds use the same layout.

```bash
npm install
npm run build
npm run dev
npm run deploy:dry-run
npm run deploy
```

`npm run deploy` publishes the `public/` static site to the `base-office-forms` Pages project with Wrangler. It will ask you to log in if
the current machine is not authenticated with Cloudflare. The site is also still
usable by opening `public/index.html` directly, though a local web server is recommended for
testing asset paths.

## Extending
Ask Claude Code to "add a definition for X using SCHEMA.md" — it writes a small JSON
object, not styling, so it stays on-brand and costs almost nothing. Change a color or
font once in `public/base.css` and every form and document updates together.

## Known v1 limits (say the word and I'll close these)
- The builder doesn't yet expose side-by-side paired sections (`row`); hand/describe
  definitions still support them. Loading a def that uses `row` shows its parts stacked.
- The fill generator uses its own embedded form list; loading an arbitrary saved
  definition into it to fill is a small next step, not wired yet.
- Per-page running headers on long documents are approximated (header on the body page,
  then browser page breaks) rather than repeated on every printed page.
