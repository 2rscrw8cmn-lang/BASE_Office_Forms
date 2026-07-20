# Document Control Workspace: Product and UX Specification

**Status:** Authoritative first-release product and UX specification<br>
**Applies to:** BASE Office Forms document-control workspace<br>
**Primary release:** First user-facing document-control vertical slice<br>
**Last reviewed against implementation:** 2026-07-20 (`/api/v2` through issuance integrity PR #12)
**Implementation rule:** This specification defines product behavior. Where it identifies an API gap, the UI must not simulate the missing behavior or infer authoritative state on the client.

## 1. Product objective and release boundary

The new project workspace is the primary product experience. It helps a document controller or project manager answer four questions without reconstructing history from files or filenames:

1. Which stable record am I working with?
2. Which exact revision is current, draft, or historical?
3. Which files belong to that exact revision?
4. What was permanently issued, when, and by whom?

The governing hierarchy is:

```text
Project
└── Record                 long-lived document identity
    ├── Revision           one immutable version of the record
    │   └── File           one immutable binary attached to that revision
    └── Issuance           permanent event selecting files from one published revision
```

An issuance is not a folder, mutable package, or live view of a record. It is a historical event with a server-assigned issue number, a snapshot of one published revision, and an ordered snapshot of selected files.

The existing Forms and Document Library experiences remain intact. They move visually beneath **Tools** and are not redesigned by this release. The renderer, its definition format, and existing renderer behavior remain unchanged.

### 1.1 First-release outcomes

The first release includes:

- global application navigation and project navigation;
- a cross-project Work Dashboard;
- project list and project overview;
- record creation for authorized users, records list, and record detail;
- current published revision, current draft, and revision history presentation;
- revision-scoped file list, upload, download, and selection for issuance;
- a dedicated issuance workflow, success state, project issuance list, and immutable issuance detail;
- desktop and mobile presentations for every included workflow;
- loading, empty, error, success, and authorization behavior.

### 1.2 Explicitly out of scope

Do not add or imply support for:

- renderer or existing Document Library redesign;
- email distribution or recipient management;
- transmittal PDFs or zipped issue packages;
- public or signed links;
- acknowledgements, signatures, or approval workflows;
- issuance retraction, cancellation, edit, or delete;
- AI features;
- search indexing or file-content search;
- OneDrive or other external storage integrations;
- notifications, comments, or offline synchronization;
- broad administration redesign;
- a full RFI redesign.

RFIs and Team remain project-navigation destinations, but their broader product redesign is not part of this document-control slice. Section 7.11 defines the limited integration contract.

## 2. Product language and entity rules

The interface must use these terms consistently on desktop, mobile, in empty states, and in errors.

| Term             | Meaning                                                                            | Must not be presented as                  |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Project          | The security and operational scope containing records and issuances                | A folder                                  |
| Record           | The stable, long-lived identity and metadata for a controlled document             | A revision or a binary file               |
| Revision         | One numbered version of a record with `draft`, `published`, or `superseded` status | The record itself                         |
| File             | An immutable binary attached to one exact revision                                 | A record-level attachment                 |
| Issuance         | A permanent project event containing selected files from one published revision    | A mutable package or the current revision |
| Document Library | The existing legacy/shared definition library under Tools                          | The project Records workspace             |

### 2.1 Display rules

- Use **Record** in workspace labels. Use the controlled `recordType` value for a human-friendly subtype such as Drawing or Report.
- Show `recordNumber` only when the API returns a non-null value. Never synthesize one from the record ID, title, or project number.
- Display revisions as `Revision {revisionLabel}` when a label exists; otherwise use `Revision {revisionNumber}`. The numeric revision remains available in metadata even when a label is primary.
- Always pair a revision reference with a text status: **Draft**, **Published**, or **Superseded**.
- A filename is never sufficient revision context. File rows and cards must appear inside a revision container or repeat the revision label in their accessible name.
- Use **Issue number** only for the server-returned `issueNumber`. Never display a predicted or locally generated number.
- Purpose labels are title case in the UI while canonical values are sent to the API.

### 2.2 Lifecycle invariants

- A record may change stable metadata while active; archiving makes it read-only for new revision and file work.
- A draft revision may be prepared and published. Publishing makes it the record's current published revision and supersedes the prior published revision.
- Published and superseded revision metadata is immutable.
- The target first-release product rule is that files may be uploaded only to a draft revision on an active record. Superseded revisions are read-only. The current API does not yet enforce the revision-status portion of this rule; this is a required release gap in section 10.
- Only a published revision can be issued.
- Issuance creation requires at least one file belonging to that exact published revision.
- An issuance, its revision snapshot, selected file snapshots, number, purpose, notes, issuer, and timestamp are permanent.

## 3. Device and density strategy

The product is desktop-first and mobile usable.

### 3.1 Desktop

Desktop is the primary environment for document control, sortable records and issuance tables, revision history, multi-file selection, issuance review, and project administration. The interface should use the available width for hierarchy and comparison rather than resemble an enlarged phone layout.

- Dashboard and project overview use comfortable spacing.
- Records and issuance tables use comfortably compact rows, approximately 52-60 px when one line of secondary metadata is present.
- Record detail and issuance forms use a readable content width with secondary metadata alongside on wide screens.
- Persistent global navigation and project context remain visible.

### 3.2 Mobile

Mobile intentionally supports:

- viewing projects and records;
- viewing revision and issuance history;
- opening and downloading files;
- uploading files to an eligible draft;
- selecting files and completing a straightforward issuance when authorized.

At phone width, do not squeeze, horizontally scroll, or selectively hide a desktop data table. Render semantic record, file, and issuance cards with the same vocabulary and data priority. Cards are compact but all interactive targets are at least 44 by 44 CSS pixels. Long filenames wrap or truncate visually while the complete filename remains available to assistive technology and via the metadata action.

### 3.3 Responsive thresholds

Continue the existing application thresholds:

- above 950 px: full desktop sidebar, project header, tabs, and tables;
- 621-950 px: compact sidebar or rail, reduced secondary columns, and preserved project tabs;
- 620 px and below: mobile application header, menu-triggered global navigation, stacked content, and card alternatives;
- the existing Studio-specific 760 px and 1050 px rules remain local to Studio and must not be repurposed as workspace-wide behavior.

## 4. Navigation and route model

Use hybrid navigation: a global left sidebar for application scope and project-level top navigation inside a selected project.

### 4.1 Global navigation

```text
Dashboard
Projects
Tools
├── Forms
└── Document Library
Administration            authorized users only
```

- **Dashboard** and **Projects** are primary destinations.
- **Tools** is a visually secondary group. Its children link to the preserved Forms and Document Library experiences.
- **Administration** appears only when the session is authorized. No broad administration redesign is included.
- Existing direct static URLs must continue to work during migration. New `/tools/...` routes may act as stable adapters rather than relocating or rewriting the legacy tools in the first PR.

### 4.2 Project navigation

Inside a project, display a `ProjectHeader` above the page content and these top tabs:

```text
Overview | Records | Issuances | RFIs | Team
```

The project name and `projectNumber` remain visible on every project route. The global sidebar and project tabs must be visually distinct: the sidebar changes application scope; the tabs change the view within the selected project.

On mobile, the project identity remains in the header and the project tabs use an accessible horizontally scrollable tab list. The selected tab must be scrolled into view. Do not collapse the project identity into an unlabeled back arrow.

### 4.3 Recommended routes

| Experience            | Canonical route                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Work Dashboard        | `/dashboard`                                                         |
| Project list          | `/projects`                                                          |
| Project overview      | `/projects/:projectId/overview`                                      |
| Records list          | `/projects/:projectId/records`                                       |
| Record detail         | `/projects/:projectId/records/:recordId`                             |
| Create issuance       | `/projects/:projectId/records/:recordId/revisions/:revisionId/issue` |
| Issuance success      | `/projects/:projectId/issuances/:issuanceId/created`                 |
| Project issuances     | `/projects/:projectId/issuances`                                     |
| Issuance detail       | `/projects/:projectId/issuances/:issuanceId`                         |
| Project RFIs          | `/projects/:projectId/rfis`                                          |
| Project Team          | `/projects/:projectId/team`                                          |
| Forms tool            | `/tools/forms`                                                       |
| Document Library tool | `/tools/document-library`                                            |

The application root should redirect to `/dashboard` after authentication. List search, filters, sort, and archive visibility belong in query parameters so back/forward navigation and shared internal URLs restore the view. Do not place mutation state or a provisional issue number in a URL.

### 4.4 First-release screen map

```text
Dashboard

Projects
└── Project
    ├── Overview
    ├── Records
    │   └── Record detail
    │       ├── Current published revision
    │       │   ├── Files
    │       │   └── Issue revision
    │       ├── Current draft, when present
    │       └── Revision history
    ├── Issuances
    │   └── Issuance detail
    ├── RFIs
    └── Team

Tools
├── Forms
└── Document Library
```

## 5. Existing visual system inventory and extension rules

The new workspace must look like the existing BASE application becoming more capable.

### 5.1 Current implementation inventory

| Area             | Existing implementation                                                                                                                                                                                               | Workspace direction                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color variables  | `--ink` `#232327`, `--accent` `#7a1e22`, `--accent-dk` `#5a1418`, `--mono` `#6f6f74`, `--field` `#bdbdc2`, `--divider` `#cdced2`, `--row` `#e4e4e8`, `--page-bg` `#e7e7ea`, `--hover` `#faf3f3`, and `--paper` `#fff` | Reuse these tokens. Promote repeated existing neutrals to semantic aliases only when implementing the shell; do not introduce an unrelated palette.                                                                                |
| Typography       | Archivo for application/body text; JetBrains Mono for metadata, small labels, and codes; Georgia is already used sparingly for workspace and panel headings                                                           | Keep Archivo dominant. Use JetBrains Mono for issue numbers, revision identifiers, and compact metadata. Reserve Georgia for page or section titles, not table content or controls.                                                |
| Spacing          | Existing controls and surfaces repeatedly use 8, 12-15, 18-24, and 27-30 px spacing                                                                                                                                   | Create a small spacing scale from those values during implementation. Avoid oversized 40-80 px consumer-app gaps inside operational screens.                                                                                       |
| Buttons          | White bordered quiet buttons, compact command buttons, maroon `.accent` primary actions, and explicit danger treatment                                                                                                | One primary action per region. Use maroon for the principal mutation; use bordered buttons or text links for secondary actions. Never use icon-only controls when the meaning is not universal.                                    |
| Forms            | Bordered white inputs/selects/textareas with modest 3-4 px radius and a subtle maroon focus ring                                                                                                                      | Reuse label-above-field structure, visible required/optional text, inline validation, and the existing focus treatment. Placeholder text is never the only label.                                                                  |
| Cards and panels | White surfaces, thin warm-gray borders, 3-7 px radii, very subtle shadows, and occasional maroon edge accents                                                                                                         | Use panels for hierarchy, not decorative metrics. Avoid gradients and large floating cards.                                                                                                                                        |
| Navigation       | Sticky white top bar, BASE logo, breadcrumb, search, and subdued separators                                                                                                                                           | Convert to a persistent global sidebar plus project header while preserving the same quiet chrome, logo scale, colors, and breadcrumbs where useful.                                                                               |
| Status           | Studio has text success/error tones; tags use maroon tint; no generalized status system exists                                                                                                                        | Add one reusable `StatusBadge` with text plus restrained color. Draft is maroon-outline or warm tint; Published uses the existing success green direction; Superseded and Archived are neutral. Color never carries meaning alone. |
| Responsive       | Shared shell breakpoints at 950 px and 620 px; Studio adds 1050 px and 760 px                                                                                                                                         | Preserve the shared thresholds and render explicit mobile cards. Do not simply hide important table columns.                                                                                                                       |
| Icons            | Small inline SVG line icons, generally 1.25-1.6 stroke, round line endings, current-color                                                                                                                             | Continue one inline line-icon style. Decorative icons use `aria-hidden="true"`; actionable icons require visible labels or accessible names.                                                                                       |
| Empty states     | `.library-empty`, `.search-empty`, and a dashed `.empty-state` panel                                                                                                                                                  | Reuse the quiet, centered treatment with a factual explanation and one relevant action when authorized.                                                                                                                            |
| Tables           | The library uses a CSS-grid table-like surface; documents use `.dtable`                                                                                                                                               | Use semantic `<table>` elements for new sortable desktop data grids, including captions or accessible labels and real headers. Render separate cards on mobile.                                                                    |
| Dialogs          | Studio provides a modal backdrop/card pattern                                                                                                                                                                         | Reserve dialogs for short confirmations or focused metadata. Issuance creation remains a dedicated full page.                                                                                                                      |

### 5.2 Workspace composition

- Use `--paper` surfaces over a warm, quiet workspace background.
- Keep content width generous for tables and constrained for forms.
- Use borders, alignment, typography, and whitespace before adding color.
- Do not use health scores, radial charts, generic KPI tiles, decorative gradients, or colors with no established semantic purpose.
- Status, record type, issue number, and revision label must remain legible at 200% zoom and in high-contrast modes.

## 6. Shared interaction, state, and accessibility rules

These behaviors apply to every first-release screen and are supplemented by screen-specific rules in section 7.

### 6.1 Data and refresh

- The API is authoritative. Do not report success or update an immutable state until the server confirms it.
- Show last-updated timestamps only when they come from a backend field with that meaning. Do not label `createdAt` as activity.
- Preserve useful loaded content during a background refresh. Use a small updating indicator rather than replacing the entire screen with a loader.
- Never reconstruct relationships by parsing filenames, storage paths, or IDs.
- Do not expose `organizationId`, storage keys, bucket names, R2 URLs, hashes by default, or infrastructure terms. A checksum may appear only in an intentional advanced file-metadata view.

### 6.2 Loading

- Initial page loads use skeleton rows, cards, or panels that match the expected layout and set `aria-busy="true"` on the containing region.
- Do not display a zero count while a count is loading.
- A file upload shows filename, progress when the browser can measure it, and a clear uploading state. Do not show scanning or processing because the current backend has no such lifecycle state.
- Final actions show an in-progress label, such as **Creating issuance...**, remain disabled while pending, and are never automatically retried.

### 6.3 Empty states

Distinguish:

- no objects exist: explain what belongs here and offer an authorized creation action;
- no search or filter matches: retain controls and offer **Clear filters**;
- no permission to mutate: explain that the screen is read-only without encouraging an action the user cannot perform;
- a lifecycle prevents mutation: explain the exact lifecycle reason.

### 6.4 Errors

Every recoverable error states:

1. what failed;
2. whether anything was saved;
3. what the user can do next;
4. the API `requestId` when available.

Keep entered form data and file selection after validation or server errors. A retry must not duplicate a permanent action. Inaccessible or cross-tenant projects follow the established not-found response; the UI shows a generic **Project not found** screen and does not reveal whether the project exists elsewhere.

### 6.5 Success feedback

- Non-navigation mutations use a concise status message in an `aria-live="polite"` region.
- Creation that changes the user's destination navigates to the created object or a dedicated success route.
- After navigation, move focus to the page heading or success heading.
- Do not rely on a transient toast as the only evidence of issuance creation.

### 6.6 Authorization and lifecycle

The UI reflects, but never replaces, backend authorization.

- Hide primary mutation actions when an authoritative capability response says the user cannot perform them.
- Do not infer permission solely from a role string in browser code. The backend currently combines organization role and active project assignment; section 10 requires a client-ready capability contract.
- Organization administrators and document-control administrators currently have organization-wide record, revision, file, and issuance management. An assigned project manager can perform those project mutations. Contributors and viewers can read assigned projects but cannot currently perform those mutations.
- If a visible action is rejected because authorization changed, remove the action after refresh and show the generic access message.
- If lifecycle prevents an action, keep the relevant context visible and state the reason, for example:
  - **Only published revisions can be issued.**
  - **Archived records cannot receive new uploads.**
  - **Superseded revisions are read-only.**

### 6.7 Keyboard and assistive technology

- All actions, menus, filters, tabs, file selection, and confirmations are keyboard operable.
- Focus order follows visual reading order; opening a menu or dialog moves focus into it and closing restores focus to its trigger.
- Use visible `:focus-visible` treatment based on the established maroon focus ring.
- Sort buttons announce column name and current direction through `aria-sort` on the relevant header.
- Status is text, not color alone. Icons that repeat visible text are hidden from assistive technology.
- Validation errors are associated with fields and summarized at the top of a submitted form.
- Tables use headers and a caption or programmatic accessible name. Mobile cards are lists with headings, not div-based table impersonations.
- Permanent-action copy is announced before the final button. The acknowledgement checkbox, when used, has the complete consequence in its label or description.

## 7. Screen specifications

### 7.1 Work Dashboard

| Contract          | Specification                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Answer **What needs my attention today?** across accessible projects.                                                                                                                                                                                                                                    |
| Primary user      | Document controller, project manager, contributor, or viewer with one or more project assignments.                                                                                                                                                                                                       |
| Route             | `/dashboard`                                                                                                                                                                                                                                                                                             |
| Required API data | One cross-project read model containing accessible project identity plus draft revisions, published revisions ready to issue, recent file uploads, recent issuances, assigned/active RFIs, and an explicit `reason` for every item. Recently accessed projects appear only after backend support exists. |
| Major components  | `AppSidebar`, `WorkspaceHeader`, `AttentionSection`, `WorkItem`, `StatusBadge`, `EmptyState`, `ErrorState`.                                                                                                                                                                                              |
| Primary actions   | Open the exact record, revision, issuance, file context, or RFI. **Issue revision** may appear only for an eligible item and authorized user.                                                                                                                                                            |
| Authorization     | The API returns only accessible projects and objects. Actions use server-provided capabilities. No client-side cross-project filtering is a security boundary.                                                                                                                                           |

**Desktop behavior:** Use a comfortable single content column or two balanced work queues, not a grid of KPI cards. Group by meaningful work state, with the most actionable groups first. Each item shows project name and number, object label, status, relevant timestamp, and one plain-language reason.

**Mobile behavior:** Use a single list of compact work cards. Project identity precedes record/revision identity. Secondary metadata stacks; the primary navigation target remains the whole card or a clearly labeled link.

**Reasons:** Use factual labels backed by state, including **Draft revision**, **Published, not yet issued**, **File uploaded recently**, and **RFI awaiting response**. Do not calculate urgency, risk, health, or priority without an authoritative rule.

- **Loading:** Skeleton group headings and 4-6 work rows; do not flash an empty dashboard.
- **Empty:** “Nothing currently needs your attention.” Follow with accessible projects, not invented metrics.
- **Error:** Keep any successfully loaded group, identify the failed group, and offer **Retry** with request ID.
- **Success feedback:** Returning from a mutation may highlight the resulting persisted item once and announce the update.
- **Accessibility:** Group headings define regions; every item has an accessible name containing project, object, and reason. Relative dates expose an absolute timestamp.

### 7.2 Project list

| Contract          | Specification                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Find and enter an accessible project workspace.                                                                                                                                                                                                            |
| Primary user      | Any authenticated user with project access.                                                                                                                                                                                                                |
| Route             | `/projects`; query parameters preserve `q`, `status`, `sort`, and archive visibility.                                                                                                                                                                      |
| Required API data | `id`, `projectNumber`, `name`, `status`, `description`, address summary when useful, `updatedAt`, and `archivedAt`. Current `GET /api/v2/projects` supports active accessible projects but has no search, filters, pagination, or archived-project option. |
| Major components  | `AppSidebar`, `PageHeader`, `ProjectSearch`, `ProjectFilters`, `ProjectsTable`, `ProjectCard`, `StatusBadge`, state components.                                                                                                                            |
| Primary actions   | Open project. Project creation is shown only to authorized users if included in the implementation PR; it uses the supported project create API and is not required to redesign project administration.                                                    |
| Authorization     | The backend list is already scoped to organization-wide readers or active project memberships. Administration and create controls require explicit capability.                                                                                             |

**Desktop behavior:** Use a sortable table with Project, Project number, Status, Updated, and an explicit **Open project** action. Default ordering may follow the current API's name ascending order; the active sort is always labeled.

**Mobile behavior:** Use cards with name, project number, status, and updated date. The card action is **Open project**.

**Search/filter/sort:** For the first small-data release, search may be case-insensitive client-side across name and project number after the full accessible list loads. Status filters use canonical project statuses with friendly labels. If volume requires pagination, move all search/filter/sort to the server together; never search only the current page.

- **Loading:** Table-row or card skeletons.
- **Empty:** “No projects are available to you.” Do not imply the organization has no projects.
- **Filtered empty:** “No projects match these filters,” with **Clear filters**.
- **Error:** Generic list failure, retry, and request ID.
- **Success feedback:** A newly created project, when that optional action is included, opens at its overview with a persisted success message.
- **Accessibility:** Semantic table and `aria-sort`; search has a visible label; card list headings contain project name and number.

### 7.3 Project overview

| Contract          | Specification                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Confirm project context and enter the correct project workflow quickly.                                                                                                                             |
| Primary user      | Any project member; mutation shortcuts vary by capability.                                                                                                                                          |
| Route             | `/projects/:projectId/overview`                                                                                                                                                                     |
| Required API data | Project detail; counts for active records, current drafts, published revisions, and issuances; recent project activity; attention items. The aggregates and activity read model do not exist today. |
| Major components  | `ProjectHeader`, `ProjectTabs`, `ProjectIdentity`, `ProjectAttentionList`, `RecentActivity`, `QuickActions`, state components.                                                                      |
| Primary actions   | **Find a record**, **Create record** when authorized, and contextual links to draft or published work.                                                                                              |
| Authorization     | Project not-found behavior is tenant-safe. Counts and activity include only objects visible to the current user. Mutation shortcuts use capabilities.                                               |

**Desktop behavior:** Put project name, project number, status, and concise metadata in the header. Use one attention list, one recent-activity list, and a small set of shortcuts. Four concise counts may appear in a single summary strip; do not repeat them as a wall of cards.

**Mobile behavior:** Stack identity, attention, shortcuts, and recent activity. Counts wrap in a compact two-column definition list, not separate oversized cards.

- **Loading:** Keep `ProjectHeader` identity skeleton separate from aggregate sections.
- **Empty:** A new project explains that it has no records yet and offers **Create record** only when authorized.
- **Error:** Project failure uses not-found semantics where appropriate; partial aggregate failure retains identity and offers section-level retry.
- **Success feedback:** Recently created records or completed issuances may be highlighted only from persisted results.
- **Accessibility:** Counts use descriptive labels; activity entries include actor/action/object/time as text; shortcuts are real links whenever they navigate.

### 7.4 Records list

| Contract          | Specification                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Scan, search, filter, sort, and open stable records without confusing them with revisions.                                                                                                                                                                                                                                    |
| Primary user      | Document controller and project manager; all project readers can use the list.                                                                                                                                                                                                                                                |
| Route             | `/projects/:projectId/records`; preserve `q`, `type`, `discipline`, `revisionStatus`, `archived`, `sort`, and `direction`.                                                                                                                                                                                                    |
| Required API data | Record `id`, non-null `recordNumber` when present, `title`, `recordType`, `discipline`, `status`, current published revision label/number/status, draft presence, file count where supported, and a correctly labeled `updatedAt` or latest activity. Current list lacks the revision summary, file count, and activity join. |
| Major components  | `ProjectHeader`, `ProjectTabs`, `RecordsToolbar`, `RecordsTable`, `RecordCard`, `StatusBadge`, state components.                                                                                                                                                                                                              |
| Primary actions   | Open record; **Create record** when authorized. Row menus may contain only supported actions, such as archive for an eligible active record.                                                                                                                                                                                  |
| Authorization     | Read is project-scoped. Create, update, and archive controls require server capabilities. Archived state, not missing permission, explains lifecycle restrictions.                                                                                                                                                            |

**Desktop columns:**

1. Record title, with record number only when non-null;
2. Record type;
3. Discipline, when present;
4. Current revision;
5. Current revision status;
6. File count, only when returned by the summary API;
7. Updated or latest activity, labeled according to the source field;
8. Actions.

Default sort is Updated newest first once the summary API supplies a trustworthy field. Until then, use the current API order and label it **Created: newest first**. Sorting never silently changes when filters change.

**Mobile behavior:** Render a `RecordCard` with title, optional record number, type/discipline, current revision and text status, optional file count, and updated date. Do not render or horizontally scroll the desktop table.

**Search:** Trim whitespace and match case-insensitively against title, non-null record number, record type label, and discipline. Debounce only if search becomes server-backed. Clearing search restores the full current filter set.

**Filters:** Type and revision status are controlled values; discipline options come from returned data or a future controlled list. Archived records are excluded by default. When shown, they are clearly labeled and sort with the selected order rather than in a hidden secondary list.

- **Loading:** Table-row or card skeletons plus disabled toolbar controls until data is ready.
- **Empty:** “No records have been created for this project.” Authorized users see **Create record**.
- **Filtered empty:** Preserve toolbar and show **Clear filters**.
- **Error:** Retry without losing query state; show request ID.
- **Success feedback:** Creation opens the record detail. Archive removes or relabels the row according to archive visibility and announces success.
- **Accessibility:** Use `<table>` and `aria-sort`; row actions have the record title in their accessible name; cards form a semantic list; filters are labeled and keyboard operable.

### 7.5 Record detail, revisions, and files

| Contract          | Specification                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Present stable record metadata separately from exact revision content, files, and issuance history.                                                                                                                                                                                                                                                                 |
| Primary user      | Project reader; document controllers and assigned project managers receive eligible mutation actions.                                                                                                                                                                                                                                                               |
| Route             | `/projects/:projectId/records/:recordId`; a `revision` query parameter may deep-link and expand a historical revision without changing entity identity.                                                                                                                                                                                                             |
| Required API data | Record detail; ordered revisions; current published revision resolved from `currentRevisionId`; current draft; per-revision files; related issuance summaries; publication actor/time when available; action capabilities and lifecycle reasons. Current endpoints require a request waterfall and lack publication metadata and a singular current-draft contract. |
| Major components  | `RecordHeader`, `RecordMetadata`, `CurrentRevision`, `RevisionPanel`, `RevisionHistory`, `FileList`, `FileCard`, `FileUploadControl`, `StatusBadge`, `IssuanceSummary`, state components.                                                                                                                                                                           |
| Primary actions   | **Create draft revision**, **Upload file**, **Publish revision**, **Download**, **View metadata**, select eligible files, and **Issue revision**, each only when supported and authorized.                                                                                                                                                                          |
| Authorization     | Readers see all accessible historical revisions and files. Mutation controls require capabilities. Lifecycle messages are visible when useful; permission-only controls are absent.                                                                                                                                                                                 |

**Information hierarchy:**

1. `RecordHeader`: stable title, optional record number, record type, discipline, active/archived status, and record description.
2. `CurrentRevision`: current published revision in the most prominent revision panel. If none exists, state **No published revision**.
3. Current draft in a separate, clearly labeled work panel when present.
4. Collapsed or secondary historical revisions in descending revision number.
5. Related issuance history or a link to the project issuance list filtered to this record.

Record metadata and revision metadata must never share an unlabeled definition list. Repeat **Record details** and **Revision details** headings even when field names overlap.

**Revision presentation:** Show number/label, title, text status, change summary, creator and creation time, publication actor/time when the API supports it, associated files, and allowed actions. Draft uses a warm maroon-tint or outline and explicit **Draft** heading. Published uses the established success direction and **Published** text. Superseded uses a quiet neutral treatment and remains fully readable.

**Desktop file presentation:** Use a compact semantic table within the exact `RevisionPanel`: selection checkbox when issuance-eligible, filename, media type, formatted size, uploaded by/time, and actions. The selection header says **Select files from this revision**. Selection cannot span revisions.

**Mobile file presentation:** Use `FileCard` items inside the revision panel. Put the checkbox, filename, media type/size, upload metadata, and a labeled action menu in a 44 px touch layout. A sticky bottom action may show **Issue revision (3 files)** after selection, but it must not obscure content or safe areas.

**File actions:**

- **View metadata** opens a focused drawer or inline disclosure; it does not expose storage infrastructure.
- **Download** uses the authenticated content endpoint and preserves the server-provided filename.
- **Upload file** appears only on the current draft of an active record after the required backend lifecycle enforcement exists.
- **Issue revision** appears only on a published revision with at least one file and issuance permission.
- Superseded revisions are read-only.

- **Loading:** Load stable record identity first when possible, then revision panels. Each file region owns its loading state; the target aggregate endpoint should normally make this one request.
- **Empty:** Distinguish no revisions, no published revision, draft with no files, and historical revision with no files. A draft with no files may offer **Upload file**.
- **Error:** A failed revision/file region stays associated with its revision and offers retry; a record-level 404 uses the generic not-found screen.
- **Success feedback:** Upload inserts only the server-returned file and announces it; publication refreshes all statuses and `currentRevisionId`; download uses browser download feedback without a false application success.
- **Accessibility:** Revision panels use headings that include label and status; collapsed history uses buttons with `aria-expanded`; file checkboxes include filename and revision in their names; status and selection counts are announced.

### 7.6 File upload interaction

| Contract          | Specification                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Attach one binary to the exact eligible draft revision without obscuring ownership or state.                                                                                                                                                       |
| Primary user      | Authorized document controller, organization administrator, or assigned project manager.                                                                                                                                                           |
| Route             | Embedded in record detail for the exact revision; API route is `/api/v2/projects/:projectId/records/:recordId/revisions/:revisionId/files`.                                                                                                        |
| Required API data | Record and revision eligibility, upload capability, maximum size, accepted request shape, and returned file metadata. The current endpoint accepts one multipart `file`, rejects zero-byte or over-50-MB content, and has no media-type whitelist. |
| Major components  | `FileUploadControl`, native file input/drop target, `UploadProgress`, inline validation, success/error status.                                                                                                                                     |
| Primary actions   | **Choose file**, **Upload file**, **Cancel** before request submission, and **Retry** after a non-permanent failure.                                                                                                                               |
| Authorization     | UI eligibility comes from capability plus lifecycle. The API must enforce active record plus draft revision; current API enforces only active record and permission.                                                                               |

**Desktop behavior:** The control may be an inline panel or focused drawer opened from the draft revision. Show project, record, and revision context above the file selector. Drag and drop supplements, not replaces, the native input.

**Mobile behavior:** Use the native picker with camera/files options supplied by the device. Do not require drag and drop. Keep context and filename visible during upload.

- **Loading/progress:** Show queued locally, uploading, complete, or failed. Do not claim scanning/processing/ready states the backend does not provide.
- **Empty:** Native file input begins empty with size limit text.
- **Error:** Preserve selected filename when the browser permits; explain zero-byte, size, missing name/type, authorization, lifecycle, and server consistency errors in user language; include request ID.
- **Success feedback:** Close or reset the control only after the 201 response, place the returned file in the exact revision list, and announce **File uploaded to Revision X**.
- **Accessibility:** Drop zone is also a labeled button/input; progress is programmatically exposed; errors are associated; touch target is at least 44 px.

### 7.7 Create issuance

| Contract          | Specification                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Review selected files from one exact published revision and create a permanent issuance.                                                                                                                                  |
| Primary user      | Organization administrator, document-control administrator, or assigned project manager.                                                                                                                                  |
| Route             | `/projects/:projectId/records/:recordId/revisions/:revisionId/issue`; repeated selected `fileId` query parameters may restore pre-creation selection, but are never authoritative.                                        |
| Required API data | Project identity, record identity, exact published revision, all selected file metadata, allowed purposes, issue capability, and lifecycle eligibility. Final POST returns persisted issuance and generated issue number. |
| Major components  | `ProjectHeader`, `IssuanceReview`, `SelectedFileList`, `IssuancePurposeField`, notes field, `ConfirmPermanentAction`, inline error summary.                                                                               |
| Primary actions   | **Create issuance** and **Back to record**. There is no save draft, preview number, reserve number, edit issuance, or automatic retry.                                                                                    |
| Authorization     | The route may be viewed only when the user can issue; direct access revalidates project, record, revision, file membership, and capability. Backend remains authoritative.                                                |

The page displays, in order:

1. project name and number;
2. record title and optional record number;
3. exact published revision label/number and **Published** status;
4. selected filenames, media types, and formatted sizes;
5. controlled Purpose field;
6. optional Notes field, which becomes required for Other;
7. the permanent-action warning;
8. acknowledgement and final action.

Purpose mapping:

| UI label         | API value          |
| ---------------- | ------------------ |
| For information  | `for_information`  |
| For review       | `for_review`       |
| For approval     | `for_approval`     |
| For construction | `for_construction` |
| As recorded      | `as_recorded`      |
| Other            | `other`            |

When **Other** is selected, mark Notes required immediately and explain why. The backend remains the final validator.

Display this text verbatim beside the final action:

> Issuing creates a permanent project record. The selected revision and files cannot be edited or removed from this issuance.

Require an unchecked acknowledgement labeled **I understand this issuance is permanent** before enabling **Create issuance**. This acknowledgement is interaction friction, not a security control.

Do not display an issue number before the 201 response. On submit, disable the action and label it **Creating issuance...**. Do not auto-retry after a timeout because the current POST has no client idempotency contract. If the result is unknown, explain that the user should check Issuances before trying again.

- **Desktop behavior:** Use a centered, comfortable form with review summary and selected-files panel; do not use a modal.
- **Mobile behavior:** Stack all content, repeat the exact revision near selected files, and keep the final action visible only after the user reaches the warning; do not hide review content behind accordions.
- **Loading:** Re-fetch and validate all referenced files; show a page skeleton, not a provisional form.
- **Empty/invalid selection:** Explain that at least one file from the published revision is required and link back to that revision.
- **Error:** Retain purpose, notes, and selection; map eligibility errors to their exact reason; include request ID. Unknown-result errors instruct the user to check the issuance list.
- **Success feedback:** Navigate from the confirmed response to the dedicated success route using the returned `issuance.id`; never derive the URL from a predicted number.
- **Accessibility:** Error summary links to fields; file list has a programmatic label; warning is associated with acknowledgement and action; focus moves to first error or success heading.

### 7.8 Issuance success

| Contract          | Specification                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Provide durable confirmation that issuance creation succeeded and reveal the generated number.                                           |
| Primary user      | The user who created the issuance.                                                                                                       |
| Route             | `/projects/:projectId/issuances/:issuanceId/created`                                                                                     |
| Required API data | Persisted issuance detail loaded by ID, including `issueNumber`, record/revision snapshot summary, purpose, issuer/time, and file count. |
| Major components  | `SuccessState`, `IssueNumber`, concise issuance summary, links to immutable detail and record.                                           |
| Primary actions   | **View issuance** and secondary **Back to record**.                                                                                      |
| Authorization     | Standard issuance read access; the route is not proof of success without a successful detail fetch.                                      |

**Desktop/mobile behavior:** Make the server-generated issue number the visual and spoken focus. Keep the summary compact and identical across devices. Refreshing this route performs a GET only and can never create another issuance.

- **Loading:** Skeleton the issue number and summary while loading by ID.
- **Empty/not found:** Use normal inaccessible/not-found behavior; never show a stale number from client memory.
- **Error:** Explain that creation was confirmed only if the prior response was confirmed; provide **View project issuances** and retry.
- **Success feedback:** The page itself is durable feedback; a toast is optional and insufficient alone.
- **Accessibility:** Focus the success heading, announce `Issue {issueNumber} created`, and use descriptive link text.

### 7.9 Project issuance list

| Contract          | Specification                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Browse permanent issuance history for one project.                                                                                                                                                                   |
| Primary user      | Any authorized project reader.                                                                                                                                                                                       |
| Route             | `/projects/:projectId/issuances`; preserve `q`, `purpose`, `record`, and sort query parameters.                                                                                                                      |
| Required API data | Issue number, record display identity, revision display identity, purpose, issuer display name, issued time, and file count. Current API returns IDs instead of joined record/revision labels and user display name. |
| Major components  | `ProjectHeader`, `ProjectTabs`, permanent-history notice, `IssuancesTable`, `IssuanceCard`, `StatusBadge` or purpose label, state components.                                                                        |
| Primary actions   | Open immutable issuance detail. No edit, delete, retract, or cancel controls.                                                                                                                                        |
| Authorization     | Project read access. List is tenant scoped and remains readable across record/revision lifecycle changes while the user retains project access.                                                                      |

**Desktop columns:** Issue number, Record, Revision, Purpose, Issued by, Issued date, File count. Default order is newest issue sequence first, matching the current API. Issue numbers use JetBrains Mono and are links.

**Mobile behavior:** Cards show issue number first, then record, revision, purpose, issuer/date, and file count. Use **View issuance**; do not compress the table.

A short persistent notice says **Issuance history is permanent. Issuances cannot be edited or deleted.**

- **Search/filter/sort:** Search issue number and returned record display text. Filter by canonical purpose with friendly labels. Newest first is default; the active order is explicit. Server-side search/pagination may be deferred for small datasets but must be added before partial-page client filtering.
- **Loading:** Row/card skeletons; no zero history count during load.
- **Empty:** “No issuances have been created for this project.” Do not offer a global create button because creation begins from an eligible published revision.
- **Error:** Retry and request ID while retaining filters.
- **Success feedback:** Return from creation may focus/highlight the new persisted row once.
- **Accessibility:** Semantic table, `aria-sort`, complete card headings, absolute issued timestamp, and permanent-history notice as normal readable text rather than an alert on every visit.

### 7.10 Issuance detail

| Contract          | Specification                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Present an immutable historical snapshot, not a live view of the record's current revision.                                                                                                                                                               |
| Primary user      | Any authorized project reader.                                                                                                                                                                                                                            |
| Route             | `/projects/:projectId/issuances/:issuanceId`                                                                                                                                                                                                              |
| Required API data | Issue number, purpose, notes, issuer display name/time, safe revision snapshot fields, and snapshotted file metadata with an issuance-scoped download action. Current serialization omits the revision snapshot and has no issuance-scoped file download. |
| Major components  | `ProjectHeader`, `ImmutableHistoryBanner`, `IssuanceHeader`, `RevisionSnapshot`, `IssuedFileList`, `IssuanceSummary`, state components.                                                                                                                   |
| Primary actions   | Download an included file, open the stable record in a separate action, or return to issuances. No mutation actions.                                                                                                                                      |
| Authorization     | Project issuance read access. Do not re-check current record or revision status as a condition for reading history.                                                                                                                                       |

The page must say **Historical issuance snapshot** near the issue number. Present snapshot fields under **Revision at time of issue**. If the current record title or revision has since changed or been superseded, do not replace snapshot text with live values. A separate **View current record** link may show the stable record identity but must not visually merge live data into the snapshot.

Files are labeled **Files included in this issuance** and use snapshotted filename, media type, byte size, and display order. Do not expose storage keys, bucket details, R2 URLs, or raw snapshot JSON. No edit, delete, replace, retract, cancel, or reissue-from-here control appears.

- **Desktop behavior:** Use a comfortable two-column metadata summary above a compact file table.
- **Mobile behavior:** Stack snapshot metadata and file cards; keep issue number and permanent state at the top.
- **Loading:** Snapshot-shaped skeleton; never substitute the current revision while loading.
- **Empty:** A valid issuance cannot have zero files; treat that result as an integrity error, not an empty state. Optional notes may truthfully show **No notes provided**.
- **Error:** Generic inaccessible/not-found behavior for 404; integrity failures explain that the historical record could not be loaded and include request ID.
- **Success feedback:** Downloads use browser feedback. This read-only screen has no mutation success state.
- **Accessibility:** Page title includes issue number; snapshot and live-record link are clearly separated by headings; file actions include filename; metadata uses semantic description lists.

### 7.11 RFIs, Team, Tools, and Administration integration

These destinations are part of navigation architecture but are not redesigned in this document-control slice.

| Destination      | First-release behavior                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RFIs             | Preserve a project-scoped `/projects/:projectId/rfis` destination. A basic existing-API-backed list may be moved under the new project shell in a separately approved PR; do not redesign its lifecycle, issue flow, or detail experience as part of PRs A-E.                  |
| Team             | Reserve `/projects/:projectId/team` for project membership and contacts. Current `/contacts` data is not equivalent to project membership/capabilities, so do not label contacts as authorized team members. Shipping substantive Team content requires a combined read model. |
| Forms            | Link from Tools to the preserved Forms experience. No renderer or form-authoring changes.                                                                                                                                                                                      |
| Document Library | Link from Tools to the preserved shared library. Do not merge legacy library documents into project Records on the client.                                                                                                                                                     |
| Administration   | Show only with authoritative authorization. This release may link to an existing surface; it does not redesign administration.                                                                                                                                                 |

If a destination has no implemented surface at release time, navigation must use the approved rollout/feature-availability mechanism. Do not ship a fake data screen or a dead link.

## 8. Component inventory

Names are recommendations, not mandatory implementation names. Behavior and boundaries are mandatory.

| Component                | Responsibility                                                 | Reuse notes                                               |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| `AppSidebar`             | Global destinations, Tools grouping, authorized Administration | Desktop persistent; mobile menu; never owns project tabs  |
| `WorkspaceHeader`        | Page title, user/session affordance, optional global context   | Continue BASE logo and quiet chrome                       |
| `ProjectHeader`          | Project name, project number, status, breadcrumbs              | Present on every project route                            |
| `ProjectTabs`            | Overview, Records, Issuances, RFIs, Team                       | Accessible tab-like navigation links, mobile scroll       |
| `StatusBadge`            | Text plus restrained lifecycle color                           | Record, revision, project statuses; no color-only meaning |
| `RecordsTable`           | Sortable desktop record data                                   | Semantic table only                                       |
| `RecordCard`             | Mobile equivalent of record row                                | Same fields and vocabulary                                |
| `RevisionPanel`          | One exact revision and its actions/files                       | Heading always includes revision and status               |
| `RevisionHistory`        | Secondary/collapsible prior revisions                          | Preserves deep links and keyboard state                   |
| `FileList`               | Desktop files for one exact revision                           | Selection cannot cross revision boundary                  |
| `FileCard`               | Mobile file item                                               | 44 px actions, complete accessible filename               |
| `FileUploadControl`      | One-file multipart upload with progress and state              | Draft + active record only after backend enforcement      |
| `IssuancePurposeField`   | Friendly labels mapped to canonical values                     | Notes dependency for `other`                              |
| `IssuanceReview`         | Project/record/revision/files review before issuance           | Full-page composition                                     |
| `IssuanceSummary`        | Read-only persisted issuance metadata                          | Used in list, success, and detail with snapshot mode      |
| `ConfirmPermanentAction` | Consequence copy, acknowledgement, final action                | Exact warning; no issue-number preview                    |
| `EmptyState`             | Factual no-data or no-match state                              | At most one authorized primary action                     |
| `ErrorState`             | Failure, save status, next action, request ID                  | Can be page or section scoped                             |
| `LoadingState`           | Shape-preserving skeleton and `aria-busy`                      | Never presents false zeroes                               |

Keep data fetching and authorization decisions outside purely visual components. Components receive domain-specific view models and explicit actions; they do not parse API IDs or duplicate role logic.

## 9. Current `/api/v2` support

All JSON endpoints use `{ data, meta: { requestId } }` on success and `{ error: { code, message, requestId } }` on failure. File content is streamed directly with authenticated, private, no-store headers.

### 9.1 Workflows supported today

| Workflow         | Current endpoint(s)                                                                                                                        | UI-relevant behavior                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session context  | `GET /api/v2/session`                                                                                                                      | Returns user ID, organization, membership role, and project permission data; not yet a normalized per-action capability contract                                                                  |
| Projects         | `GET/POST /api/v2/projects`; `GET/PATCH /api/v2/projects/:projectId`                                                                       | Accessible active projects list, create, detail, and update                                                                                                                                       |
| Project contacts | `GET/POST /api/v2/projects/:projectId/contacts`; `PATCH .../contacts/:contactId`                                                           | Contacts are not equivalent to membership/team authorization                                                                                                                                      |
| Records          | `GET/POST /api/v2/projects/:projectId/records`; `GET/PATCH .../records/:recordId`; `POST .../archive`                                      | `includeArchived` is the only list option; record number is nullable; list is created-newest first                                                                                                |
| Revisions        | `GET/POST .../records/:recordId/revisions`; `GET .../revisions/:revisionId`; `POST .../publish`                                            | Server numbers revisions; list is revision-number descending; publishing supersedes the prior published revision and updates `currentRevisionId`                                                  |
| Files            | `GET/POST .../revisions/:revisionId/files`; `GET .../files/:fileId`; `GET .../files/:fileId/content`                                       | One multipart file up to 50 MB; metadata list; private streamed download; no storage infrastructure in responses                                                                                  |
| Issuances        | `GET /api/v2/projects/:projectId/issuances`; `GET .../issuances/:issuanceId`; `POST .../records/:recordId/revisions/:revisionId/issuances` | Published revision only; nonempty exact-revision file selection; controlled purpose; Other requires notes; number assigned only during atomic successful creation; immutable snapshot persistence |
| RFIs             | Project-scoped list/detail/draft/update and issue/respond/close/reopen routes                                                              | Backend foundation exists; full RFI UI redesign is outside this slice                                                                                                                             |

### 9.2 Important current constraints

- Project, record, revision, file, and issuance list endpoints are unpaginated.
- Project list excludes archived projects and sorts by name.
- Record list can include archived records but has no server search/filter/sort beyond archive inclusion.
- Revision list is newest revision number first.
- File list is oldest upload first.
- Issuance list is newest issue sequence first.
- The issuance list returns record/revision/user IDs rather than user-facing joined labels.
- The issuance detail domain contains a revision snapshot, but the current HTTP serializer does not return it.
- The revision model has no publication actor or publication timestamp fields.
- More than one draft revision can currently be created for a record; the model has no `currentDraftRevisionId`.
- File upload currently checks active record and mutation permission but does not restrict revision status. It can therefore accept a file on a published or superseded revision, contrary to the target first-release UX invariant.
- File and issuance reads remain available after archival/supersession while current project access remains valid.

## 10. API and backend gap analysis

The UI must not work around required gaps with request waterfalls, role duplication, guessed timestamps, or client-created state.

| ID  | Gap and recommended contract                                                                                                                                                                                                           | Classification                 | Why it matters                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Add a cross-project Work Dashboard read model, for example `GET /api/v2/dashboard/work`, returning item type, project identity, object identity, display fields, timestamp, reason code/label, target URL inputs, and allowed actions. | **Required for first release** | No current endpoint can efficiently provide drafts, ready-to-issue revisions, recent files/issuances, and active RFIs across accessible projects. |
| G2  | Add `GET /api/v2/projects/:projectId/overview` with record/draft/published/issuance counts, recent significant activity, attention items, and capabilities.                                                                            | **Required for first release** | Project detail has no aggregates or activity projection. Client fan-out would be slow and inconsistent.                                           |
| G3  | Enrich the records list or add a record-summary view containing current published revision display/status, draft presence, file count, and correctly defined latest activity.                                                          | **Required for first release** | Candidate desktop/mobile fields otherwise require per-record revision and file requests.                                                          |
| G4  | Add one record-workspace detail read model containing record, ordered revisions, revision-scoped files, related issuance summaries, publication metadata, and lifecycle/action capabilities.                                           | **Required for first release** | Current nested endpoints create a request per revision and still cannot supply publication metadata or related issuance display data.             |
| G5  | Return normalized capabilities and lifecycle eligibility such as `canCreateRevision`, `canUploadFile`, `canPublishRevision`, `canIssueRevision`, and unavailable reason codes at project/object scope.                                 | **Required for first release** | Browser code must not duplicate role plus active-membership authorization or confuse permission with lifecycle.                                   |
| G6  | Enrich issuance summaries with record title/optional number, revision label/number/title, and issuer display name.                                                                                                                     | **Required for first release** | The specified issuance list cannot display professional labels from IDs alone without waterfalls.                                                 |
| G7  | Return the safe `revisionSnapshot` fields on issuance detail and provide issuance-scoped file downloads, for example `GET .../issuances/:issuanceId/files/:fileId/content`.                                                            | **Required for first release** | Immutable detail must render and download from the issuance context rather than reconstruct a live revision view. Storage keys remain private.    |
| G8  | Establish one authoritative current-draft rule: enforce at most one draft per record and expose it, or explicitly support plural drafts and revise the product model. The first-release target is one current draft.                   | **Required for first release** | The UI cannot truthfully select a singular current draft from potentially multiple drafts.                                                        |
| G9  | Enforce file upload only on draft revisions of active records and return stable lifecycle errors for published/superseded revisions.                                                                                                   | **Required for first release** | Hiding upload in the UI does not preserve immutable revision semantics or make superseded revisions read-only.                                    |
| G10 | Add idempotency/replay protection for issuance creation using a client-supplied idempotency key scoped to actor/project/operation, with the original persisted result returned on replay.                                              | **Required for first release** | A timeout or double submission of a permanent action can otherwise create two valid issuances. Client button disabling is insufficient.           |
| G11 | Add publication actor/time to the revision read model, derived authoritatively from durable activity or persisted publication metadata.                                                                                                | **Required for first release** | The revision screen is required to show publication information when available; `createdAt` cannot be relabeled as publication time.              |
| G12 | Add server search/filter/sort/pagination to project, record, and issuance lists once result sizes exceed the small-data threshold; return total/next cursor metadata.                                                                  | **Helpful but deferrable**     | Initial complete-list client operations are acceptable only while lists are intentionally small. Client filtering a partial page is prohibited.   |
| G13 | Add a recent-project-access event/read model before showing Recently accessed projects.                                                                                                                                                | **Helpful but deferrable**     | No current backend state supports the claim. Until then, omit the section.                                                                        |
| G14 | Add a Team read model joining project memberships, user display information, roles/capabilities, and separately labeled project contacts.                                                                                              | **Helpful but deferrable**     | Contacts cannot safely be presented as authorized team members. Team content is outside this slice.                                               |
| G15 | Add resumable uploads, processing/scanning lifecycle, thumbnails/previews, and file-role metadata only as separately designed backend features.                                                                                        | **Future scope**               | The current API supports one complete immutable upload and download, not these states.                                                            |
| G16 | Add global indexed search, notifications, delivery/recipient management, transmittals, acknowledgements, and retention administration only in later product specifications.                                                            | **Future scope**               | These are explicitly outside the first release and must not be simulated client-side.                                                             |

### 10.1 Required read-model principle

Prefer a small number of task-shaped read endpoints over a client waterfall:

```text
Dashboard             -> 1 cross-project work read
Project overview      -> 1 project summary read
Records list          -> 1 record-summary list read
Record detail         -> 1 record workspace read
Issuance list/detail  -> 1 joined list read / 1 immutable snapshot read
```

Existing transactional endpoints remain the write authority. Read models may project those same domain records and activity events; they must not invent a second lifecycle.

## 11. Recommended implementation sequence

Backend read-model and integrity gaps required by a UI PR should land first or in separately reviewable prerequisite PRs. Do not hide a missing contract inside a large frontend change.

### PR A - Application shell and navigation

- Add the desktop sidebar, mobile global menu, application route handling, workspace header, `ProjectHeader`, and `ProjectTabs`.
- Move Forms and Document Library visually under Tools through stable links/adapters while preserving their files and behavior.
- Establish shared focus, state, status, button, table, card, and error primitives grounded in `base.css`.
- Do not include dashboard read-model simulation or substantive RFIs/Team redesign.

### PR B - Dashboard and projects

- Add Work Dashboard after G1.
- Add project list from the existing project API.
- Add project overview after G2.
- Include factual reason labels and project-level loading/empty/error states.

### PR C - Records and record detail

- Add records search/filter/sort, desktop table, mobile cards, record creation, and stable record metadata.
- Consume G3 and the record portion of G4.
- Establish archive presentation and tenant-safe not-found behavior.

### PR D - Revisions and files

- Add current published revision, current draft, revision history, revision-scoped desktop/mobile file presentation, upload, download, and publish actions.
- Land G5, G8, G9, and G11 before enabling mutations.
- Verify every file action retains exact revision context.

### PR E - Issuance workflow and history

- Add file selection, full-page review, purpose/notes validation, permanent-action confirmation, success route, issuance list, and immutable detail.
- Require G6, G7, and G10 before production enablement.
- Verify issue number appears only from the successful response and no edit/delete controls exist.

### PR F - Responsive, accessibility, and polish pass

- Test keyboard-only use, screen-reader names, focus restoration, 200% zoom, reduced motion, contrast, touch targets, phone cards, long content, and slow/error states.
- Verify no desktop table is rendered at phone width.
- Include cross-screen consistency fixes only; avoid adding new workflow scope.

### 11.1 Combination recommendation

The current frontend is small, static, and framework-free, so the first workspace work must establish routing and reusable UI boundaries carefully. Do **not** combine PR A with PR B: shell architecture and dashboard read models deserve separate review. Keep PR E separate because it contains the permanent transaction.

PR C and PR D may be combined into one records vertical-slice PR if the resulting diff remains reviewable. Record detail has little product value without revision/file hierarchy, and combining them avoids a temporary detail screen that misrepresents the model. If combined, retain separate commits and acceptance sections for list/stable-record behavior versus revision/file lifecycle. Keep PR F separate in all cases; accessibility and responsive behavior are acceptance work, not optional cleanup.

## 12. Release acceptance criteria

The first user-facing document-control slice is accepted only when:

1. A user lands on a factual cross-project dashboard and every item states why it appears.
2. Global navigation and project navigation are visually and semantically distinct.
3. Project name and project number remain visible on every project screen.
4. Desktop record and issuance lists use sortable semantic tables, while phone layouts use dedicated cards with the same terminology and data.
5. A record's stable metadata is visibly separate from revision metadata.
6. Current published, current draft, and superseded revisions cannot be mistaken for one another.
7. Every file is visibly and programmatically attached to one exact revision.
8. Upload, publish, issue, and administrative actions appear only with authoritative permission and lifecycle eligibility; backend enforcement matches the UI.
9. An authorized user can upload a file to a draft and download it on desktop and mobile.
10. An authorized user can select files from one published revision, review exact context, choose a canonical purpose, acknowledge permanence, and create one issuance.
11. No issue number is shown or reserved before successful creation.
12. The success state prominently shows the server-generated issue number and links to immutable detail.
13. Issuance detail renders safe snapshot data and contains no edit, delete, retract, or cancel controls.
14. Inaccessible projects use generic not-found behavior without cross-tenant disclosure.
15. Loading, empty, filtered-empty, error, unknown-result, and success states are implemented for every included screen.
16. Keyboard navigation, visible focus, text status, labels, semantic tables, mobile cards, announcements, contrast, and 44 px touch targets pass review.
17. Forms, Document Library, and the renderer continue to behave as before.

This document is the product and UX source of truth for the first document-control UI implementation. Later specifications may extend it, but implementation PRs must not silently replace these entity boundaries, lifecycle guarantees, or permanent-action rules.
