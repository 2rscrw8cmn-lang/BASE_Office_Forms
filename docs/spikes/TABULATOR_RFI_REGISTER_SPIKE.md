# Spike: Tabulator as the desktop RFI register

Status: **controlled technical spike — not a production change.** Evaluation
branch `spike/tabulator-rfi-register`, branched from
`feature/rfi-slice-1-register-workspace` (PR #36, head
`3f737841ad52383875dbb7f4b29dd80f8d8c9ad9`). No D1 schema, migration, API
contract, domain, read-model, authorization, or mobile-card behavior was
changed. `npm run check` passes in full.

The Tabulator prototype is an **A/B alternative** to the existing custom
register, activated only by `?grid=tabulator` on
`/projects/:projectId/rfis`. The custom register remains the default. A
reviewer can move between the two on the same project data while every other
query parameter (search, status, responsible, due, sort, direction) is
preserved.

---

## Summary — recommendation

**Reject Tabulator as a replacement for the desktop RFI register. Keep the
existing controlled custom table. Re-evaluate Tabulator for future
high-volume registers (Submittals, RFI logs, exports), where it earns its
weight.**

This is a project-risk and maintenance judgement, not a preference:

- The RFI register loads the **whole authorized list** in one read model and
  is realistically tens to low-hundreds of rows. At those sizes the custom
  table already renders in well under 200 ms; Tabulator's decisive advantage
  (virtualized rendering) does not engage until ~500–2,000 rows.
- Tabulator's editing model **conflates cell selection and cell editing**: a
  single click opens the editor. Using only documented Tabulator options
  there is no faithful reproduction of the current spreadsheet workflow
  (click selects, Enter/typing edits, arrow keys navigate **without**
  editing). For the primary RFI editing surface that is a real keyboard
  regression, and matching it exactly would require undocumented internals —
  an explicit stop condition for this spike.
- The dependency adds **~102 KB gzip of JavaScript** to replace a
  ~800-line custom register that it cannot actually delete: the adapter,
  mobile cards, toolbar, URL-state engine, and save pipeline all remain.

The same measurements make the opposite case for **Submittals, RFI-log, and
export surfaces**, which are expected to be larger and to need download/export
and column tooling Tabulator ships. The dependency, vendoring approach, BASE
theming, and adapter built here are a validated starting point for that work.

---

## What was built

| Piece | File | Notes |
|---|---|---|
| Adapter (pure helpers + grid controller) | `public/rfi-tabulator-adapter.js` | 567 lines. Only module that references Tabulator. |
| A/B integration | `public/rfis-view.js` (+152 / −5) | `?grid=tabulator` branch; custom path untouched. |
| BASE theme overrides | `public/app-shell.css` (+147) | Scoped under `.rfi-tabulator-host`. |
| Vendored library | `public/vendor/tabulator/` | ESM build + base CSS (see below). |
| Build/headers | `scripts/verify-build.mjs`, `public/_headers` | Assets required at build; `/vendor/*` immutable cache. |
| Tests | `tests/unit/rfi-tabulator.test.ts` (618), `tests/fixtures/rfi-dataset.ts` (102) | 20 new tests + fixtures. |

---

## Dependency and asset delivery

- **Installed version:** `tabulator-tables@6.5.2`, pinned exactly in
  `package.json` and `package-lock.json` (`--save-exact`). `npm audit`:
  **0 vulnerabilities**.
- **JavaScript bundle impact:** the vendored ESM build
  `public/vendor/tabulator/tabulator_esm.min.js` is **447,261 bytes
  (~437 KB) minified, ~102 KB gzip**. It is loaded **lazily** — a dynamic
  `import()` fired only when `?grid=tabulator` is active — so the default
  register ships **zero** additional JavaScript.
- **CSS bundle impact:** the vendored base stylesheet
  `public/vendor/tabulator/tabulator.min.css` is **28,451 bytes (~28 KB),
  ~3.9 KB gzip**, injected via a `<link>` only when the prototype activates.
  BASE overrides add **147 lines** to `app-shell.css`.
