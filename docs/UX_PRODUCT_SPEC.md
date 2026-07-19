# UX and Product Behavior Specification

**Status:** Architecture v1.0 — binding implementation specification  
**Applies to:** BASE Office Forms / Document Control Platform  
**Primary users:** BASE Construction project managers, superintendents, administrators, reviewers, and controlled external recipients

## 1. Product experience objective

The application must feel like a project-control system that happens to generate excellent documents—not a document builder with project folders added around it. A user should always understand:

1. which project they are working in;
2. which record they are viewing;
3. whether the record is a draft or an official issued revision;
4. who currently owns the next action;
5. what changed and when;
6. which files are authoritative;
7. what can safely be edited.

The interface must prioritize operational clarity over configuration density. Advanced controls remain available, but they must not dominate daily project workflows.

## 2. Navigation model

### 2.1 Primary navigation

The authenticated application uses these primary destinations:

- **Home** — work requiring attention across projects.
- **Projects** — project directory and project workspaces.
- **Templates** — reusable form and document definitions.
- **Controlled Documents** — company manuals, procedures, and published revisions.
- **Library** — legacy/shared definitions and packages during migration.
- **Search** — global search across projects, records, contacts, and files.
- **Administration** — organization settings, branding, members, numbering, and integrations.

Do not make RFIs and submittals global top-level navigation during the initial internal release. They are project records and should be encountered primarily within a project. Cross-project queues belong on Home and Search.

### 2.2 Project navigation

A project workspace contains:

- Overview
- RFIs
- Submittals
- Documents
- Contacts
- Files
- Activity
- Settings

Future record types may be added without restructuring the project shell.

### 2.3 Context persistence

The application must preserve project context when moving between a record and its log. Breadcrumbs are mandatory:

`Projects / OHPA – Conway / RFIs / RFI-005`

Opening a global-search result must clearly reveal its project before the user takes any action.

## 3. Home dashboard

Home is an action queue, not a decorative analytics dashboard.

### 3.1 Required sections

- My open actions
- Overdue responses
- Recently returned records
- Drafts awaiting issue
- Recent project activity
- Favorite or recently visited projects

### 3.2 Card and row behavior

Rows show:

- project short name;
- record number;
- subject or description;
- status;
- current responsible party;
- due date or age;
- latest meaningful event.

A single click opens the record. Secondary actions must not be hidden behind ambiguous icons.

### 3.3 Empty state

If there are no open actions, show recent projects and a clear message. Do not manufacture urgency or display meaningless zero charts.

## 4. Project directory

### 4.1 Project row

Each project row includes:

- short name;
- full project name;
- internal project number;
- status;
- client;
- architect;
- project manager;
- superintendent;
- active RFI count;
- active submittal count;
- latest activity date.

### 4.2 Filters

- Status
- Project manager
- Superintendent
- Client
- Archived / active

### 4.3 Creation

Project creation is a guided flow:

1. Identity and numbers
2. Address and dates
3. Team and contacts
4. Routing defaults
5. Numbering defaults
6. Review and create

A project may be saved as a draft before all optional details are known.

## 5. Project overview

The project overview is the operational front page.

### 5.1 Header

Show:

- project short name and full name;
- status;
- internal and external project numbers with explicit labels;
- address;
- project manager and superintendent;
- quick actions for New RFI and New Submittal.

### 5.2 Attention panels

- Open RFIs by age
- Submittals under review
- Expected submittals not received
- Drafts awaiting issue
- Recently returned items

### 5.3 Routing notice

Project routing rules must appear as structured data, not only as freeform prose. A human-readable summary may be generated beneath the structured contacts.

## 6. RFI log

### 6.1 Default columns

- RFI number
- Subject
- Status
- Submitted
- Due
- Returned
- Age
- Responsible party
- Cost impact
- Schedule impact

### 6.2 Views

- All
- Open
- Drafts
- Awaiting response
- Returned / needs review
- Closed
- Potential questions
- Overdue

“Overdue” is a calculated view, never a stored workflow status.

### 6.3 Sorting

Default sort is sequence number ascending for formal log views and newest activity descending for work queues. The UI must label which sort is active.

### 6.4 Bulk actions

Initial release supports export and assignment only. Bulk issue, bulk close, and bulk delete are prohibited.

## 7. RFI record screen

### 7.1 Header

The header shows:

- official number or `Draft — number assigned on issue`;
- subject;
- project;
- workflow status;
- current responsible party;
- response due date;
- revision badge;
- primary action.

### 7.2 Primary actions by state

- Draft: Edit, Mark ready
- Ready to issue: Issue RFI
- Open: Record response, Send reminder
- Response received: Review response, Close, Return for clarification
- Closed: View final package, Reopen
- Void: View history only

Only one action is visually primary.

### 7.3 Record tabs

- Details
- Files
- Revisions
- Delivery
- Activity

### 7.4 Details layout

Use readable sections:

- Question
- Contractor suggestion
- References
- Impact assessment
- Routing
- Response
- Closure

Do not present the whole record as a wall of property inputs.

### 7.5 Editing rules

Draft fields edit inline or through a focused edit mode. Issued revision content is immutable. Corrections require a new revision or a clearly logged administrative correction, depending on the governing workflow.

