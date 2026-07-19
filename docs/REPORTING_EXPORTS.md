# Reporting, Logs, and Export Specification

**Status:** Architecture v1.0 — binding reporting specification

## 1. Principle

Logs are query projections of authoritative records. They are not separately edited documents. A PDF or spreadsheet log is an artifact generated from a defined query, column set, sort, filters, and timestamp.

## 2. Authoritative sources

- RFI log: RFI records, current workflow state, official revisions, and response metadata.
- Submittal log: stable submittal items plus current revision/disposition projection.
- Activity report: append-only activity events.
- Delivery report: deliveries and attempts.
- Controlled-document register: documents and published revisions.

## 3. Saved views

A saved view stores:

- owner/visibility;
- record type;
- project scope;
- filters;
- sort;
- columns;
- grouping;
- formatting options.

Saved views never duplicate record data.

## 4. RFI log fields

Canonical fields:

- Project
- RFI number
- Subject
- Status
- Submitted date
- Response due date
- Returned date
- Days open
- Current responsible party
- Architect/consultant
- Drawing/spec references
- Cost impact
- Schedule impact
- Closed date
- Last activity

Formal project export defaults to number ascending.

## 5. Submittal log fields

Canonical fields:

- Project
- Log ID
- Spec section
- Description
- Vendor
- Workflow status
- Current revision
- Submitted date
- Review due date
- Returned date
- Disposition
- Days in review
- Resubmittal required
- Delivered to vendor date
- Closed date
- Last activity

## 6. Aging

Aging is calculated using explicit dates and project/calendar policy. Do not store “7 Days,” “15 Days,” or “Overdue” as mutable status values.

Initial calculation:

- Open RFI age: calendar days from issued date through response received or current date.
- Submittal review age: calendar days from submitted date through returned date or current date.
- Overdue: current date later than due date and workflow still awaits that action.

Business-day calendars may be added later as a project configuration.

## 7. Export formats

### PDF

- Branded header
- Project identity and number labels
- Generated timestamp
- Active filters
- Page numbering
- Repeated table headers
- Landscape where column density requires it
- No interactive-only columns

### XLSX

- Typed dates and numbers
- Frozen header row
- Auto-filter
- Human-readable display values
- Stable hidden machine IDs only when needed for re-import/audit
- No formulas that change historical values on open

### CSV

- UTF-8
- ISO dates
- One row per projected record
- Documented columns

## 8. Snapshot behavior

A generated export artifact records:

- query/view definition snapshot;
- data cutoff timestamp;
- row count;
- renderer/exporter version;
- creator;
- checksum;
- project and organization.

Regenerating later creates a new artifact because underlying records may have changed.

## 9. Formal issue logs

A project manager may mark a log export as formally issued. Formal issue creates an immutable artifact and activity event. It does not freeze the live log.

## 10. Dashboard metrics

Permitted initial metrics:

- open RFIs;
- overdue RFIs;
- median response days;
- submittals under review;
- overdue submittals;
- revise/resubmit count;
- expected submittals not received;
- recent returns;
- delivery failures.

Metrics must link to the records behind them.

## 11. No vanity analytics

Do not prioritize decorative charts that do not lead to an action. Every dashboard metric should answer:

- what requires attention;
- why;
- which records;
- who owns the next action.

## 12. External reporting

External exports must apply explicit column presets and authorization. Internal notes, audit details, private contact information, and AI metadata are excluded unless intentionally included by an authorized user.

## 13. Data reconciliation report

Migration/pilot reports include:

- source count;
- imported count;
- skipped count;
- duplicate count;
- ambiguous count;
- field-level warnings;
- attachment count;
- missing file count;
- numbering reconciliation;
- status/disposition reconciliation.

## 14. Performance

Large exports may run asynchronously. The export job records status and notifies the user when ready. UI must not silently truncate beyond a row limit.

## 15. Testing

Golden datasets verify:

- filters and sort;
- aging;
- current revision selection;
- disposition projection;
- field exclusion;
- date typing;
- PDF pagination;
- row count/checksum metadata;
- authorization.
