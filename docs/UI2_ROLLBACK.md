# UI-2 Rollback and Compatibility Notes

UI-2 has one runtime boundary: `/` and the authenticated application entry
load the generated `/app/app.js` React host, which mounts the existing
`public/app-shell.js` and feature modules. The legacy shell is deliberately
retained and remains the source of route, API, session, focus, and feature
behavior during this phase.

## Rollback

1. Stop deployment of the UI-2 asset set.
2. Restore the prior `public/index.html` and its `/base.css`,
   `/app-shell.css`, and `/app-shell.js` boot references from the last known
   good commit.
3. Keep `public/base.css`, `public/engine.js`, legacy pages, and existing API
   assets unchanged. The new `public/brand-tokens.css` and `public/app/` files
   are additive and can remain served but are not required by the legacy entry.
4. Re-run `npm run build`, `npm run test:unit`, and the renderer/legacy-page
   regression tests before redeploying.

No database migration, API contract, authorization rule, renderer definition,
or R2 object is changed by UI-2, so rollback does not require data recovery or
schema reversal.

## Compatibility boundary

`LegacyApplicationHost` dynamically loads `/app-shell.js` and sets a bootstrap
marker so the legacy module does not auto-start twice. The host calls the same
`createAppShell()` entry used by the current unit tests and destroys it on
unmount. A future route migration can replace this host one feature at a time;
UI-2 does not migrate a feature screen.
