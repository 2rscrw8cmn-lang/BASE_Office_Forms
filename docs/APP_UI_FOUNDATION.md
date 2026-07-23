# BASE Application UI Foundation

**Status:** Binding application design direction
**Owner:** Product/architecture
**Applies to:** Authenticated application workspace, Studio controls, and Document Library application chrome
**Does not replace:** `public/engine.js`, controlled-document definitions, or official document output

## 1. Purpose

The application must look and behave like one coherent construction operations platform. Individual features may not invent their own page headers, buttons, badges, forms, filters, dialogs, tables, spacing, or responsive rules.

The immediate problem is structural inconsistency:

- controlled-document CSS and application CSS are loaded together;
- application patterns exist mainly as repeated markup and CSS conventions rather than reusable components;
- similar controls change size and appearance based on feature-specific selectors;
- feature modules reproduce filtering, loading, errors, dialogs, responsive tables, and save states independently;
- the current stylesheet has accumulated shell, feature, document-workspace, and exception rules in one place.

This document establishes the binding UI direction and the boundary between the application and the controlled-document renderer.

### Current implementation checkpoint — UI-1 and UI-2

UI-1 audited Dashboard, Projects, Project Overview, the Records register,
Record and Revision workspaces, RFI register/workspace, create/edit dialogs,
Studio, and Document Library. The audit found that the existing shell has the
strongest shared behavior (route focus, project context, API errors/request
IDs, drawer behavior, and responsive thresholds), while page headers,
registers, cards, dialogs, statuses, file rows, and history remain mostly local
markup and CSS. The resulting component, state, and responsive contracts in
this document are binding for later migrations.

UI-2 has implemented its build and CSS boundary, but remains active until its
runtime smoke tests and complete gate pass. The authenticated entry now loads
neutral `public/brand-tokens.css`, Vite output in `public/app/`, and the
existing shell through a React compatibility host. It no longer loads
`public/base.css`. `public/base.css` continues to own controlled-document
geometry and renderer selectors, while legacy Studio, Library, fill, and viewer
pages retain their compatible renderer path. No feature route or domain rule
has been migrated into React.

The target for application headings is **Archivo**. Existing browser-module
screens may still show Georgia because they retain their legacy shell CSS; UI-2
does not need to perform that later typography migration. UI-3/UI-4 component
and shell work must apply Archivo to migrated application headings without
altering controlled-document typography.

Spike 0 is complete: Tabulator is rejected for the RFI register because its
documented keyboard model cannot preserve BASE's select-then-edit and
non-editing arrow-key workflow. It remains a conditional candidate for future
high-volume registers, logs, or exports, only through `BaseDataGrid` and only
after a separate acceptance decision.

## 2. Product boundary

### 2.1 Application workspace

The application workspace manages projects, records, revisions, RFIs, submittals, files, issuances, contacts, activity, administration, the Document Library, and Studio controls.

Target application stack:

```text
React + TypeScript + Vite
├── React Router
├── TanStack Query
├── Radix behavior primitives
├── BASE-owned component source and styling
├── Tabulator through BaseDataGrid only if a future adoption is accepted
└── application-only CSS
```

React is introduced incrementally. Existing routes and APIs remain authoritative during migration.

### 2.2 Controlled-document system

The controlled-document system remains framework-independent:

```text
public/engine.js
public/base.css
JSON definitions
renderer adapters
print and official artifact output
```

The renderer remains the authority for document presentation. Application components may host a renderer preview but may not reinterpret the definition or create a second document styling system.

### 2.3 Required separation

The main application must stop depending on document layout classes such as generic `.field`, `.grid`, `.section`, and document-level `body` rules. Shared brand values may be extracted into a neutral token file, but application components and document components must use separate selectors and stylesheets.

## 3. Design principles

1. **Project context first.** Project identity, record identity, status, responsible party, due date, and current work state remain visible where they affect decisions.
2. **One visual language.** Shared problems use shared components. A feature may not create a local version of a button, dialog, badge, page header, filter toolbar, or empty state.
3. **Compact, not cramped.** The system should support working registers and dense construction information while keeping labels and controls readable.
4. **Maroon has a job.** BASE maroon communicates primary action, focus, selection, or active navigation. It is not general decoration.
5. **Official actions are unmistakable.** Issue, publish, void, archive, delete, and other consequential transitions require explicit presentation and confirmation.
6. **Status is textual and semantic.** Status never relies on color alone and uses one centralized vocabulary and tone map.
7. **The backend remains authoritative.** Client capabilities improve UX but never replace server authorization, validation, lifecycle rules, numbering, or conflict checks.
8. **Mobile is designed, not squeezed.** Mobile may use cards, sheets, prioritized metadata, or reduced columns. Desktop tables do not simply overflow onto phones.
9. **Accessibility is a component requirement.** Focus, keyboard operation, labels, live announcements, reduced motion, and error relationships are part of component acceptance.
10. **No silent design drift.** Raw colors, local button classes, direct Tabulator initialization, and custom modal implementations are prohibited outside the UI foundation.

