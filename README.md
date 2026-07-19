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
shared Cloudflare library, organize records in folders, copy public view/fill links or
private edit links, hand the definition to AI, or export through the browser's PDF workflow.

Forms provide adjustable write-in fields, checkboxes, signatures, and answer JSON.
Documents provide prose, lists, checklists, tables, key/value rows, callouts, notes,
signatures, acknowledgments, cover pages, and generated contents pages. Packages combine
shared documents and regenerate their cover and page-accurate index for export. Embedded
package documents can be edited in place. See `DOCUMENT_TYPES.md`.

Pages are always US Letter (portrait or landscape). Manual page breaks are supported,
and overflowing sections are moved onto continuation pages before export.

**Import backup / Export backup** use JSON as a portable copy of the complete document
definition. They are intended for recovery, transfer, and AI workflows; normal team use
should go through **Save shared** and **Shared library**.

## Product architecture and roadmap

The implementation source of truth for projects, RFIs, submittals, controlled documents,
files, sharing, security, AI, and rollout is [`docs/README.md`](docs/README.md).

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
This repository is configured as a Cloudflare Pages project with Pages Functions and a
D1 shared library. The `public/` directory contains the interface, `functions/` contains
the library API, and `migrations/` contains the controlled database schema. A new D1
database bootstraps its base schema on the first API request.

```bash
npm install
npm run build
npm run db:migrate:local
npm run dev
npm run deploy:dry-run
npm run deploy
```

See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) for the environment
contract and run `npm run check` for the complete local and CI validation gate.

`npm run deploy` publishes the site and Pages Functions to the `base-office-forms` Pages project with Wrangler. It will ask you to log in if
the current machine is not authenticated with Cloudflare. The site is also still
usable by opening `public/index.html` directly, though a local web server is recommended for
testing asset paths.

## Extending
Ask Claude Code to "add a definition for X using SCHEMA.md" — it writes a small JSON
object, not styling, so it stays on-brand and costs almost nothing. Change a color or
font once in `public/base.css` and every form and document updates together.

## Current access model

- Anyone who can open the site can browse, fill, and create shared documents.
- Existing documents can only be overwritten or deleted with their private edit link.
- Public links contain no edit credential. Keep private edit links with document owners.
- A future identity layer can add named users, approvals, and role-based permissions
  without changing stored document definitions.
