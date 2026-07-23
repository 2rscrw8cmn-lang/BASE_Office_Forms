// Tabulator adapter for the desktop RFI register (spike). This module is the
// only place that knows about the Tabulator library. It exposes:
//
//   * Pure, DOM-free helpers (mode detection, column definitions, capability
//     gating, PATCH payload building, validation) that are unit-testable
//     without a real Tabulator instance or a layout-capable DOM.
//   * `createRfiTabulatorGrid`, a thin controller around a Tabulator table. The
//     Tabulator constructor is injected (default: a lazy dynamic import of the
//     vendored ESM build) so the whole controller can be driven by a test
//     double.
//
// The adapter never owns authoritative data, URL state, or filter/sort policy.
// The register view (`rfis-view.js`) remains the single source of truth; the
// grid only renders the already-filtered rows it is handed and delegates every
// commit back to the view through the injected `commit` callback.
import {
  escapeHtml,
  formatDate,
  rfiStatusLabel,
  rfiStatusTone,
} from "./app-format.js";

export const TABULATOR_GRID_MODE = "tabulator";
const VENDOR_ESM_URL = "/vendor/tabulator/tabulator_esm.min.js";
const VENDOR_CSS_URL = "/vendor/tabulator/tabulator.min.css";

// The seven server-authorized editable draft fields. Mirrors EDITABLE_FIELDS in
// rfis-view.js by design — both derive from the same UX spec, and the adapter
// tests assert the two stay in lockstep.
export const TABULATOR_EDITABLE_FIELDS = {
  subject: { label: "Subject", type: "text" },
  responsiblePartyId: { label: "Responsible party", type: "contact" },
  requestedResponseDate: { label: "Response due", type: "date" },
  question: { label: "Question", type: "textarea" },
  contractorSuggestion: { label: "Contractor suggestion", type: "textarea" },
  drawingReferences: { label: "Drawing references", type: "text" },
  specificationReferences: { label: "Specification references", type: "text" },
};
export const TABULATOR_EDITABLE_ORDER = Object.keys(TABULATOR_EDITABLE_FIELDS);

// Reads the A/B switch from a location.search string. Only the exact opt-in
// value activates the prototype; everything else keeps the custom register.
export function readGridMode(search) {
  const params = new URLSearchParams(search || "");
  return params.get("grid") === TABULATOR_GRID_MODE
    ? TABULATOR_GRID_MODE
    : "custom";
}

export function isTabulatorMode(search) {
  return readGridMode(search) === TABULATOR_GRID_MODE;
}

// Editability comes only from the server-derived capability, never from role
// strings, status text, or whether a value is currently blank.
export function isRowEditable(row) {
  return row?.capabilities?.updateDraft === true;
}