- **Asset-loading approach:** the same convention the repository already uses
  for `pdf-lib` — the third-party build is **vendored into `public/vendor/`**
  and served as a first-party static asset by Cloudflare Pages. No CDN or
  runtime third-party URL is used (a hard requirement and a stop condition).
  The `sourceMappingURL` trailers were stripped so the browser does not 404 on
  absent `.map` files.
- **Why this approach fits the repo:** the project intentionally has **no
  application bundler** — `public/` is served verbatim and modules are native
  ESM. Tabulator supports building with only selected modules, but that
  requires a Rollup/webpack pipeline the repo deliberately avoids. The
  smallest maintainable option compatible with that constraint is the
  prebuilt `TabulatorFull` ESM, imported on demand. `scripts/verify-build.mjs`
  now asserts both vendored files exist, and `/vendor/*` gets the same
  `immutable` cache header as `/assets/*`. The vendored files are committed
  deliberately (documented here) rather than silently.

---

## Comparison matrix

Scored 1 (poor) – 5 (excellent) **for the RFI register specifically**.

| Dimension | Custom table | Tabulator | Notes |
|---|:---:|:---:|---|
| Maintainability | 4 | 3 | Custom is small and fully owned; Tabulator adds an adapter + a library whose upgrades must be tracked. |
| Code volume | 4 | 3 | Custom register ≈ 800 lines; Tabulator adds a 567-line adapter **and** the library, and removes nothing. |
| Keyboard workflow | 5 | 2 | Custom matches the spec exactly; Tabulator conflates select/edit and lacks non-editing arrow navigation via public APIs. |
| Accessibility | 4 | 3 | Both convey status as text and keep real anchors; Tabulator's grid semantics and focus model are less controllable. |
| Inline editing | 4 | 4 | Both do capability-gated per-cell editing; different trigger semantics. |
| Error handling | 4 | 4 | Cell-level Saving/Saved/Failed, 409 conflict refresh, 403 permission loss all reproduced through public APIs. |
| URL-state integration | 5 | 4 | URL stays authoritative in both; Tabulator's own sort had to be **disabled** to avoid a second source of truth. |
| Mobile behavior | 5 | 5 | Identical — the existing cards render at ≤760 px in both; Tabulator is desktop-only. |
| Visual integration | 4 | 4 | Tabulator was fully re-skinned to BASE (see screenshots); parity is good but needs ongoing override upkeep. |
| Performance (small data) | 5 | 4 | Both are fast; Tabulator has a fixed async build cost. |
| Performance (500–2,000 rows) | 2 | 5 | Decisive Tabulator win via virtualization — see findings. |
| Bundle weight | 5 | 2 | +102 KB gzip JS (lazy) vs zero for the custom register. |
| Testing complexity | 4 | 3 | Tabulator needs an injected test double; real layout isn't exercisable in happy-dom. |
| Future RFI-log / export support | 2 | 5 | Tabulator ships download/export and column tooling the custom table lacks. |
| Reusability for Submittals / other registers | 3 | 5 | The adapter + vendoring generalize cleanly to other registers. |

---

## Quantitative changes

- **Added dependency:** `tabulator-tables@6.5.2` (exact pin).
- **JavaScript size added:** ~437 KB min / ~102 KB gzip, **lazy-loaded**;
  0 KB on the default register.
- **CSS size added:** ~28 KB min / ~3.9 KB gzip vendored + 147 lines of
  scoped overrides in `app-shell.css`.
- **Production asset size, before → after:** `public/vendor/` grows from
  ~513 KB (pdf-lib only) to ~992 KB with the Tabulator ESM + CSS added.
  The default register download is unchanged (lazy import).
- **Custom application code added:** `rfi-tabulator-adapter.js` (567 lines /
  ~21 KB) + 152 changed lines in `rfis-view.js`.