### 7.6 Issue confirmation

The issue dialog must display:

- number to be assigned;
- recipient list;
- CC list;
- response due date;
- included files;
- generated PDF preview;
- warning that the issued revision becomes immutable.

Issuance requires an explicit confirmation button labeled **Issue RFI**.

## 8. Submittal log

### 8.1 Default columns

- Log ID
- Description
- Spec section
- Vendor
- Workflow status
- Current revision
- Submitted
- Due
- Returned
- Disposition
- Age

### 8.2 Views

- Expected
- Ready to submit
- Under review
- Overdue
- Returned
- Revise and resubmit
- Approved
- Closed

### 8.3 Stable item presentation

The log displays one row per stable submittal item. Revision history appears within the row or record detail, not as unrelated duplicate log rows.

## 9. Submittal record screen

### 9.1 Header

Show stable Log ID, description, vendor, workflow status, current revision, current disposition, and current responsible party.

### 9.2 Revision rail

A vertical revision rail shows:

- revision number;
- submitted date;
- returned date;
- disposition;
- files;
- delivery state.

The current revision is prominent, but prior revisions remain one click away.

### 9.3 New revision flow

When a record requires resubmittal:

1. Create revision from prior metadata.
2. Carry forward only fields explicitly marked reusable.
3. Require new submission files.
4. Show a comparison to the prior revision when available.
5. Assign the next revision number server-side.

## 10. Template and studio experience

The existing document studio remains the definition authoring environment.

### 10.1 Template distinction

The UI must distinguish:

- Personal/working definition
- Organization template
- Published template version
- Project record generated from a template

A project record must never silently mutate when its source template changes.

### 10.2 Publish template flow

Publishing a template version requires:

- version label;
- change summary;
- validation pass;
- preview;
- confirmation.

Published versions are immutable.

## 11. Files experience

### 11.1 File roles

Every attached file must have a role, such as:

- supporting attachment;
- submission file;
- response file;
- reviewed file;
- issued artifact;
- final package;
- evidence;
- reference.

### 11.2 Upload states

Show queued, uploading, scanning/processing, ready, and failed. A record cannot be issued while required files are incomplete.

### 11.3 File identity

Show file name, size, type, uploaded by, uploaded date, role, revision, and checksum status where relevant.

### 11.4 Replacement

Replacing an official file creates a new file record. It never overwrites binary content in place.

## 12. Activity timeline

The timeline is a human-readable projection of append-only events.

Events show:

- actor;
- action;
- date/time;
- before/after summary when meaningful;
- linked revision, file, artifact, or delivery;
- source, such as user, import, API, or AI suggestion accepted by a user.

Avoid logging every keystroke. Log domain-significant changes.

## 13. Search

### 13.1 Searchable entities

- Projects
- RFIs
- Submittals
- Controlled documents
- Templates
- Contacts
- Files by metadata

Full OCR/file-content search is deferred until the file-processing pipeline exists.

### 13.2 Result design

Each result displays entity type, project, identifier, title, status, and matching context. Results must not expose records the user cannot access.

## 14. Notifications

Initial notifications are in-app and email summaries/reminders generated from domain events. Notification preferences must not alter the underlying workflow or audit history.

### Required notifications

- assigned action;
- RFI response due soon;
- RFI overdue;
- response received;
- submittal returned;
- resubmittal required;
- secure share accessed when tracking is enabled;
- delivery failure.

## 15. Responsive behavior

Desktop is the primary authoring and administrative environment. Mobile web must support:

- viewing logs and records;
- creating a basic RFI draft;
- uploading photos/files;
- recording a response;
- approving a ready-to-issue action when authorized;
- search and notifications.

Complex template editing may remain desktop-only, but the UI must state this clearly.

## 16. Accessibility

- Keyboard navigation for all controls.
- Visible focus states.
- Labels independent of placeholder text.
- Status communicated by text, not color alone.
- Minimum WCAG AA contrast for application UI.
- Tables have responsive alternatives and proper headers.
- Confirmation dialogs announce irreversible consequences.

## 17. Destructive actions

Delete is rare and restricted.

- Drafts may be deleted by authorized users with confirmation.
- Issued records are voided, not deleted.
- Files attached to issued revisions are retained.
- Project archival is reversible.
- Permanent purge is an administrator-only retention operation outside normal project workflows.

## 18. Error behavior

Errors must state:

1. what failed;
2. whether data was saved;
3. what the user can do next;
4. a trace/reference ID for support when the failure is server-side.

Never display a success state before the server confirms the domain transaction.

## 19. Product analytics

Permitted analytics are operational and privacy-conscious:

- feature adoption;
- workflow completion time;
- error rates;
- export success;
- upload failure rate;
- search success;
- pilot reconciliation metrics.

Do not record document contents or sensitive file data in analytics payloads.

## 20. UX acceptance criteria

The v1 RFI pilot is not accepted until a trained project manager can, without developer assistance:

1. open OHPA Conway;
2. create a draft RFI;
3. attach a sketch;
4. route it to the correct architect contacts;
5. preview and issue it;
6. confirm that numbering was assigned once;
7. record a response;
8. close the RFI;
9. export the project log;
10. retrieve every issued artifact and event from the record timeline.
