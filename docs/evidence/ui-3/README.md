# UI-3 evidence — BASE component library and UI Lab

Branch: `claude/base-components-ui-lab-5l05ux`. PR #43 (draft). Not merged.

## Problem and scope

UI-3 builds the reusable BASE application component library that prevents
further visual drift, plus a development-only UI Lab that exercises the real
production components across every required state. It does not migrate feature
screens (that is UI-4 onward) and does not touch the controlled-document
renderer, storage, migrations, authorization, or `/api/v2`.

## Foundation review fixes (2026-07-24)

A foundation review of the initial UI-3 implementation found four issues, all
fixed on this branch — see `docs/UI_PROGRAM_STATUS.md` §5A for the full
write-up:

1. **CommandMenu robustness/accessibility.** Fixed DOM ids that collided
   across instances and an active index that could point past a shrunk or
   filtered list. Now uses `useId()`-derived ids, clamps/derives the active
   index against the current filtered length on every render, omits
   `aria-controls` when there is nothing to control, and takes an explicit
   `label` prop for the search input's accessible name.
2. **Field/control id consistency.** A caller `id` on a child control used to
   silently disconnect the Field's `<label htmlFor>`. `Field` now has an
   optional `controlId` prop that is the one authoritative id for both the
   label and the control; the control always defers to it when inside a
   Field.
3. **Status vocabulary.** Replaced the single invented `STATUS_VOCABULARY`
   (which mixed non-authoritative aliases like `responded`/`issued` with
   calculated `due_soon`/`overdue` conditions) with one domain-typed
   vocabulary per authoritative status enum — `RfiStatusBadge`,
   `RecordStatusBadge`, `RevisionStatusBadge` — each keyed by the real domain
   type (`RfiStatus`/`RecordStatus`/`RevisionStatus` from `src/domain`), plus
   a separate `AttentionBadge` for the calculated due/overdue conditions.
4. **DropdownMenu markup.** Replaced an unnecessary `<div>` wrapper around
   each menu item/separator with a `React.Fragment`.

## Architecture and UI-foundation references

- `docs/APP_UI_FOUNDATION.md` — binding component inventory (§6), page patterns
  (§5), interaction states (§7), responsive (§8), accessibility (§9),
  dependencies (§10), prohibited patterns (§11).
- `docs/UI_IMPLEMENTATION_PLAYBOOK.md` §6 — UI-3 objective, UI Lab states,
  testing, and exit gate.
- `docs/CURRENT_APPLICATION_STRUCTURE.md` — "UI-3 BASE component library and UI
  Lab" and the component test structure.

## What was built

- Application semantic tokens (`src/ui/theme/tokens.css` + `tokens.ts`), single
  source; BASE maroon for action/focus/selection; danger red kept separate.
- Primitives, interactive components (Radix behaviour, BASE styling), and
  application patterns — see `src/ui/components/`.
- One Lucide icon component; one tokenized stylesheet with no raw colour
  literals and no feature-specific selectors.
- Development-only UI Lab (`src/ui/lab/`, `vite.lab.config.ts`,
  `npm run lab`/`lab:build`) rendering the real components, not demo markup.

## Dependency / license impact

Runtime: `radix-ui` (MIT) and `lucide-react` (ISC). Dev/test:
`@testing-library/*` and `happy-dom` (MIT). Details and replacement strategy in
`docs/UI_DEPENDENCIES.md`. `npm audit --audit-level=high` reports 0
vulnerabilities. No dependency changed in the foundation-review round.

## API / schema / security impact

None. No domain logic, permissions, numbering, or official workflow authority
moves into the browser. `RfiStatusBadge`/`RecordStatusBadge`/`RevisionStatusBadge`
import only pure status *types* from `src/domain` (no runtime DB/service
imports), for compile-time alignment with the authoritative status enums — not
a new business-logic dependency. The controlled-document renderer and
`public/base.css` are untouched; the byte-stable renderer regression still
passes.

## Migration / rollback impact

None. No D1/R2, migration, or wrangler change. The library is not yet mounted by
the legacy shell, so the shipped `public/app/app.js` bundle is unchanged and
there is nothing to roll back in production; removing the library is a code-only
revert.

## Test results

Full `npm run check` passes: Prettier, Cloudflare types, TypeScript, ESLint,
**336 unit tests**, 119 Worker integration tests, the production build, Pages
Functions build, `npm audit --audit-level=high` (0 vulnerabilities), and the
secret scan. `npm run lab:build` passes. UI-3 suites: `base-components-behavior`
(incl. Field control-id consistency), `base-components-keyboard` (incl.
CommandMenu robustness), `base-components-accessibility`,
`base-component-tokens`, `base-status-badges` (new — domain-status
exhaustiveness), `ui-lab-catalog`.

## Screenshots

- `ui-lab-desktop.png` — UI Lab at 1280px (initial UI-3 capture).
- `ui-lab-mobile.png` — UI Lab at 390px (initial UI-3 capture).
- `ui-lab-desktop-primitives-r2.jpg` — Primitives group recaptured 2026-07-24
  after the status-vocabulary rework, showing all seven RFI statuses, both
  Record statuses, all three Revision statuses, and the two calculated
  attention conditions with distinct tones.

All captured from the built lab (`npm run lab:build`) with the pre-installed
Chromium. Live hover/focus states are demonstrated interactively in the lab and
asserted structurally in tests.

## Accessibility / keyboard checks

Keyboard and focus are tested for Dialog, Drawer, Tabs, DropdownMenu, and
CommandMenu (focus trap, Escape, focus restoration, arrow navigation,
activation), plus CommandMenu's id-collision safety across simultaneous
instances, self-healing active index under shrinking/filtering, empty-collection
handling, and accessible-name coverage. Icon-only controls are named; status is
text + icon, never colour alone; groups and landmarks are labelled; error and
save states use live regions. Component CSS honours reduced-motion.

## Known limitations

- Library not yet mounted by the shell (intentional for UI-3); feature adoption
  is UI-4+.
- No automated pixel-baseline visual-regression harness yet (UI-10 scope).
- Offline captures fall back from Archivo to `system-ui`; no layout/contract
  impact.
- No `IssuanceStatusBadge` exists yet — the issuance domain
  (`src/domain/issuances/issuance.ts`) has no stored status enum today
  (issuances are immutable point-in-time records); add one only if/when the
  domain introduces a real issuance status field.

## Next step

UI-3 is ready for final product-owner review on PR #43. UI-4 (React
application shell and route parity) does not begin until PR #43 merges.