export function normalizeCellValue(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

// The changed-field PATCH body: only the single edited field plus the current
// lock version — never a stale copy of the whole row.
export function buildPatchPayload(field, value, lockVersion) {
  return { [field]: normalizeCellValue(value), lockVersion };
}

// Client-side pre-validation. Mirrors the custom register so both A/B paths
// reject the same invalid input before any request is sent.
export function validateField(field, value) {
  const text = String(value ?? "").trim();
  if ((field === "subject" || field === "question") && !text) {
    return `${TABULATOR_EDITABLE_FIELDS[field].label} is required.`;
  }
  if (
    field === "requestedResponseDate" &&
    text &&
    !/^\d{4}-\d{2}-\d{2}$/.test(text)
  ) {
    return "Response due must be a valid date.";
  }
  return null;
}

function truncate(value, max = 140) {
  const text = String(value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// The official RFI number cell (or the explicit unnumbered-draft label). The
// database UUID is never used; legacy identifiers stay visibly secondary.
function numberCellHtml(row, projectId) {
  const reserved = row.issuanceReconciliationState === "legacy_incomplete";
  const number = row.rfiNumber
    ? `<span class="rfi-number">${reserved ? "Reserved " : ""}${escapeHtml(row.rfiNumber)}</span>`
    : '<span class="rfi-number rfi-number-draft">Unnumbered Draft</span>';
  const legacy = row.legacyReference
    ? `<span class="rfi-legacy">Legacy ${escapeHtml(row.legacyReference)}</span>`
    : "";
  const href = `/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(row.id)}`;
  return `<a class="rfi-tabulator-number-link" href="${href}" data-app-link data-open-rfi="${escapeHtml(row.id)}">${number}${legacy}</a>`;
}

// Status is always text (never color alone); overdue / due-soon use the
// server-computed flags.
function statusCellHtml(row) {
  if (row.issuanceReconciliationState === "legacy_incomplete") {
    return '<span class="status-badge status-attention">Needs issue repair</span>';
  }
  const flag = row.isOverdue
    ? '<span class="rfi-flag rfi-flag-overdue">Overdue</span>'
    : row.dueSoon
      ? '<span class="rfi-flag rfi-flag-soon">Due soon</span>'
      : "";
  return `<span class="status-badge status-${rfiStatusTone(row.status)}">${escapeHtml(rfiStatusLabel(row.status))}</span>${flag}`;
}

function responsibleDisplay(row, contacts) {
  if (row.responsiblePartyLegacyText)
    return `${row.responsiblePartyLegacyText} (unresolved)`;
  if (row.responsibleParty) return row.responsibleParty;
  const match = contacts.find((contact) => contact.id === row.responsiblePartyId);
  return match ? match.name : "—";
}

// A cell status pill ("Saving…" / "Saved" / a failure message) appended inside
// the editable cell, tied to the affected field via aria-live so async results
// stay attached to the cell that produced them.
function statusPillHtml(cellState) {
  if (!cellState) return "";
  const role = cellState.status === "failed" ? "alert" : "status";
  return `<span class="rfi-cell-save-state is-${cellState.status}" role="${role}">${escapeHtml(cellState.message)}</span>`;
}

// Builds the Tabulator column array. Editable columns use a shared formatter
// that renders the display value plus any per-cell async status pill, and an
// `editable` callback gated strictly on the server capability. Kept pure so the
// column shape can be asserted in tests.
export function buildColumnDefinitions({
  projectId,
  getContacts,
  getCellState,
}) {
  const contacts = () => (getContacts ? getContacts() : []);
  const editableColumn = (field, extra = {}) => {
    const meta = TABULATOR_EDITABLE_FIELDS[field];
    return {
      field,
      title: extra.title || meta.label,
      editableTitle: false,
      editable: (cell) => isRowEditable(cell.getRow().getData()),
      cssClass: `rfi-tabulator-editable rfi-tabulator-field-${field}`,
      formatter: (cell) => {
        const row = cell.getRow().getData();
        const state = getCellState?.(row.id, field);
        let text;
        if (field === "responsiblePartyId") {
          text = responsibleDisplay(row, contacts());
        } else if (field === "requestedResponseDate") {
          text = formatDate(row[field]) || "—";
        } else if (meta.type === "textarea") {
          text = truncate(row[field]) || "—";
        } else {
          text = row[field] || "—";
        }
        const editableClass = isRowEditable(row) ? "" : " is-readonly";
        return `<span class="rfi-cell-text${editableClass}" title="${escapeHtml(String(row[field] ?? ""))}">${escapeHtml(text)}</span>${statusPillHtml(state)}`;
      },
      ...columnEditor(field, meta, contacts),
      ...extra,
    };
  };

  return [
    {
      field: "rfiNumber",
      title: "RFI No.",
      frozen: true,
      editable: false,
      headerSort: false,
      cssClass: "rfi-tabulator-number",
      formatter: (cell) => numberCellHtml(cell.getRow().getData(), projectId),
    },
    editableColumn("subject", { frozen: true, cssClass: "rfi-tabulator-editable rfi-tabulator-field-subject rfi-tabulator-subject", minWidth: 200 }),
    {
      field: "status",
      title: "Status",
      editable: false,
      headerSort: false,
      cssClass: "rfi-tabulator-status",
      formatter: (cell) => statusCellHtml(cell.getRow().getData()),
    },
    editableColumn("responsiblePartyId", { title: "Responsible Party", minWidth: 150 }),
    editableColumn("requestedResponseDate", { title: "Response Due", minWidth: 140 }),
    editableColumn("question", { title: "Question", minWidth: 220 }),
    editableColumn("contractorSuggestion", { title: "Contractor Suggestion", minWidth: 220 }),
    editableColumn("drawingReferences", { title: "Drawing References", minWidth: 150 }),
    editableColumn("specificationReferences", { title: "Specification References", minWidth: 160 }),
    {
      field: "latestResponse",
      title: "Response",
      editable: false,
      headerSort: false,
      cssClass: "rfi-tabulator-long",
      formatter: (cell) => {
        const value = cell.getRow().getData().latestResponse;
        return `<span class="rfi-cell-text" title="${escapeHtml(String(value || ""))}">${escapeHtml(truncate(value) || "—")}</span>`;
      },
    },
    {
      field: "issuedAt",
      title: "Issued",
      editable: false,
      cssClass: "rfi-tabulator-date",
      formatter: (cell) => escapeHtml(formatDate(cell.getValue()) || "—"),
    },
    {
      field: "updatedAt",
      title: "Updated",
      editable: false,
      cssClass: "rfi-tabulator-date",
      formatter: (cell) => escapeHtml(formatDate(cell.getValue()) || "—"),
    },
    {
      field: "open",
      title: "Open",
      editable: false,
      headerSort: false,
      cssClass: "rfi-tabulator-open",
      formatter: (cell) => {
        const row = cell.getRow().getData();
        const href = `/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(row.id)}`;
        return `<a class="open-link" href="${href}" data-app-link data-open-rfi="${escapeHtml(row.id)}" aria-label="Open ${escapeHtml(row.subject || "RFI")}">Open <span aria-hidden="true">→</span></a>`;
      },
    },
  ];
}

function columnEditor(field, meta, contacts) {
  const validator = (cell, value) => validateField(field, value) === null;
  if (meta.type === "contact") {
    return {
      editor: "list",
      editorParams: () => ({
        values: [
          { label: "Unassigned", value: "" },
          ...contacts().map((contact) => ({
            label: contact.companyName
              ? `${contact.name} — ${contact.companyName}`
              : contact.name,
            value: contact.id,
          })),
        ],
        clearable: true,
      }),
    };
  }
  if (meta.type === "textarea") {
    return { editor: "textarea", validator };
  }
  if (meta.type === "date") {
    return { editor: "input", editorParams: { elementAttributes: { type: "date" } }, validator };
  }
  return { editor: "input", validator };
}

// Loads the vendored Tabulator ESM build once and caches the module promise.
// Also injects the base stylesheet link (idempotently) so the BASE overrides in
// app-shell.css have the stock rules to layer on top of.
let tabulatorModulePromise = null;
export function loadTabulator(doc = typeof document !== "undefined" ? document : null) {
  if (doc && !doc.querySelector('link[data-tabulator-style]')) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = VENDOR_CSS_URL;
    link.setAttribute("data-tabulator-style", "true");
    doc.head?.appendChild(link);
  }
  if (!tabulatorModulePromise) {
    tabulatorModulePromise = import(VENDOR_ESM_URL).then(
      (mod) => mod.TabulatorFull || mod.Tabulator || mod.default,
    );
  }
  return tabulatorModulePromise;
}

// Thin controller around a Tabulator instance. All authoritative behavior is
// delegated to callbacks supplied by the register view:
//   * getRows()      -> current filtered+sorted authoritative rows to render
//   * getContacts()  -> responsible-party contacts for the list editor
//   * commit({id, field, value}) -> Promise resolving to a result object:
//        { status: "unchanged" }
//        { status: "invalid",  message }
//        { status: "saved",    row }         // authoritative updated row
//        { status: "conflict", message, rows } // reloaded authorized rows
//        { status: "permission", message, rows? }
//        { status: "error",    message }
//   * onOpen(id)     -> explicit navigation to the RFI workspace
//   * announce(text) -> live-region announcement
export function createRfiTabulatorGrid({
  projectId,
  loadTabulator: load = loadTabulator,
  getRows,
  getContacts,
  commit,
  onOpen,
  announce,
  window: win = typeof window !== "undefined" ? window : null,
}) {
  let table = null;
  let hostEl = null;
  let destroyed = false;
  let ready = null;
  let rowsToken = 0; // guards against an older async setRows clobbering a newer one
  const cellStates = new Map(); // `${id}:${field}` -> { status, message }
  const inFlight = new Set(); // guards against duplicate commits of a cell

  const stateKey = (id, field) => `${id}:${field}`;
  const getCellState = (id, field) => cellStates.get(stateKey(id, field));

  function reformatCell(id, field) {
    if (!table) return;
    try {
      const row = table.getRow(id);
      if (!row) return;
      // Tabulator exposes reformat() on the RowComponent (re-running its cell
      // formatters); CellComponent has no reformat(), so a row-level reformat is
      // what actually re-renders the status pill. Fall back to the cell API for
      // forward compatibility.
      if (typeof row.reformat === "function") row.reformat();
      else row.getCell?.(field)?.reformat?.();
    } catch {
      // A row/cell can legitimately be absent (filtered out or reloaded away);
      // the status map is still authoritative for when it returns.
    }
  }

  function setCellState(id, field, state) {
    const key = stateKey(id, field);
    if (state) cellStates.set(key, state);
    else cellStates.delete(key);
    reformatCell(id, field);
  }

  async function handleCommit(cell) {
    const row = cell.getRow().getData();
    const field = cell.getField();
    const id = row.id;
    const key = stateKey(id, field);
    if (inFlight.has(key)) return;
    const rawValue = cell.getValue();

    const validation = validateField(field, rawValue);
    if (validation) {
      cell.restoreOldValue?.();
      setCellState(id, field, { status: "failed", message: validation });
      announce?.(validation);
      return;
    }

    inFlight.add(key);
    setCellState(id, field, { status: "saving", message: "Saving…" });
    announce?.("Saving…");
    try {
      const result = await commit({ id, field, value: rawValue });
      if (destroyed) return;
      if (result.status === "unchanged") {
        setCellState(id, field, null);
      } else if (result.status === "invalid") {
        cell.restoreOldValue?.();
        setCellState(id, field, { status: "failed", message: result.message });
        announce?.(result.message);
      } else if (result.status === "saved") {
        table?.getRow(id)?.update?.(result.row || {});
        setCellState(id, field, { status: "saved", message: "Saved" });
        announce?.(`${TABULATOR_EDITABLE_FIELDS[field]?.label || field} saved.`);
        win?.setTimeout(() => {
          if (destroyed) return;
          if (getCellState(id, field)?.status === "saved")
            setCellState(id, field, null);
        }, 1400);
      } else if (result.status === "conflict") {
        setCellState(id, field, { status: "failed", message: result.message });
        announce?.(result.message);
        await replaceRows(result.rows, { restore: { id, field } });
      } else if (result.status === "permission") {
        cell.restoreOldValue?.();
        setCellState(id, field, { status: "failed", message: result.message });
        announce?.(result.message);
        if (Array.isArray(result.rows))
          await replaceRows(result.rows, { restore: { id, field } });
      } else {
        cell.restoreOldValue?.();
        setCellState(id, field, { status: "failed", message: result.message });
        announce?.(result.message);
      }
    } catch (error) {
      if (destroyed) return;
      cell.restoreOldValue?.();
      const message = error?.message || "Could not save. Try again.";
      setCellState(id, field, { status: "failed", message });
      announce?.(message);
    } finally {
      inFlight.delete(key);
    }
  }

  function buildConfig(height) {
    return {
      index: "id",
      reactiveData: false,
      layout: "fitDataStretch",
      height,
      placeholder: "No RFIs match these filters.",
      // Single-click opens the editor on an editable cell. Tabulator has no
      // "select-then-Enter" cell mode via documented options; see the spike
      // report for this keyboard-workflow divergence.
      editTriggerEvent: "click",
      // Header-click sorting is disabled so the register's toolbar sort control
      // and the URL query string remain the single sort authority; Tabulator
      // never becomes a second source of truth for order.
      columnDefaults: {
        headerHozAlign: "left",
        headerSort: false,
        resizable: true,
        tooltip: true,
      },
      columns: buildColumnDefinitions({ projectId, getContacts, getCellState }),
      data: getRows ? getRows() : [],
    };
  }

  async function ensureTable() {
    if (table || destroyed) return table;
    if (!ready) {
      ready = load(hostEl?.ownerDocument).then((Tabulator) => {
        if (destroyed || !hostEl) return null;
        const doc = hostEl.ownerDocument;
        const view = doc.defaultView;
        const height = Math.max(
          320,
          Math.min(640, (view?.innerHeight || 800) - 260),
        );
        table = new Tabulator(hostEl, buildConfig(height));
        table.on?.("cellEdited", (cell) => handleCommit(cell));
        table.on?.("validationFailed", (cell, value) => {
          const message =
            validateField(cell.getField(), value) ||
            "That value is not allowed.";
          setCellState(cell.getRow().getData().id, cell.getField(), {
            status: "failed",
            message,
          });
          announce?.(message);
        });
        bindOpenLinks();
        return table;
      });
    }
    return ready;
  }

  // Explicit-only navigation: only the RFI number link and the Open action move
  // to the workspace. Ordinary data cells never navigate. Modifier/middle
  // clicks keep native anchor behavior (open in a new tab).
  function bindOpenLinks() {
    hostEl?.addEventListener("click", (event) => {
      const link = event.target.closest?.("[data-open-rfi]");
      if (!link) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      onOpen?.(link.getAttribute("data-open-rfi"));
    });
  }

  async function replaceRows(rows, { restore } = {}) {
    if (!table || destroyed) return;
    await table.replaceData(Array.isArray(rows) ? rows : []);
    if (restore) restoreFocus(restore);
  }

  function restoreFocus({ id, field }) {
    try {
      const row = table?.getRow(id);
      const cell = row?.getCell?.(field);
      cell?.getElement?.()?.focus?.();
    } catch {
      // The logical cell may no longer exist after a reload; nothing to focus.
    }
  }

  async function mount(host) {
    if (destroyed) return;
    hostEl = host;
    await ensureTable();
  }

  async function setRows(rows) {
    // The Tabulator instance loads asynchronously, so several setRows calls can
    // be in flight before the table exists. Only the most recent snapshot may
    // win — otherwise an older, slower call (e.g. the create-spinner re-render)
    // could clobber a newer one (e.g. the just-added draft row).
    const token = ++rowsToken;
    await ensureTable();
    if (!table || destroyed || token !== rowsToken) return;
    await table.replaceData(Array.isArray(rows) ? rows : []);
  }

  function focusCell(ref) {
    if (ref) restoreFocus(ref);
  }

  // Begins editing a specific cell (used after inline Add RFI to drop the user
  // straight into the Subject editor). Guards on the row/cell still existing.
  async function editCell({ id, field }) {
    await ensureTable();
    if (!table || destroyed) return;
    try {
      const cell = table.getRow(id)?.getCell?.(field);
      cell?.getElement?.()?.focus?.();
      cell?.edit?.(true);
    } catch {
      // The row may not be present yet (data still settling); the caller can
      // retry, but a missing editor is never fatal.
    }
  }

  function destroy() {
    destroyed = true;
    try {
      table?.destroy?.();
    } catch {
      // Tabulator can throw if the host was already detached; the reference is
      // dropped regardless so no listeners or timers survive the route change.
    }
    table = null;
    hostEl = null;
    cellStates.clear();
    inFlight.clear();
  }

  return {
    mount,
    setRows,
    setCellState,
    focusCell,
    editCell,
    destroy,
    // Exposed for tests / diagnostics.
    _getCellState: getCellState,
    _handleCommit: handleCommit,
    _ensureTable: ensureTable,
    get table() {
      return table;
    },
  };
}