- **Custom application code that could eventually be removed:** effectively
  **none** for the RFI register. Adopting Tabulator would *replace* the
  custom desktop-table rendering (~120 lines: `tableRows`, `editableCell`,
  cell keydown/commit wiring) but **retain** the toolbar, filters, URL-state
  engine, mobile cards, save pipeline, and add the 567-line adapter — a net
  increase. Removal is therefore **not** claimed.
- **Test-code change:** +720 lines (20 new unit tests + fixtures). No existing
  test weakened, deleted, or skipped.
- **Tabulator-specific adapters / overrides:** 1 adapter module, 1 scoped CSS
  block (~147 lines), 1 injected stylesheet link, 1 test double.

---

## Behavioral gaps (honest differences from the custom register)

1. **Select vs edit (keyboard workflow).** The custom register: click
   *selects* a cell; Enter or typing *begins* editing; arrow keys move the
   selection *without* editing. Tabulator's documented `editTriggerEvent`
   options are `click` / `dblclick` / `focus` only. The prototype uses
   `click`, so a single click **opens the editor** — there is no
   select-then-commit intermediate state, and arrow-key navigation between
   *non-editing* cells is not reproduced without reaching into undocumented
   internals. **Stop condition met** for exact parity.
2. **Tab / Shift+Tab / Enter commit.** These work through Tabulator's editor
   navigation and the `cellEdited` event, and only-changed-value commits are
   preserved (Tabulator fires `cellEdited` only on change). Blur-commit and
   Escape-cancel behave as expected.
3. **Focus restoration after conflict.** Implemented via
   `row.getCell(field).getElement().focus()` after `replaceData`. This
   restores focus to the same logical cell **when it still exists**, but it is
   a best-effort element focus, not the custom register's exact logical-focus
   model.
4. **Cell-level async status.** Saving / Saved / Failed / conflict / permission
   messages stay attached to the affected cell via a per-cell state map and a
   `RowComponent.reformat()` re-render. (The spike found and fixed a real bug
   here: `CellComponent` has no `reformat()`; the row-level API is required.)
5. **Sorting authority.** Tabulator header-click sorting was **disabled**
   (`headerSort: false`) so the toolbar sort control and the URL remain the
   single source of order. Without this, Tabulator becomes a competing sort
   authority.
6. **Link semantics.** Preserved. The RFI-number and Open links are real
   anchors; modifier/middle clicks keep native new-tab behavior; ordinary data
   cells never navigate.
7. **Mobile boundary.** Unchanged. Tabulator is desktop-only; the existing
   cards render at ≤760 px. The Tabulator instance lives in a `display:none`
   host on mobile (no compressed grid), which is acceptable but means a hidden
   instance is constructed.
8. **Accessibility.** Status is text, not colour; focus is visible; links are
   anchors; editors carry `aria-label`s via the formatters. However Tabulator's
   default grid ARIA and focus model are **less controllable** than the custom
   table's hand-authored `role="grid"` / `tabindex` scheme, and the
   single-click-edit model changes the expected interaction for screen-reader
   and keyboard users. This needs dedicated AT testing before any adoption.

---

## Performance findings

Measured in headless Chromium (Playwright) at 1440×900, rendering **the same
fixture data** through the real modules (`tests/fixtures/rfi-dataset.ts`) in
both implementations. Tabulator ran with a defined table height so
virtualization is **active**. Numbers are a **single run** and include a fixed
harness settle overhead (~250 ms baked into "render", ~120 ms into
"filter"/"sort"); the **deltas across sizes**, not the absolute values, are the
signal. Precision beyond that is not claimed.

Render / filter / sort are milliseconds (as measured); DOM = element count.