## 4. Visual direction

The application should feel like a modern commercial construction operations platform: dependable, direct, calm, and information-dense. It should not resemble a marketing site, government form, consumer finance app, or generic component-library demo.

### 4.1 Typography

| Role                          | Standard                                                   |
| ----------------------------- | ---------------------------------------------------------- |
| Application interface         | Archivo                                                    |
| Metadata, IDs, codes          | JetBrains Mono, used sparingly                             |
| Official controlled documents | Existing renderer typography                               |
| Application page headings     | Archivo; Georgia is removed from the application workspace |
| Body text                     | 13–14 px minimum under normal conditions                   |
| Supporting text               | 12–13 px                                                   |
| Metadata                      | 11–12 px minimum                                           |

Uppercase mono labels are reserved for true identifiers, compact metadata, and controlled terminology. They are not the default treatment for every caption.

### 4.2 Color roles

Exact token values are maintained in the application token source. Features use semantic names, not raw hex values.

| Token role    | Usage                                                 |
| ------------- | ----------------------------------------------------- |
| Workspace     | Main application background                           |
| Surface       | Panels, dialogs, cards, menus                         |
| Border subtle | Internal divisions and quiet grouping                 |
| Border strong | Controls and deliberate boundaries                    |
| Text primary  | Main content                                          |
| Text muted    | Supporting information                                |
| Accent        | Primary action, focus, selected/active state          |
| Success       | Completed, active, issued where semantically positive |
| Warning       | Due soon, reconciliation, attention required          |
| Danger        | Errors, destructive actions, invalid states           |
| Info          | Neutral informational notice                          |

Red is not used for ordinary focus or normal form borders. Error and danger treatments remain distinct from BASE maroon.

### 4.3 Geometry and density

| Element                | Standard                                           |
| ---------------------- | -------------------------------------------------- |
| Default control height | 40 px                                              |
| Compact control height | 32–34 px                                           |
| Minimum touch target   | 44 px where isolated or mobile                     |
| Radius                 | 4–6 px                                             |
| Page gutter            | Responsive token; consistent across page patterns  |
| Panel shadow           | Minimal; borders carry most structure              |
| Register row height    | Compact but readable; standardized by BaseDataGrid |

Component variants must be explicit, such as `size="compact"`, rather than changed by a parent feature selector.

### 4.4 Icons

Use Lucide icons through one application icon component. Do not mix arbitrary SVG families, text glyphs, emoji, or CSS-generated symbols. Icons supplement labels; they do not replace consequential action labels unless the control is universally understood and has an accessible name.

## 5. Approved page patterns

Every route must use one of these patterns.

### 5.1 Directory/register page

Use for Projects, Records, RFIs, Submittals, Issuances, and contacts.

Required structure:

```text
Project/global context
PageHeader
├── title and compact supporting context
└── one primary action when authorized
RegisterToolbar
├── search
├── compact filters
├── sort where needed
├── active filter chips
└── result count
Register surface
├── loading
├── populated
├── filtered empty
├── first-use empty
└── error/retry
```

### 5.2 Record workspace

Use for Record, Revision, RFI, Submittal, and Issuance detail.

Required structure:

```text
Breadcrumbs
IdentityHeader
├── number/title/status
├── primary current action
└── overflow actions
MetadataStrip
CurrentWorkPanel
Files/response/current content
History or activity as secondary context
```

Duplicate facts are prohibited. Each important fact has one authoritative location in the visual hierarchy.

### 5.3 Dashboard/overview

Use for cross-project Dashboard and Project Overview.

Required structure:

- one compact summary strip rather than many equal decorative cards;
- work requiring attention as the primary section;
- recent activity and navigation as secondary sections;
- counts link to canonical destinations when available;
- no large empty decorative areas.

### 5.4 Form dialog or sheet

Use for concise create/edit workflows.

Required structure:

- clear title and purpose;
- grouped fields;
- inline validation plus a submission error summary when needed;
- explicit loading state;
- stable footer with secondary and primary actions;
- focus trap, Escape behavior, focus restoration, and mobile sheet layout.

Complex work belongs on a route, not inside an oversized modal.

### 5.5 Studio/editor workspace

Studio uses a three-part working layout:

- document/definition navigation;
- controlled editing surface;
- preview.

Controls, block cards, settings groups, save state, menus, and dialogs use the application component library. The preview continues to use the controlled-document renderer.

## 6. Core component inventory

### 6.1 Primitives

- Button
- IconButton
- TextInput
- TextArea
- Select
- Checkbox
- RadioGroup
- DateInput
- Field
- Label
- HelpText
- ValidationMessage
- Badge
- Tooltip
- Divider
- Spinner
- Skeleton

