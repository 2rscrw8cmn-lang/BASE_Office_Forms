# BASE UI Program Status

**Status date:** 2026-07-23
**Current phase:** UI-2 — CSS separation and React/Vite foundation complete; PR #41 ready for review and merge
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

## 3. UI-2 complete — PR #41

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

### Authenticated product-owner closeout (2026-07-23)

The product owner completed the authenticated retest on
`https://b2e8a4ce.base-office-forms.pages.dev`. Dashboard and Project Overview
load without HTTP 500/Cloudflare 1101; `BASE UI Preview` and `UI-2 Smoke Test`
are available; Records shows `Preview Test Document` and its draft revision.
Projects and Records register captions, plus search, filter, and sort labels,
are visually hidden while retaining meaningful accessible names in the browser
accessibility pane. Browser Back/Forward, direct project-route refresh, Studio,
Document Library, controlled-document preview, and mobile navigation also pass.

The UI-2 exit gate is satisfied. PR #41 is ready for review and merge; this
status does not authorize beginning UI-3 before PR #36 reconciliation.

### Automated validation after merge

After the nested Miniflare `sharp` override, `npm install` regenerated
`package-lock.json` with `sharp` 0.35.3. `npm audit --audit-level=high` reports
zero vulnerabilities. The 2026-07-23 `npm run check` gate passes Prettier,
generated Cloudflare types, TypeScript, ESLint, 234 unit tests, 101 Worker
integration tests, the Vite application build, static asset verification, Pages
Functions compilation, dependency audit, and the 245-file secret scan. No
browser screenshots or interactive smoke evidence can be produced here because
no Access-authorized browser is available.

### Product-owner smoke and preview root cause (2026-07-23)

The authenticated smoke passed session/application shell, Projects, Records,
direct navigation plus Back/Forward, Studio, Document Library, controlled
document preview, and mobile navigation. It failed Dashboard and Project
Overview with `Unable to load`; the reported overview request returned HTTP 500
and Cloudflare Error 1101 at 2026-07-23 15:32:46 UTC (Ray ID
`a1fbbd60bbfef3cb`).

The direct Cloudflare D1 reproduction captured the exact underlying exception:
`no such table: rfi_records: SQLITE_ERROR [code: 7500]`. Dashboard reaches that
table in `src/infrastructure/db/d1/dashboard-read-repository.ts` and Project
Overview reaches it in
`src/infrastructure/db/d1/project-overview-read-repository.ts`. Those are the
only failing read models; Projects and Records do not query `rfi_records`.
Cloudflare Pages tailing is live-only and returned no historical entry for the
given Ray ID, but the SQL exception and source query reproduce the reported
Worker failure exactly.

The prior Pages preview database, `base-office-forms-preview`
(`b3b1b9d7-b4ce-4ebd-97c4-67c9f450f3d6`), recorded PR #36 migrations `0013` and
`0014`. Migration `0014` drops `rfi_records`, which explains the failure. UI-2
now binds the new `base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`) through `preview_database_id`. Its
ledger contains only `0001`–`0012`; `rfi_records` has the expected
`title`, `due_date`, `status`, and related legacy columns, and the Dashboard
and Overview count queries both return successfully. Production's D1 binding
and migration ledger were only read; no production migration was applied.

### Preview smoke fixture (2026-07-23)

PR #41 provisions an idempotent, deterministic fixture command for
`base-office-forms-ui2-preview`
(`c874725c-78d8-43d5-a1b8-5d4d26e52067`). It accepts the product owner's Access
email only from `UI2_FIXTURE_EMAIL`, reads production only to resolve the
existing user identity, then writes a synthetic active `BASE UI Preview`
organization, `UI-2 Smoke Test` (`UI2-001`) project, active `org_admin` and
`project_manager` memberships, and one `Preview Test Document` draft revision.
It seeds no RFIs, files, issuances, or production-derived business data. The
matching cleanup command removes only its deterministic fixture rows. The
command verifies the exact `0001`–`0012` ledger, membership/project access,
Dashboard and Project Overview SQL, and the Records result. Production has no
write path in this workflow.

### Preview Project Overview investigation (2026-07-23)

An earlier unauthenticated request to the PR preview returned Cloudflare Access
`302 Found`, which could not test the Pages Function. The subsequent
product-owner authenticated smoke and direct D1 query established the actual
preview-schema mismatch documented above. The new guarded fixture supplies the
minimum Access identity and synthetic project used for the passing browser
retest; it does not alter the source route or its read model.

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

**Satisfied 2026-07-23:** the complete local gate, active Pages preview, and
the authenticated product-owner retest above meet every UI-2 exit criterion.

## 5. Phase status

| Phase                        | Status                     | Next gate                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------ |
| Spike 0 — Tabulator          | Complete; rejected for RFI | Future high-volume proposal only                 |
| UI-1 — Audit and decisions   | Complete                   | Binding documents and ADRs recorded              |
| UI-2 — CSS + React/Vite      | Complete; PR #41 ready     | Review/merge PR #41; retain rollback path        |
| UI-3 — Components + UI Lab   | Not started                | PR #36 reconciliation after PR #41 review/merge  |
| UI-4 — React shell           | Not started                | UI-3 shared patterns stable                      |
| UI-5 — RFI register          | Not started                | Controlled-table parity; no Tabulator dependency |
| UI-6 — Projects + Records    | Not started                | Shared register contract                         |
| UI-7 — Detail workspaces     | Not started                | Shared workspace contract                        |
| UI-8 — Dashboard/forms/admin | Not started                | Shared shell/forms/registers stable              |
| UI-9 — Library + Studio      | Not started                | Application foundation stable                    |
| UI-10 — Enforcement/cleanup  | Not started                | Route parity and visual baselines                |

## 6. Current constraints and risks

- Preview D1 schema remains isolated by the branch-compatible `0001`–`0012`
  migration set. The synthetic fixture is limited to one identity's minimum
  access path and can be removed with the guarded cleanup command when it is
  no longer needed.
- Official RFI issuance remains incomplete and must fail closed.
- Existing renderer output and valid definitions remain compatible.
- Browser capability presentation never replaces server authorization.
- The existing Cloudflare development/test dependency audit findings must be
  resolved or formally accepted before a production release; do not use
  `npm audit fix --force` without a review.

## 7. Next action

Review and merge PR #41 through the normal review workflow. Before UI-3,
reconcile PR #36 with the resulting current-main UI-2 foundation and record
the outcome. Do not merge this PR from this task.