| Rows | Custom render | Tabulator render | Custom sort | Tabulator sort | Custom DOM | Tabulator DOM |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 254 | 308 | 121 | 121 | 46 | 46 |
| 1 | 255 | 255 | 122 | 121 | 113 | 199 |
| 50 | 264 | 262 | 134 | 126 | 2,295 | 2,615 |
| 500 | 423 | 310 | 411 | 148 | 22,283 | 10,359 |
| 2,000 | **3,138** | **470** | **1,492** | **232** | **88,911** | **36,173** |

Reading (subtracting the fixed floors):

- **Small data (0–50 rows):** effectively equal. Tabulator carries a small
  fixed async-build cost; the custom table has a marginally lighter DOM.
- **Large data (500–2,000 rows):** Tabulator wins decisively. At 2,000 rows the
  custom table's full-DOM render is ~2.9 s of actual work and ~89 K DOM nodes;
  Tabulator virtualizes to ~36 K nodes (most of which is the *shared*,
  non-virtualized mobile-card list) and renders in ~220 ms. Sorting shows the
  same pattern (~1.37 s vs ~110 ms actual).
- **Implication:** virtualization is the whole case for Tabulator, and it only
  matters at register sizes the RFI list is not expected to reach — but that
  Submittals and log/export views may. No server pagination was added; this is
  purely client-side rendering of the already-authorized list.

---

## Screenshots

Generated from the real modules + fixtures via headless Chromium (same
viewport and data for the desktop comparison). Not fabricated. In
`docs/spikes/screenshots/`:

| # | File | Shows |
|---|---|---|
| 1 | `01-custom-desktop.png` | Current custom desktop register (50 rows). |
| 2 | `02-tabulator-desktop.png` | Tabulator register, same data — frozen RFI No./Subject, BASE badges, Due-soon flags, legacy refs. |
| 3 | `03-selected-cell.png` | Editable cell focus. |
| 4 | `04-active-editor.png` | Active in-cell editor. |
| 5 | `05-saving-state.png` | Per-cell "Saving…" pill. |
| 6 | `06-failed-state.png` | Per-cell failure message. |
| 7 | `07-conflict-reloaded.png` | Conflict message attached to the cell. |
| 8 | `08-locked-issued-row.png` | Locked, issued (Open) rows with filtered count preserved. |
| 9 | `09-empty-filtered.png` | Filtered-empty state. |
| 10 | `10-mobile-cards.png` | Existing mobile cards (≤760 px) — unchanged. |

Screenshots 5–7 are rendered through the adapter's real per-cell status API
(`setCellState` → `RowComponent.reformat`), i.e. the exact UI the live save
pipeline produces.

---

## Stop conditions encountered

- **Keyboard workflow parity requires undocumented internals** — met. The
  select-then-edit / non-editing-arrow model cannot be reproduced with public
  options; documented here rather than hidden.
- All other stop conditions **not** hit: cell-level async errors stay attached
  to the field; conflict refresh preserves URL filters and restores logical
  focus; explicit anchor navigation is preserved; no CDN; no API/domain change;
  mobile cards untouched; styling parity did not require fragile overrides
  (one scoped block); `npm run check` passes without weakening any test.

The single met stop condition, combined with the bundle-vs-removable-code
math for a register that isn't large, is why the recommendation is **reject
for the RFI register / revisit for high-volume registers**.

---

## Recommendation (restated in the required terms)

1. **Replace the custom RFI desktop grid?** No. The keyboard regression and
   the +102 KB dependency are not justified for a small, spec-matched register
   that already performs well and whose custom code cannot be meaningfully
   removed.
2. **Use later for Submittals and logs?** Yes, conditionally. The virtualization
   win at scale and Tabulator's export/column tooling are a genuine fit there.
   The vendoring approach, BASE theme, and adapter in this branch are a
   validated head start.
3. **Reject in favour of the existing controlled table?** Yes, for the RFI
   register now.

Conditions before any future adoption: a dedicated assistive-technology pass on
the configured grid, a decision on the select-vs-edit interaction, and a
bundle-splitting plan (module-level Tabulator build) if it is used on a
default-loaded route.
