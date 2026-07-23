# UI-2 Dependency and License Record

**Updated:** 2026-07-23  
**Scope:** UI-2 React/Vite compatibility foundation

| Package                | Version | License | Purpose                                                       | Bundle/runtime impact                                                                                                           | Replacement strategy                                                                                      |
| ---------------------- | ------: | ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `react`                |  19.2.8 | MIT     | Application composition and future route/component migration. | Bundled into the current compatibility entry; approximately 192 kB minified before compression for the host plus React runtime. | Remove only after the application migration is complete or replace with the selected application runtime. |
| `react-dom`            |  19.2.8 | MIT     | Browser root mounting.                                        | Included in the compatibility entry.                                                                                            | Replace with the chosen browser renderer only through an ADR and route-parity proof.                      |
| `vite`                 |   8.1.5 | MIT     | Deterministic application asset build.                        | Build-time only; no runtime dependency.                                                                                         | Roll back to committed static assets and the legacy boot path if the build cannot deploy.                 |
| `@vitejs/plugin-react` |   6.0.4 | MIT     | JSX/TSX transform and React development ergonomics.           | Build-time only.                                                                                                                | Use the Vite-supported React transform or remove with the React foundation.                               |
| `@types/react`         |  19.2.8 | MIT     | TypeScript declarations.                                      | Typecheck only.                                                                                                                 | Remove with React.                                                                                        |
| `@types/react-dom`     |  19.2.3 | MIT     | Browser mounting declarations.                                | Typecheck only.                                                                                                                 | Remove with React DOM.                                                                                    |
| `pdf-lib`              |  1.17.1 | MIT     | Existing browser-side PDF export for controlled documents.    | Preserved from current main; `public/pdf-export.js` uses the vendored browser asset. It is not part of the React host.          | Retire only with the existing export workflow, its compatibility coverage, and an explicit ADR.           |

## Review notes

- Requested ranges are recorded in `package.json` and exact resolved versions
  are locked in `package-lock.json`; update them through an intentional
  dependency change, not a broad install.
- React/Vite are introduced only for the authenticated application host. No
  renderer, D1/R2, API, or authorization dependency is moved into the browser
  bundle.
- `pdf-lib` is an existing current-main dependency retained during the UI-2
  merge; it is intentionally separate from the new React/Vite boundary.
- The generated compatibility entry is emitted to `public/app/app.js`; the
  legacy feature modules remain separately served assets so UI-2 does not
  duplicate or rewrite them.
- `npm audit` remains a required check. Findings must be triaged before a
  production deployment; UI-2 does not use `npm audit fix --force` implicitly.
