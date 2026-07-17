# BASE Forms & Documents Kit

One locked visual identity (`base.css`) + one renderer (`engine.js`).
Everything you make is a small **definition** (a JSON object). Create them two ways —
click through the builder, or describe them and let Claude generate them — and both
forms and full documents come out in the same house style.

```
base.css              the identity: colors, type, header, sections, fields, document styles
engine.js             the renderer: turns a definition into styled forms OR documents
builder.html          CREATE by clicking — live preview, works for forms and documents
SCHEMA.md             the definition format, for describe-mode (you or Claude Code)
samples/              example definitions you can Load in the builder
form-generator.html   USE forms — fill in, print, hand off, or load an agent's answers
forms/RR-1.html       reference: a single form as plain hand-written HTML
assets/base-logo.jpg  the logo, once
```

## Create — by clicking (builder.html)
Open it, hit **New form** or **New document**. Add sections/blocks from the menu,
type your labels, tick options — the right pane previews it live in the BASE style.
Then **Save** (a .json definition), **Copy def**, or **Print / Save PDF**.

Forms give you: write-in fields, checkboxes (pick-one or any), signature rows.
Documents give you: numbered prose sections, the maroon callout, note boxes,
signatory blocks, tables, an auto contents page, and acknowledgment blocks.

Try it now: New document isn't blank if you **Load** `samples/safety-manual.json`.

## Create — by describing it (Claude / Claude Code)
Open `SCHEMA.md`, paste it to Claude with a request like
*"make a definition for a subcontractor daily sign-in form with company, name, trade
(pick one), time in/out, signature."* You get back a JSON definition — **Load** it into
the builder to fine-tune, or drop it straight into the generator to use.

Because both routes produce the *same* definition format, builder ⇄ describe-mode ⇄
print all round-trip cleanly. Nothing re-derives the design.

## Use a form (form-generator.html)
The counterpart for filling things in: open a form, type into it, and
**Print / Save PDF**, **Download answers** (JSON), or **Load answers**.
An AI agent fills it the same way — **Copy AI fill-spec**, hand it to the agent,
load the `{field: value}` JSON it returns, and the form renders completed.

## Where it lives
Plain static site, same as Gather and Pennant Race:
- Double-click any HTML file to work locally right now.
- Drop the folder in a repo → Cloudflare Pages → your whole forms/docs library at a URL,
  no install for the team.

## Extending
Ask Claude Code to "add a definition for X using SCHEMA.md" — it writes a small JSON
object, not styling, so it stays on-brand and costs almost nothing. Change a color or
font once in `base.css` and every form and document updates together.

## Known v1 limits (say the word and I'll close these)
- The builder doesn't yet expose side-by-side paired sections (`row`); hand/describe
  definitions still support them. Loading a def that uses `row` shows its parts stacked.
- The fill generator uses its own embedded form list; loading an arbitrary saved
  definition into it to fill is a small next step, not wired yet.
- Per-page running headers on long documents are approximated (header on the body page,
  then browser page breaks) rather than repeated on every printed page.
