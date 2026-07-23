# BASE Application UI Foundation

**Status:** Binding application design contract after UI-1 audit  
**Updated:** 2026-07-23  
**Applies to:** Authenticated application UI, Studio controls, and Document
Library chrome  
**Does not replace:** `public/engine.js`, controlled-document definitions, or
official document output

## 1. Current implementation truth

The current application is still framework-free static HTML, CSS, and browser
ES modules. The shell, Dashboard, Projects, Project Overview, Records register,
Record workspace, Revision workspace, shared API/format helpers, mobile drawer,
and create/add-document flows are implemented. RFI register/workspace,
Issuances, Team, and Administration remain route-level placeholders. The
Document Library and Studio remain legacy pages; Studio has stabilized editor
identity, preview, and save-state behavior but has not adopted the application
component system.

The application currently loads `public/base.css` and `public/app-shell.css`
together. CSS separation is therefore a UI-2 deliverable, not a completed
foundation. There is no React/Vite, Radix, Lucide, or Tabulator dependency on
current `main`, and no `BaseDataGrid` exists yet.

## 2. Product boundary

The application workspace manages projects, records, revisions, files, RFIs,
issuances, contacts, activity, administration, the Document Library, and
Studio controls. The controlled-document system remains the authority for
definition rendering, print layout, and official artifact presentation.

```text
Application UI: React + TypeScript + Vite (incremental target)
              React Router + TanStack Query (target)
              Radix behavior + BASE-owned components
              Lucide through one icon component
              Tabulator only behind BaseDataGrid

Document UI:   public/engine.js + compatible JSON definitions + renderer CSS
```

Application components may host a renderer preview, but may not reinterpret the
definition or create a second document styling system.

## 3. Binding visual rules

### Typography

Use Archivo for application controls and body text, JetBrains Mono sparingly
for identifiers and metadata, and the existing renderer typography for official
documents. Current application headings use Georgia through the shared legacy
CSS; UI-2 must make that inheritance explicit and scoped rather than silently
changing the heading voice. Normal application body text must remain readable
(13–14 px minimum); supporting text is 12–13 px and metadata is at least 11 px.
Uppercase mono is reserved for real identifiers and compact labels.

### Tokens, spacing, and geometry

The current semantic application aliases in `app-shell.css` and its 8/12/18/
24/30 px scale are the observed starting point. UI-2 will move neutral brand
values into a documented token source and keep application tokens separate
from renderer tokens. Features use semantic tokens, never raw color literals.
Default controls are about 40 px high, isolated/mobile targets are at least
44 px, radii are 4–6 px, and borders carry more structure than shadows.

Maroon is for primary action, focus, selection, and active navigation. Success,
warning, danger, and informational tones are semantic and textual; red is not
an ordinary focus treatment.

### Icons

Lucide is the target application icon family, exposed through one BASE icon
component. Current shell and legacy pages use local inline SVG families; those
are preserve-until-migrated assets, not permission to add another icon family.
Icons supplement labels and decorative icons are hidden from assistive
technology.

## 4. Page patterns

### Directory/register

Use for Projects, Records, RFIs, Issuances, and contacts:

```text
context → PageHeader → RegisterToolbar → register surface
                    └ primary action when server capability allows
```

The toolbar owns search, compact filters, sort, active chips, and result count.
The surface owns loading, populated, first-use empty, filtered empty, and
retryable error states. URL filter state belongs to the feature/router, not a
grid implementation.

### Record workspace

Use for Record, Revision, RFI, Submittal, and Issuance detail:

```text
Breadcrumbs → IdentityHeader → MetadataStrip → CurrentWorkPanel
                                        → files/content/response
                                        → history/activity as secondary context
```

Every important fact has one authoritative visual location. A current action is
primary; secondary/destructive actions use an overflow or explicit confirmation.
Issue, publish, void, archive, and delete are not ordinary saves.

### Dashboard/overview

