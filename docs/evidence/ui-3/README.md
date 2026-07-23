# UI-3 evidence — BASE component library and UI Lab

Branch: `claude/base-components-ui-lab-5l05ux`. Not merged.

## Problem and scope

UI-3 builds the reusable BASE application component library that prevents
further visual drift, plus a development-only UI Lab that exercises the real
production components across every required state. It does not migrate feature
screens (that is UI-4 onward) and does not touch the controlled-document
renderer, storage, migrations, authorization, or `/api/v2`.

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
vulnerabilities.

## API / schema / security impact

None. No domain logic, permissions, numbering, or official workflow authority
moves into the browser. The controlled-document renderer and `public/base.css`
are untouched; the byte-stable renderer regression still passes.

## Migration / rollback impact

None. No D1/R2, migration, or wrangler change. The library is not yet mounted by
the legacy shell, so the shipped `public/app/app.js` bundle is unchanged and
there is nothing to roll back in production; removing the library is a code-only
revert.

## Test results

Full `npm run check` passes: Prettier, Cloudflare types, TypeScript, ESLint,
301 unit tests, 119 Worker integration tests, the production build, Pages
Functions build, `npm audit` (0 high/critical), and the 335-file secret scan.
UI-3 suites: `base-components-behavior`, `base-components-keyboard`,
`base-components-accessibility`, `base-component-tokens`, `ui-lab-catalog`.

## Screenshots

- `ui-lab-desktop.png` — UI Lab at 1280px.
- `ui-lab-mobile.png` — UI Lab at 390px.

Both were captured from the built lab (`npm run lab:build`) with the
pre-installed Chromium. Live hover/focus states are demonstrated interactively
in the lab and asserted structurally in tests.

## Accessibility / keyboard checks

Keyboard and focus are tested for Dialog, Drawer, Tabs, DropdownMenu, and
CommandMenu (focus trap, Escape, focus restoration, arrow navigation,
activation). Icon-only controls are named; status is text + icon, never colour
alone; groups and landmarks are labelled; error and save states use live
regions. Component CSS honours reduced-motion.

## Known limitations

- Library not yet mounted by the shell (intentional for UI-3); feature adoption
  is UI-4+.
- No automated pixel-baseline visual-regression harness yet (UI-10 scope).
- Offline captures fall back from Archivo to `system-ui`; no layout/contract
  impact.

## Next step

UI-4 (React application shell and route parity), composing these components.