### 6.2 Interactive components

- Dialog
- AlertDialog
- DropdownMenu
- Popover
- Tabs
- Toast
- CommandMenu
- Collapsible
- Drawer

Radix may provide behavior, but BASE owns the rendered styling and component contract.

### 6.3 Application patterns

- AppShell
- PageHeader
- ProjectHeader
- ProjectTabs
- RegisterPage
- RegisterToolbar
- FilterChip
- Panel
- MetadataStrip
- FileRow
- ActivityFeed
- EmptyState
- ErrorState
- PermissionState
- FormDialog
- WorkspaceSection
- Breadcrumbs

### 6.4 BaseDataGrid

If a future high-volume register adopts Tabulator, it must be wrapped by one
`BaseDataGrid` integration. Feature modules may configure columns and feature
actions but may not instantiate or theme Tabulator directly. The RFI register
remains on its controlled custom table after Spike 0 rejected Tabulator's
keyboard behavior.

`BaseDataGrid` owns:

- Tabulator mount/destroy lifecycle;
- BASE theme and density;
- standard header, cell, selection, focus, error, and disabled styles;
- capability-based editability;
- edit/save/rollback hooks;
- Saving, Saved, Failed, and Conflict states;
- row refresh without unnecessary grid replacement;
- keyboard contract;
- accessibility labels and announcements;
- empty and loading overlays;
- responsive behavior;
- test utilities.

The server remains authoritative for validation, permissions, lock versions, lifecycle, and official actions.

## 7. Standard interaction states

Every data-backed feature must intentionally implement:

- initial loading;
- background refreshing where applicable;
- populated state;
- first-use empty state;
- filtered/no-results state;
- permission-limited state;
- request failure with retry;
- validation failure;
- saving;
- saved confirmation where useful;
- version conflict with recovery;
- offline/network interruption when the feature supports edits;
- destructive confirmation;
- successful completion and navigation.

A feature is incomplete when these states are left to generic browser behavior or undocumented assumptions.

## 8. Responsive requirements

### Desktop

- persistent global navigation;
- full project context;
- registers may use Tabulator and pinned identity columns;
- toolbars remain compact and aligned with the register width.

### Tablet

- navigation may compact but retains labels;
- toolbars wrap deliberately;
- detail workspaces reduce secondary metadata before primary actions.

### Mobile

- global navigation becomes a controlled drawer;
- primary actions remain reachable without horizontal scrolling;
- registers use either a deliberate reduced-column grid or a purpose-built card/detail pattern;
- filters use a horizontal compact row or filter sheet;
- editing workflows use sheets or routed detail when a cell editor is not practical;
- status, responsible party, due date, and next action take priority.

## 9. Accessibility requirements

- Semantic landmarks and headings.
- One meaningful page heading.
- Visible focus for every interactive control.
- Keyboard operation for menus, dialogs, tabs, grids, and drawers.
- Accessible names for icon-only controls.
- Error messages linked to fields.
- Status conveyed through text, not color alone.
- `aria-live` announcements for result counts, saves, errors, and route changes where needed.
- Focus restoration after dialogs, drawers, and recoverable grid errors.
- Reduced-motion behavior.
- Minimum contrast consistent with WCAG AA.

## 10. Dependency decisions

### Approved direction

- React, TypeScript, and Vite for the application workspace.
- React Router for application routing.
- TanStack Query for remote server state.
- Radix primitives for complex accessible behavior.
- Lucide for application icons.
- Tabulator through `BaseDataGrid` only for a future accepted high-volume
  register; it is not adopted for the RFI register.

### Conditions

Each dependency addition records purpose, license, maintenance signal, bundle/runtime impact, security posture, and replacement strategy. Dependencies may not move domain logic, permissions, or official workflow authority into the browser.

## 11. Prohibited patterns

Feature code may not introduce:

- raw color literals except approved visualization needs;
- new global button, badge, dialog, or form classes;
- direct Tabulator initialization;
- a second grid abstraction;
- feature-specific focus rings;
- custom modal/focus-trap implementations;
- document styles inside application stylesheets;
- application styles inside `public/base.css`;
- client-derived authorization based on role-name strings;
- duplicate status vocabularies;
- unreviewed new typography or icon families;
- silent replacement of visual-regression baselines.

## 12. Definition of done for UI work

A UI change is complete only when:

- it uses approved page patterns and components;
- desktop, tablet, and mobile behavior are implemented;
- loading, empty, filtered empty, error, permission, and conflict states are covered as applicable;
- keyboard and focus behavior are tested;
- no new raw visual conventions are introduced;
- API capabilities and server authority remain intact;
- screenshots or visual evidence are attached;
- the UI program tracker and current-structure documentation are updated;
- tests and `npm run check` pass;
- known limitations and the next recommended action are recorded.