Use one compact summary strip, then attention-first work, recent activity, and
canonical workflow links. Empty attention is compact, not a large decorative
blank area. Counts do not become a second copy of the same fact elsewhere on
the page.

### Dialog/sheet

Use for concise create/edit work only. It has a labelled purpose, grouped
fields, inline errors linked to fields, a submission error surface, explicit
loading, stable footer actions, focus trap, Escape close, focus restoration,
and mobile sheet behavior. Complex multi-step work belongs on a route.

### Studio/editor

Studio keeps its document/definition navigation, editing surface, and renderer
preview. Its controls, menus, dialogs, toasts, and save state migrate to the
application system later; the preview remains renderer-owned.

## 5. Shared component contract

The target catalog contains Button, IconButton, TextInput, TextArea, Select,
Checkbox, RadioGroup, DateInput, Field, Label, HelpText, ValidationMessage,
Badge, Tooltip, Divider, Spinner, Skeleton, Dialog, AlertDialog, DropdownMenu,
Popover, Tabs, Toast, CommandMenu, Collapsible, Drawer, AppShell, PageHeader,
ProjectHeader, ProjectTabs, RegisterPage, RegisterToolbar, FilterChip, Panel,
MetadataStrip, FileRow, ActivityFeed, EmptyState, ErrorState, PermissionState,
FormDialog, WorkspaceSection, and Breadcrumbs.

Radix may supply accessible behavior primitives. BASE owns component source,
markup, styling, tokens, semantics, and tests; stock shadcn/template styling
is not the final theme.

`BaseDataGrid` is the only Tabulator integration. It owns mount/destroy,
density/theme, selection/focus, keyboard behavior, capability-based editing,
save/rollback hooks, Saving/Saved/Failed/Conflict states, loading/empty
overlays, responsive behavior, announcements, and test utilities. Feature code
provides columns, data mapping, actions, and API callbacks. Adoption remains
conditional on an accepted Spike 0 behavior and licensing report.

## 6. Standard state contract

Every data-backed feature covers the states that apply: initial loading,
background refresh, populated, first-use empty, filtered empty, permission
limited, request failure with retry, validation failure, saving, saved, version
conflict with recovery, offline/network interruption for editable flows,
destructive confirmation, and successful completion/navigation.

The current shell already provides session/project loading, generic not-found,
retryable errors, request IDs, announcements, and stale-request protection.
Current record/revision mutations surface server errors but do not yet provide a
shared optimistic-concurrency conflict UI. RFI UI has no implementation yet.
These are migration facts, not waived requirements.

## 7. Responsive and accessibility rules

Preserve the observed shell thresholds: 950 px for compact tablet behavior and
620 px for phone navigation. Desktop may use a full register and pinned
identity columns. Tablet wraps toolbars deliberately. Mobile uses the controlled
drawer, cards or a reduced-column/detail pattern, a filter row/sheet, and keeps
status, responsibility, due date, and next action reachable without horizontal
scrolling. Studio's existing 1050 px and 760 px rules remain local until its
controls migrate.

All routes use semantic landmarks, one meaningful heading, visible focus,
keyboard-operable dialogs/menus/tabs/grids/drawers, accessible icon names,
field-linked errors, text status, live announcements where useful, focus
restoration, reduced-motion behavior, and WCAG AA contrast.

## 8. Prohibited drift

Do not add feature-local button, badge, dialog, form, status vocabulary, focus
ring, typography family, grid abstraction, or raw application color. Do not
initialize or theme Tabulator outside `BaseDataGrid`. Do not put application
styles in `public/base.css`, renderer styles in application CSS, or client-side
role-string authorization in feature code. Do not delete legacy renderer assets
until route parity and rollback evidence exist.

## 9. Definition of done

A UI change uses an approved pattern, preserves server authority and canonical
URLs, covers applicable async/empty/error/permission/conflict states, works at
desktop/tablet/mobile widths, tests keyboard/focus behavior, adds no silent
visual convention, and records visual evidence, checks, limitations, and the
next action in the program tracker. Official renderer output is unchanged.
