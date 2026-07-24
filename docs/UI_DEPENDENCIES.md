# UI Dependency and License Record

**Updated:** 2026-07-23  
**Scope:** UI-2 React/Vite compatibility foundation and UI-3 component library

## UI-3 component library and UI Lab

UI-3 adds the BASE application component library. It introduces two runtime
dependencies (Radix behaviour primitives and Lucide icons) and development-only
testing/tooling. All are MIT-licensed, actively maintained, and used only in the
application workspace; none moves domain logic, permissions, or official workflow
authority into the browser.

| Package                        |  Version | License | Purpose                                                                        | Bundle/runtime impact                                                                                                                                          | Replacement strategy                                                                                    |
| ------------------------------ | -------: | ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `radix-ui`                     |    1.6.5 | MIT     | Accessible behaviour for Dialog, AlertDialog, DropdownMenu, Popover, Tabs, Toast, Tooltip, Checkbox, RadioGroup, Collapsible, Separator. | Tree-shaken per component; imported **only** inside `src/ui/components/` (enforced by test). Not yet in the shipped `public/app/app.js` bundle — added when a feature adopts a component in UI-4+. | Radix owns behaviour only; BASE owns styling/contract, so a primitive can be re-implemented per component without a feature rewrite. |
| `lucide-react`                 |   1.26.0 | ISC     | Application icon set behind the single `Icon` component.                        | Only imported icons are bundled; `lucide-react` is imported **only** by `src/ui/components/icons/Icon.tsx` (enforced by test).                                  | Swap the icon set behind the one `Icon` component; no feature imports Lucide directly.                  |
| `@testing-library/react`       |   16.3.2 | MIT     | Component behaviour/keyboard/accessibility tests.                               | Dev/test only.                                                                                                                                                | Remove with the component test strategy or replace with the chosen renderer's test utilities.           |
| `@testing-library/user-event`  |   14.6.1 | MIT     | Realistic keyboard/pointer interaction in tests.                               | Dev/test only.                                                                                                                                                | Remove with the component test strategy.                                                                |
| `@testing-library/dom`         |  10.4.1  | MIT     | DOM query engine used by the React testing library.                            | Dev/test only.                                                                                                                                                | Remove with the component test strategy.                                                                |
| `@testing-library/jest-dom`    |    7.0.0 | MIT     | DOM assertion matchers (`toHaveAccessibleName`, `toBeInTheDocument`, …).        | Dev/test only.                                                                                                                                                | Remove with the component test strategy.                                                                |
| `happy-dom`                    |  20.11.1 | MIT     | DOM environment for the component and lab tests (already present for UI-2).     | Dev/test only.                                                                                                                                                | Replace with jsdom if a component needs an API Happy DOM lacks.                                          |

Notes:

- `radix-ui` is the single unified Radix package rather than many
  `@radix-ui/react-*` packages, so the dependency surface and lockfile stay
  small and one version governs all primitives.
- The UI Lab build (`vite.lab.config.ts`, `npm run lab`/`lab:build`) reuses the
  already-pinned Vite/React toolchain; it adds no dependency and emits only to
  the gitignored `dist/ui-lab/`.
- `npm audit --audit-level=high` reports zero vulnerabilities after adding these
  packages; the existing Miniflare `sharp` override is unchanged.
- Requested ranges are in `package.json`; exact resolved versions are locked in
  `package-lock.json`. Update them through an intentional dependency change.

## UI-2 React/Vite compatibility foundation

## PR #36 reconciliation tooling

PR #36 adds no runtime or package dependency. Its guarded D1 fixture and
rehearsal commands use the already-pinned local Wrangler CLI and Node standard
library. The UI-2 Miniflare `sharp` override remains unchanged. See
`RFI_SLICE_1_ROLLOUT.md` for target identities and safety constraints.

| Package                      | Version | License    | Purpose                                                                      | Bundle/runtime impact                                                                                                           | Replacement strategy                                                                                      |
| ---------------------------- | ------: | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `react`                      |  19.2.8 | MIT        | Application composition and future route/component migration.                | Bundled into the current compatibility entry; approximately 192 kB minified before compression for the host plus React runtime. | Remove only after the application migration is complete or replace with the selected application runtime. |
| `react-dom`                  |  19.2.8 | MIT        | Browser root mounting.                                                       | Included in the compatibility entry.                                                                                            | Replace with the chosen browser renderer only through an ADR and route-parity proof.                      |
| `vite`                       |   8.1.5 | MIT        | Deterministic application asset build.                                       | Build-time only; no runtime dependency.                                                                                         | Roll back to committed static assets and the legacy boot path if the build cannot deploy.                 |
| `@vitejs/plugin-react`       |   6.0.4 | MIT        | JSX/TSX transform and React development ergonomics.                          | Build-time only.                                                                                                                | Use the Vite-supported React transform or remove with the React foundation.                               |
| `@types/react`               |  19.2.8 | MIT        | TypeScript declarations.                                                     | Typecheck only.                                                                                                                 | Remove with React.                                                                                        |
| `@types/react-dom`           |  19.2.3 | MIT        | Browser mounting declarations.                                               | Typecheck only.                                                                                                                 | Remove with React DOM.                                                                                    |
| `pdf-lib`                    |  1.17.1 | MIT        | Existing browser-side PDF export for controlled documents.                   | Preserved from current main; `public/pdf-export.js` uses the vendored browser asset. It is not part of the React host.          | Retire only with the existing export workflow, its compatibility coverage, and an explicit ADR.           |
| `sharp` (Miniflare override) |  0.35.3 | Apache-2.0 | Narrow transitive security override for Miniflare's test/runtime dependency. | Development/test only; locked through `package.json` `overrides`, not bundled into the app.                                     | Remove when the upstream Miniflare/Wrangler dependency chain resolves the advisory without the override.  |

## Review notes

- Requested ranges are recorded in `package.json` and exact resolved versions
  are locked in `package-lock.json`; update them through an intentional
  dependency change, not a broad install.
- React/Vite are introduced only for the authenticated application host. No
  renderer, D1/R2, API, or authorization dependency is moved into the browser
  bundle.
- `pdf-lib` is an existing current-main dependency retained during the UI-2
  merge; it is intentionally separate from the new React/Vite boundary.
- The nested `miniflare.sharp` override is the narrow remediation previously
  proven on PR #36. It resolves the high-severity audit findings without a
  broad dependency upgrade or `npm audit fix --force`; `npm audit
--audit-level=high` is clean with the regenerated lockfile.
- The generated compatibility entry is emitted to `public/app/app.js`; the
  legacy feature modules remain separately served assets so UI-2 does not
  duplicate or rewrite them.
- `npm audit` remains a required check. Findings must be triaged before a
  production deployment; UI-2 does not use `npm audit fix --force` implicitly.
