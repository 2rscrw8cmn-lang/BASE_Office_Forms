# BASE UI Program Status

**Status date:** 2026-07-23
**Current phase:** UI-2 — CSS separation and React/Vite foundation active
**Active PR:** [#41 — UI-2 — CSS separation and React/Vite foundation](https://github.com/2rscrw8cmn-lang/BASE_Office_Forms/pull/41) (`ui-2-css-react-vite-foundation`)
**Authority:** This is the living handoff for the UI foundation program. Update it in every UI-related PR.

## 1. Current direction

- Preserve the document-control domain, D1/R2 model, authorization,
  revision/file identity, immutable issuance architecture, compatible JSON
  definitions, `public/engine.js`, and official document output.
- Introduce React + TypeScript + Vite incrementally for the authenticated
  workspace; preserve canonical routes, `/api/v2`, Cloudflare Pages, Studio,
  and Document Library while feature routes migrate later.
- Keep application CSS separate from controlled-document CSS. Only neutral
  brand tokens may cross the boundary.
- Use Radix behavior with BASE-owned components and Lucide through one icon
  component when components are introduced in UI-3.
- Do not adopt Tabulator for the RFI register. Spike 0 rejected it for a
  documented keyboard regression; reassess it only for a future high-volume
  register, log, or export through `BaseDataGrid`.

## 2. Completed discovery and decisions

### Spike 0 — complete, rejected for the RFI register

The Tabulator RFI prototype proved save, validation, conflict, URL-state, and
mobile-card behavior, but its documented API cannot faithfully preserve BASE's
click-to-select, Enter/type-to-edit, and non-editing arrow-key workflow. The
expected RFI list size also does not justify the lazy-loaded ~102 KB gzip
dependency. Keep the controlled custom table. See
`docs/spikes/TABULATOR_RFI_REGISTER_SPIKE.md` on the spike branch for the
behavior matrix and visual evidence. A later high-volume use needs a new
decision, assistive-technology evidence, and bundle plan.

### UI-1 — complete

The audit covered the required screens and produced the binding contracts in
`APP_UI_FOUNDATION.md`, `UI_IMPLEMENTATION_PLAYBOOK.md`, and the ADR record.

| Surface                      | Current disposition                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Dashboard / Project Overview | Preserve attention-first hierarchy; migrate shared summary/activity patterns in UI-8.               |
| Projects / Records           | Preserve server read models and capability gates; replace local register chrome in UI-6.            |
| Record / Revision workspaces | Preserve document, revision, and file identity; unify workspace chrome in UI-7.                     |
| RFI register / workspace     | Browser route remains outside UI-2; use the controlled table, not Tabulator, in its delivery phase. |
| Create/edit dialogs          | Preserve validation, recovery, and server authority; move to shared dialog patterns in UI-3/UI-8.   |
| Studio / Document Library    | Preserve renderer-compatible operation; migrate application chrome in UI-9.                         |

The audit found that the shell already centralizes project context, route focus,
mobile drawer behavior, API errors/request IDs, and responsive thresholds, but
headers, registers, cards, dialogs, status tones, file rows, and history remain
mostly local markup and CSS. The application heading target is Archivo; UI-2
does not perform the later legacy-Georgia typography migration.

## 3. UI-2 active work — PR #41

### Implemented on the branch

- React/TypeScript/Vite deterministic build emitted to `public/app/` for
  Cloudflare Pages.
- `LegacyApplicationHost` boots the existing `app-shell.js`; no feature route
  or domain behavior has been migrated into React.
- Authenticated `index.html` no longer loads `public/base.css`; neutral brand
  values live in `public/brand-tokens.css`, while `base.css` remains renderer
  and controlled-document CSS.
- The application-owned reset now supplies the authenticated body's margin,
  Archivo/font color, smoothing, paragraph reset, and complete app box sizing.
  `base.css` imports the shared tokens through the relative
  `./brand-tokens.css` path; the renderer remains otherwise independent.
- Controlled renderer-preview adapter, renderer source stability regression,
  dependency/license record, build verification, local-development guidance,
  and rollback notes are present.
- The narrow, previously proven Miniflare `sharp` override resolves the
  development/test audit finding without `npm audit fix --force`.

### Current blockers

1. Capture the authenticated preview Project Overview response: HTTP status,
   API error code, request ID, and response body, then compare the same request
   against current main. Direct requests from this environment stop at the
   Cloudflare Access HTML sign-in page, so they cannot supply API evidence.
2. Run the product-owner browser smoke suite against the merged preview,
   including session, Dashboard, Projects, Project Overview, Records, a real
   direct-route refresh, history navigation, mobile navigation, and controlled
   document preview, plus Studio and Document Library.

UI-2 is technically ready for that product-owner smoke testing, but remains
active until every blocker above is resolved. Its implementation work is not
permission to mark the phase complete early.

### Automated validation after merge

After the nested Miniflare `sharp` override, `npm install` regenerated
`package-lock.json` with `sharp` 0.35.3. `npm audit --audit-level=high` reports
zero vulnerabilities. The 2026-07-23 `npm run check` gate passes Prettier,
generated Cloudflare types, TypeScript, ESLint, 232 unit tests, 101 Worker
integration tests, the Vite application build, static asset verification, Pages
Functions compilation, dependency audit, and the 243-file secret scan. No
browser screenshots or interactive smoke evidence can be produced here because
no Access-authorized browser is available.

### Preview Project Overview investigation (2026-07-23)

The requested authenticated failure cannot be reproduced from this execution
environment because Cloudflare Access intercepts the request before the Pages
Function. A direct request to the PR preview and the same request to the
current-main deployment both returned `302 Found` with
`Www-Authenticate: Cloudflare-Access`, a Cloudflare HTML `302 Found` body, and
no application error code or `x-request-id`. The observed PR-preview edge
request was `CF-RAY: a1fb58d33c0df436-MIA`; this is an Access response, not an
API request ID.

The source for `/api/v2/projects/:projectId/overview` and its D1 read model is
identical on the UI-2 branch and current main. The configured remote D1
database contains the overview tables and applied migrations, and the overview
count/activity queries succeed for a live project. No preview migration or
binding change is justified from that evidence. Capture the authenticated API
status, error code, request ID, and JSON body in an Access-authorized browser
before classifying the report as a code failure or preview drift; then apply
and prove any required correction.

## 4. UI-2 exit gate

UI-2 is complete only when all of these are true:

- the merged application builds and deploys through the current Cloudflare
  Pages workflow;
- official document output and valid definitions remain compatible;
- the authenticated app does not inherit generic document classes or
  document-level body rules;
- legacy Studio and Document Library routes remain available;
- session, Dashboard, Projects, Project Overview, Records, direct refresh,
  browser history, controlled preview, and mobile navigation pass smoke tests;
- `npm run check` passes after lockfile regeneration;
- the preview overview failure is fixed or evidenced as an environment
  configuration/schema problem and corrected in preview;
- rollback notes, dependency documentation, current structure, ADRs, tracker,
  and PR #41 evidence are current.

## 5. Phase status

| Phase                        | Status                                            | Next gate                                         |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Spike 0 — Tabulator          | Complete; rejected for RFI                        | Future high-volume proposal only                  |
| UI-1 — Audit and decisions   | Complete                                          | Binding documents and ADRs recorded               |
| UI-2 — CSS + React/Vite      | Active; technically ready for product-owner smoke | Authenticated preview diagnosis and browser smoke |
| UI-3 — Components + UI Lab   | Not started                                       | UI-2 exit gate passes                             |
| UI-4 — React shell           | Not started                                       | UI-3 shared patterns stable                       |
| UI-5 — RFI register          | Not started                                       | Controlled-table parity; no Tabulator dependency  |
| UI-6 — Projects + Records    | Not started                                       | Shared register contract                          |
| UI-7 — Detail workspaces     | Not started                                       | Shared workspace contract                         |
| UI-8 — Dashboard/forms/admin | Not started                                       | Shared shell/forms/registers stable               |
| UI-9 — Library + Studio      | Not started                                       | Application foundation stable                     |
| UI-10 — Enforcement/cleanup  | Not started                                       | Route parity and visual baselines                 |

## 6. Current constraints and risks

- The configured remote D1 database has the overview tables and migrations and
  its overview SQL succeeds for a live project. The PR and current-main
  overview server source are identical. This makes a branch code or shared-D1
  schema regression unlikely, but it is not a replacement for an authenticated
  preview response; Cloudflare Access/browser availability currently blocks
  that capture.
- Official RFI issuance remains incomplete and must fail closed.
- Existing renderer output and valid definitions remain compatible.
- Browser capability presentation never replaces server authorization.
- The existing Cloudflare development/test dependency audit findings must be
  resolved or formally accepted before a production release; do not use
  `npm audit fix --force` without a review.

## 7. Next action

Complete PR #41's merge, runtime diagnosis, smoke evidence, and full gate.
Only after UI-2's exit gate passes may UI-3 begin with BASE primitives and the
UI Lab. Do not merge this PR from this task.
