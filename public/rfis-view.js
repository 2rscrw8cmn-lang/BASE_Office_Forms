// Spreadsheet-style project RFI register. Draft cells commit deliberately on
// Enter, Tab, Shift+Tab, or blur; optimistic-concurrency failures keep URL
// state and keyboard focus intact while the latest row is reloaded.
import {
  escapeHtml,
  formatDate,
  rfiStatusLabel,
  rfiStatusTone,
} from "./app-format.js";
import {
  TABULATOR_GRID_MODE,
  readGridMode,
  createRfiTabulatorGrid,
  loadTabulator,
  validateField as tabulatorValidateField,
  normalizeCellValue,
  buildPatchPayload,
} from "./rfi-tabulator-adapter.js";

const SORT_KEYS = {
  number: { label: "RFI number", defaultDir: "asc" },
  updated: { label: "Recently updated", defaultDir: "desc" },
  created: { label: "Newest", defaultDir: "desc" },
  subject: { label: "Subject A–Z", defaultDir: "asc" },
  due: { label: "Response due date", defaultDir: "asc" },
};

const DUE_OPTIONS = [
  ["all", "Any due status"],
  ["overdue", "Overdue"],
  ["due_soon", "Due soon"],
];

const EDITABLE_FIELDS = {
  subject: { label: "Subject", type: "text" },
  responsiblePartyId: { label: "Responsible party", type: "contact" },
  requestedResponseDate: { label: "Response due", type: "date" },
  question: { label: "Question", type: "textarea" },
  contractorSuggestion: { label: "Contractor suggestion", type: "textarea" },
  drawingReferences: { label: "Drawing references", type: "text" },
  specificationReferences: {
    label: "Specification references",
    type: "text",
  },
};
const EDITABLE_ORDER = Object.keys(EDITABLE_FIELDS);

function defaultFilters() {
  return {
    q: "",
    status: "all",
    responsible: "all",
    due: "all",
    sort: "number",
    direction: "asc",
  };
}

function collate(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    sensitivity: "base",
  });
}
function collateNumber(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
function compareDate(a, b) {
  return (Date.parse(a || "") || 0) - (Date.parse(b || "") || 0);
}
function truncate(value, max = 140) {
  const text = String(value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
function rfiWorkspaceHref(projectId, rfiId) {
  return `/projects/${encodeURIComponent(projectId)}/rfis/${encodeURIComponent(rfiId)}`;
}

export function createRfisView({
  api,
  navigate,
  announce,
  requestRender,
  projectId,
  // Spike A/B: the Tabulator desktop grid is activated by ?grid=tabulator. The
  // Tabulator loader is injectable so tests can drive the prototype with a test
  // double instead of importing the vendored ESM build.
  tabulatorLoader = loadTabulator,
}) {
  let state = { status: "loading", data: null, error: null };
  let filters = defaultFilters();
  let controller = null;
  let destroyed = false;
  let appWindow = null;
  let editing = null; // { id, field, original, initialText, committing }
  let selected = null; // { id, field }
  let creating = false;
  let gridMode = "custom"; // "custom" (default) | "tabulator" (spike prototype)
  let tabulatorGrid = null;
  const cellStates = new Map(); // row:field -> { status, message }

  async function reload({ quiet = false } = {}) {
    controller?.abort();
    controller = new AbortController();
    if (!quiet) {
      state = { status: "loading", data: null, error: null };
      editing = null;
      selected = null;
      requestRender();
    }
    try {
      const { data } = await api.getProjectRfis(projectId, {
        signal: controller.signal,
      });
      if (destroyed) return;
      state = {
        status: "loaded",
        data: {
          project: data?.project || null,
          rfis: Array.isArray(data?.rfis) ? data.rfis : [],
          responsibleContacts: Array.isArray(data?.responsibleContacts)
            ? data.responsibleContacts
            : [],
          capabilities: data?.capabilities || {},
        },
        error: null,
      };
      requestRender();
    } catch (error) {
      if (destroyed || error.aborted) return;
      if (quiet) throw error;
      state = {
        status:
          error.status === 403 || error.status === 404 ? "missing" : "error",
        data: null,
        error,
      };
      announce?.("RFIs could not be loaded.");
      requestRender();
    }
  }

  function canCreate() {
    return (
      state.status === "loaded" && state.data.capabilities.createRfi === true
    );
  }

  function responsibleOptions(rfis) {
    const ids = new Set(
      rfis.map((rfi) => rfi.responsiblePartyId).filter(Boolean),
    );
    const options = state.data.responsibleContacts
      .filter((contact) => ids.has(contact.id))
      .map((contact) => [contact.id, contact.name]);
    if (rfis.some((rfi) => rfi.responsiblePartyLegacyText)) {
      options.push(["unresolved", "Unresolved legacy value"]);
    }
    return options;
  }

  function statusOptions(rfis) {
    const present = new Set(rfis.map((rfi) => rfi.status));
    return [
      "draft",
      "ready_to_issue",
      "open",
      "response_received",
      "returned_for_clarification",
      "closed",
      "void",
    ]
      .filter((value) => present.has(value))
      .map((value) => [value, rfiStatusLabel(value)]);
  }

  function hasActiveFilters() {
    return (
      Boolean(filters.q.trim()) ||
      filters.status !== "all" ||
      filters.responsible !== "all" ||
      filters.due !== "all"
    );
  }

  function applyFilters(rfis) {
    const query = filters.q.trim().toLowerCase();
    return sortRfis(
      rfis.filter((rfi) => {
        if (filters.status !== "all" && rfi.status !== filters.status)
          return false;
        if (
          filters.responsible !== "all" &&
          (filters.responsible === "unresolved"
            ? !rfi.responsiblePartyLegacyText
            : rfi.responsiblePartyId !== filters.responsible)
        )
          return false;
        if (filters.due === "overdue" && !rfi.isOverdue) return false;
        if (filters.due === "due_soon" && !rfi.dueSoon) return false;
        if (!query) return true;
        return [
          rfi.rfiNumber,
          rfi.subject,
          rfi.question,
          rfi.contractorSuggestion,
          rfi.drawingReferences,
          rfi.specificationReferences,
          rfi.responsibleParty,
          rfi.latestResponse,
          rfi.legacyReference,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    );
  }

  function sortRfis(rfis) {
    const direction = filters.direction === "asc" ? 1 : -1;
    return [...rfis].sort((a, b) => {
      let comparison = 0;
      if (filters.sort === "subject")
        comparison = collate(a.subject, b.subject);
      else if (filters.sort === "updated")
        comparison = compareDate(a.updatedAt, b.updatedAt);
      else if (filters.sort === "created")
        comparison = compareDate(a.createdAt, b.createdAt);
      else if (filters.sort === "due")
        comparison = compareDate(
          a.requestedResponseDate,
          b.requestedResponseDate,
        );
      else comparison = collateNumber(a.rfiNumber || "~", b.rfiNumber || "~");
      return comparison
        ? comparison * direction
        : String(a.id).localeCompare(String(b.id));
    });
  }

  function numberCell(rfi) {
    const reserved = rfi.issuanceReconciliationState === "legacy_incomplete";
    const number = rfi.rfiNumber
      ? `<span class="rfi-number">${reserved ? "Reserved " : ""}${escapeHtml(rfi.rfiNumber)}</span>`
      : '<span class="rfi-number rfi-number-draft">Unnumbered Draft</span>';
    const legacy = rfi.legacyReference
      ? `<span class="rfi-legacy">Legacy ${escapeHtml(rfi.legacyReference)}</span>`
      : "";
    return `${number}${legacy}`;
  }

  function statusCell(rfi) {
    if (rfi.issuanceReconciliationState === "legacy_incomplete") {
      return '<span class="status-badge status-attention">Needs issue repair</span>';
    }
    const flag = rfi.isOverdue
      ? '<span class="rfi-flag rfi-flag-overdue">Overdue</span>'
      : rfi.dueSoon
        ? '<span class="rfi-flag rfi-flag-soon">Due soon</span>'
        : "";
    return `<span class="status-badge status-${rfiStatusTone(rfi.status)}">${escapeHtml(rfiStatusLabel(rfi.status))}</span>${flag}`;
  }

  function rawValue(rfi, field) {
    return rfi[field] ?? "";
  }

  function displayValue(rfi, field) {
    if (field === "responsiblePartyId") {
      if (rfi.responsiblePartyLegacyText)
        return `${rfi.responsiblePartyLegacyText} (unresolved)`;
      return rfi.responsibleParty || "—";
    }
    if (field === "requestedResponseDate") return formatDate(rfi[field]) || "—";
    return rfi[field] || "—";
  }

  function editorMarkup(rfi, field) {
    const meta = EDITABLE_FIELDS[field];
    const value = rawValue(rfi, field);
    if (meta.type === "contact") {
      return `<select class="rfi-cell-editor" data-cell-editor aria-label="${escapeHtml(meta.label)}">
        <option value="">Unassigned</option>
        ${state.data.responsibleContacts
          .map(
            (contact) =>
              `<option value="${escapeHtml(contact.id)}"${contact.id === value ? " selected" : ""}>${escapeHtml(contact.name)}${contact.companyName ? ` — ${escapeHtml(contact.companyName)}` : ""}</option>`,
          )
          .join("")}
      </select>`;
    }
    if (meta.type === "textarea") {
      return `<textarea class="rfi-cell-editor" data-cell-editor rows="3" aria-label="${escapeHtml(meta.label)}">${escapeHtml(editing?.initialText ?? value)}</textarea>`;
    }
    return `<input class="rfi-cell-editor" data-cell-editor type="${meta.type}" value="${escapeHtml(editing?.initialText ?? value)}" aria-label="${escapeHtml(meta.label)}">`;
  }

  function editableCell(rfi, field, className = "") {
    const active = selected?.id === rfi.id && selected?.field === field;
    const isEditing = editing?.id === rfi.id && editing?.field === field;
    const cellState = cellStates.get(`${rfi.id}:${field}`);
    const editable = rfi.capabilities?.updateDraft === true;
    const status = cellState
      ? `<span class="rfi-cell-save-state is-${cellState.status}" role="${cellState.status === "failed" ? "alert" : "status"}">${escapeHtml(cellState.message)}</span>`
      : "";
    return `<td class="rfi-grid-cell ${className}${active ? " is-selected" : ""}${isEditing ? " is-editing" : ""}" data-cell data-id="${escapeHtml(rfi.id)}" data-field="${field}" tabindex="${editable ? "0" : "-1"}" aria-readonly="${editable ? "false" : "true"}"${active ? ' aria-selected="true"' : ""}>
      ${isEditing ? editorMarkup(rfi, field) : `<span class="rfi-cell-text" title="${escapeHtml(displayValue(rfi, field))}">${escapeHtml(displayValue(rfi, field))}</span>`}
      ${status}
    </td>`;
  }

  function tableRows(rfis) {
    return rfis
      .map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        return `<tr class="app-data-row" data-rfi-row="${escapeHtml(rfi.id)}">
          <th scope="row" class="rfi-cell-number"><a href="${href}" data-app-link>${numberCell(rfi)}</a></th>
          ${editableCell(rfi, "subject", "rfi-cell-subject")}
          <td class="rfi-cell-status">${statusCell(rfi)}</td>
          ${editableCell(rfi, "responsiblePartyId", "rfi-cell-responsible")}
          ${editableCell(rfi, "requestedResponseDate", "rfi-cell-due")}
          ${editableCell(rfi, "question", "rfi-cell-long")}
          ${editableCell(rfi, "contractorSuggestion", "rfi-cell-long")}
          ${editableCell(rfi, "drawingReferences", "rfi-cell-reference")}
          ${editableCell(rfi, "specificationReferences", "rfi-cell-reference")}
          <td class="rfi-cell-long"><span class="rfi-cell-text" title="${escapeHtml(rfi.latestResponse || "")}">${escapeHtml(truncate(rfi.latestResponse) || "—")}</span></td>
          <td class="cell-date">${escapeHtml(formatDate(rfi.issuedAt) || "—")}</td>
          <td class="cell-date">${escapeHtml(formatDate(rfi.updatedAt) || "—")}</td>
          <td class="cell-open"><a class="open-link" href="${href}" data-app-link aria-label="Open ${escapeHtml(rfi.subject)}">Open <span aria-hidden="true">→</span></a></td>
        </tr>`;
      })
      .join("");
  }

  function cards(rfis) {
    return rfis
      .map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        return `<li class="rfi-card">
          <a class="rfi-card-main" href="${href}" data-app-link>
            <span class="rfi-card-top">${numberCell(rfi)}${statusCell(rfi)}</span>
            <span class="rfi-card-subject">${escapeHtml(rfi.subject)}</span>
            <span class="rfi-card-question">${escapeHtml(truncate(rfi.question, 120))}</span>
          </a>
          <dl class="rfi-card-facts">
            <div><dt>Responsible</dt><dd>${escapeHtml(displayValue(rfi, "responsiblePartyId"))}</dd></div>
            <div><dt>Response due</dt><dd>${escapeHtml(formatDate(rfi.requestedResponseDate) || "—")}</dd></div>
            <div><dt>Updated</dt><dd>${escapeHtml(formatDate(rfi.updatedAt) || "—")}</dd></div>
          </dl>
        </li>`;
      })
      .join("");
  }

  function resultsMarkup(rfis) {
    const filtered = applyFilters(rfis);
    if (!rfis.length) {
      return `<div class="records-empty"><h3>No RFIs yet</h3><p>Create the first working draft.</p>${canCreate() ? '<button class="secondary-button" type="button" data-create-rfi>Add RFI</button>' : ""}</div>`;
    }
    if (!filtered.length) {
      return '<div class="records-empty" role="status"><p>No RFIs match these filters.</p><button class="secondary-button" type="button" data-clear-filters>Clear all</button></div>';
    }
    return `<div class="records-table-wrap rfi-table-wrap" role="region" aria-label="Project RFI working register" tabindex="0">
      <table class="records-table app-data-table rfi-table" role="grid">
        <caption class="sr-only">Editable project RFI register</caption>
        <thead><tr>
          <th>RFI No.</th><th>Subject</th><th>Status</th><th>Responsible Party</th>
          <th>Response Due</th><th>Question</th><th>Contractor Suggestion</th>
          <th>Drawing References</th><th>Specification References</th>
          <th>Response</th><th>Issued</th><th>Updated</th><th><span class="sr-only">Open</span></th>
        </tr></thead>
        <tbody>${tableRows(filtered)}</tbody>
      </table>
    </div>
    <ul class="rfi-cards" aria-label="Project RFIs">${cards(filtered)}</ul>`;
  }

  function selectMarkup(id, label, options, value) {
    return `<div class="app-field app-filter-field app-register-control"><label class="sr-only" for="${id}">${escapeHtml(label)}</label><select id="${id}"><option value="all">${escapeHtml(label)}</option>${options.map(([key, text]) => `<option value="${escapeHtml(key)}"${key === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></div>`;
  }

  function toolbar(rfis) {
    return `<div class="app-register-toolbar rfi-toolbar">
      <div class="app-register-controls">
        <div class="app-field app-search-field app-register-search app-register-control"><label class="sr-only" for="rfi-search">Search RFIs</label><input id="rfi-search" type="search" placeholder="Search RFIs…" value="${escapeHtml(filters.q)}"></div>
        <div class="app-register-filters">
          ${selectMarkup("rfi-status", "All statuses", statusOptions(rfis), filters.status)}
          ${selectMarkup("rfi-responsible", "All responsible parties", responsibleOptions(rfis), filters.responsible)}
          ${selectMarkup("rfi-due", "Any due status", DUE_OPTIONS.slice(1), filters.due)}
          ${selectMarkup(
            "rfi-sort",
            "Sort",
            Object.entries(SORT_KEYS).map(([key, meta]) => [key, meta.label]),
            filters.sort,
          )}
        </div>
      </div>
      <div class="app-register-filter-state"><button class="text-link" type="button" data-clear-filters${hasActiveFilters() ? "" : " hidden"}>Clear all</button><p class="app-register-result-count" aria-live="polite" data-result-count></p></div>
    </div>`;
  }

  function heading() {
    const total = state.status === "loaded" ? state.data.rfis.length : null;
    return `<header class="app-register-header rfi-heading app-container-register"><div class="app-register-title"><div><h2 id="rfis-title" tabindex="-1">RFIs</h2><p class="rfi-register-hint">Select a draft cell, then press Enter or type to edit.</p></div>${total === null ? "" : `<span class="app-register-count">${total} RFI${total === 1 ? "" : "s"}</span>`}</div>${canCreate() ? `<button class="primary-button" type="button" data-create-rfi${creating ? " disabled" : ""}>${creating ? "Adding…" : "Add RFI"}</button>` : ""}</header>`;
  }

  function body() {
    if (state.status === "loading")
      return '<div class="records-body app-container-register"><section class="records-loading" aria-busy="true"><span class="skeleton-line"></span><span class="skeleton-line"></span></section></div>';
    if (state.status === "missing")
      return '<div class="records-body app-container-register"><section class="inline-error" role="alert"><p>These RFIs are unavailable or you do not have access.</p></section></div>';
    if (state.status === "error")
      return `<div class="records-body app-container-register"><section class="inline-error" role="alert"><p>The RFIs could not be loaded. No changes were made.</p><button class="secondary-button" type="button" data-rfis-retry>Try again</button></section></div>`;
    return `<div class="records-body app-container-register">${toolbar(state.data.rfis)}<div class="records-results" data-results></div></div>`;
  }

  function focusActive(container) {
    const matchingCell = (reference) =>
      [...container.querySelectorAll("[data-cell]")].find(
        (candidate) =>
          candidate.getAttribute("data-id") === reference.id &&
          candidate.getAttribute("data-field") === reference.field,
      );
    if (editing) {
      const editor = matchingCell(editing)?.querySelector("[data-cell-editor]");
      editor?.focus();
      if (editor && editing.initialText == null && editor.select)
        editor.select();
      return;
    }
    if (selected) {
      matchingCell(selected)?.focus();
    }
  }

  function updateResults(container) {
    if (state.status !== "loaded") return;
    if (gridMode === TABULATOR_GRID_MODE) {
      updateTabulatorResults(container);
    } else {
      const region = container.querySelector("[data-results]");
      if (region) region.innerHTML = resultsMarkup(state.data.rfis);
      bindResults(container);
      focusActive(container);
    }
    const filtered = applyFilters(state.data.rfis);
    const total = state.data.rfis.length;
    const count = container.querySelector("[data-result-count]");
    if (count)
      count.textContent = hasActiveFilters()
        ? `${filtered.length} of ${total} RFI${total === 1 ? "" : "s"}`
        : "";
    const headingCount = container.querySelector(".app-register-count");
    if (headingCount)
      headingCount.textContent = `${total} RFI${total === 1 ? "" : "s"}`;
  }

  // --- Tabulator prototype (desktop grid only) -----------------------------

  function ensureGrid() {
    if (tabulatorGrid) return tabulatorGrid;
    tabulatorGrid = createRfiTabulatorGrid({
      projectId,
      loadTabulator: tabulatorLoader,
      getRows: () => applyFilters(state.data.rfis),
      getContacts: () => state.data.responsibleContacts,
      commit: tabulatorCommit,
      onOpen: (id) => navigate(rfiWorkspaceHref(projectId, id)),
      announce,
      window: appWindow,
    });
    return tabulatorGrid;
  }

  function destroyGrid() {
    tabulatorGrid?.destroy();
    tabulatorGrid = null;
  }

  // Authoritative save for a single Tabulator cell edit. Sends only the changed
  // field plus the current lock version, updates the authoritative row on
  // success, and reloads the authorized list on a version conflict or
  // permission loss — always keeping the URL filter/sort state.
  async function tabulatorCommit({ id, field, value }) {
    const rfi = state.data.rfis.find((item) => item.id === id);
    if (!rfi) return { status: "error", message: "This RFI is no longer available." };
    const validation = tabulatorValidateField(field, value);
    if (validation) return { status: "invalid", message: validation };
    const normalized = normalizeCellValue(value);
    if (normalized === normalizeCellValue(rawValue(rfi, field)))
      return { status: "unchanged" };
    try {
      const { data } = await api.updateRfi(
        projectId,
        id,
        buildPatchPayload(field, value, rfi.lockVersion),
      );
      Object.assign(rfi, data || {});
      return { status: "saved", row: { ...rfi } };
    } catch (error) {
      if (error.status === 409) {
        try {
          await refreshLatestRows();
        } catch {
          // Keep the current rows if the refresh itself fails.
        }
        return {
          status: "conflict",
          message: "Changed elsewhere. Latest value loaded; review and retry.",
          rows: applyFilters(state.data.rfis),
        };
      }
      if (error.status === 403) {
        try {
          await refreshLatestRows();
        } catch {
          // Capabilities may not refresh; the cell still becomes read-only.
        }
        return {
          status: "permission",
          message: "You no longer have permission to edit this draft.",
          rows: applyFilters(state.data.rfis),
        };
      }
      return {
        status: "error",
        message: error.message || "Could not save. Try again.",
      };
    }
  }

  function bindTabulatorRegion(container) {
    container
      .querySelectorAll("[data-results] [data-clear-filters]")
      .forEach((button) =>
        button.addEventListener("click", () => clearFilters(container)),
      );
    container
      .querySelector("[data-results] [data-create-rfi]")
      ?.addEventListener("click", () => addRfi(container));
  }

  function updateTabulatorResults(container) {
    const region = container.querySelector("[data-results]");
    if (!region) return;
    const rfis = state.data.rfis;
    const filtered = applyFilters(rfis);
    if (!rfis.length) {
      destroyGrid();
      region.innerHTML = `<div class="records-empty"><h3>No RFIs yet</h3><p>Create the first working draft.</p>${canCreate() ? '<button class="secondary-button" type="button" data-create-rfi>Add RFI</button>' : ""}</div>`;
      bindTabulatorRegion(container);
      return;
    }
    let host = region.querySelector("[data-tabulator-host]");
    if (!host) {
      region.innerHTML = `<div class="records-table-wrap rfi-table-wrap rfi-tabulator-wrap" role="region" aria-label="Project RFI working register (Tabulator prototype)"><div class="rfi-tabulator-host" data-tabulator-host></div></div>
      <p class="rfi-tabulator-empty" role="status" data-filtered-empty${filtered.length ? " hidden" : ""}>No RFIs match these filters. <button class="text-link" type="button" data-clear-filters>Clear all</button></p>
      <ul class="rfi-cards" aria-label="Project RFIs" data-rfi-cards>${cards(filtered)}</ul>`;
      host = region.querySelector("[data-tabulator-host]");
      ensureGrid();
      tabulatorGrid.mount(host);
      bindTabulatorRegion(container);
    }
    tabulatorGrid?.setRows(filtered);
    const cardsEl = region.querySelector("[data-rfi-cards]");
    if (cardsEl) cardsEl.innerHTML = cards(filtered);
    const emptyNote = region.querySelector("[data-filtered-empty]");
    if (emptyNote) emptyNote.hidden = filtered.length > 0;
  }

  function startEdit(container, id, field, initialText = null) {
    const rfi = state.data.rfis.find((item) => item.id === id);
    if (!rfi?.capabilities?.updateDraft) return;
    selected = { id, field };
    editing = {
      id,
      field,
      original: String(rawValue(rfi, field)),
      initialText,
      committing: false,
    };
    cellStates.delete(`${id}:${field}`);
    updateResults(container);
  }

  function cancelEdit(container) {
    if (!editing) return;
    selected = { id: editing.id, field: editing.field };
    editing = null;
    updateResults(container);
  }

  function orderedCellRefs() {
    const rows = applyFilters(state.data.rfis).filter(
      (rfi) => rfi.capabilities?.updateDraft,
    );
    return rows.flatMap((rfi) =>
      EDITABLE_ORDER.map((field) => ({ id: rfi.id, field })),
    );
  }

  function adjacentCell(id, field, direction) {
    const cells = orderedCellRefs();
    const index = cells.findIndex(
      (cell) => cell.id === id && cell.field === field,
    );
    return cells[index + direction] || cells[index] || null;
  }

  function validationMessage(field, value) {
    if ((field === "subject" || field === "question") && !value) {
      return `${EDITABLE_FIELDS[field].label} is required.`;
    }
    if (
      field === "requestedResponseDate" &&
      value &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return "Response due must be a valid date.";
    }
    return null;
  }

  async function refreshLatestRows() {
    const { data } = await api.getProjectRfis(projectId);
    state.data.rfis = Array.isArray(data?.rfis) ? data.rfis : state.data.rfis;
    state.data.responsibleContacts = Array.isArray(data?.responsibleContacts)
      ? data.responsibleContacts
      : state.data.responsibleContacts;
  }

  async function commitEdit(container, { move = 0, target = null } = {}) {
    if (!editing || editing.committing) return;
    const edit = editing;
    const cell = [...container.querySelectorAll("[data-cell]")].find(
      (candidate) =>
        candidate.getAttribute("data-id") === edit.id &&
        candidate.getAttribute("data-field") === edit.field,
    );
    const editor = cell?.querySelector("[data-cell-editor]");
    if (!editor) return;
    const nextValue = String(editor.value ?? "").trim();
    const normalized = nextValue || null;
    const current = edit.original || null;
    const destination =
      target || (move ? adjacentCell(edit.id, edit.field, move) : selected);
    const validation = validationMessage(edit.field, nextValue);
    if (validation) {
      cellStates.set(`${edit.id}:${edit.field}`, {
        status: "failed",
        message: validation,
      });
      announce?.(validation);
      updateResults(container);
      return;
    }
    editing.committing = true;
    if (normalized === current) {
      editing = null;
      selected = destination || { id: edit.id, field: edit.field };
      updateResults(container);
      return;
    }
    const key = `${edit.id}:${edit.field}`;
    const rfi = state.data.rfis.find((item) => item.id === edit.id);
    editing = null;
    selected = destination || { id: edit.id, field: edit.field };
    cellStates.set(key, { status: "saving", message: "Saving…" });
    updateResults(container);
    announce?.("Saving…");
    try {
      const { data } = await api.updateRfi(projectId, edit.id, {
        [edit.field]: normalized,
        lockVersion: rfi.lockVersion,
      });
      Object.assign(rfi, data || {});
      cellStates.set(key, { status: "saved", message: "Saved" });
      announce?.(`${EDITABLE_FIELDS[edit.field].label} saved.`);
      updateResults(container);
      appWindow?.setTimeout(() => {
        if (cellStates.get(key)?.status === "saved") {
          cellStates.delete(key);
          if (!destroyed) updateResults(container);
        }
      }, 1400);
    } catch (error) {
      let message = error.message || "Could not save. Try again.";
      if (error.status === 409) {
        try {
          await refreshLatestRows();
        } catch {
          // Keep the current row if the refresh itself fails.
        }
        message = "Changed elsewhere. Latest value loaded; review and retry.";
      } else if (error.status === 403) {
        message = "You no longer have permission to edit this draft.";
      }
      cellStates.set(key, { status: "failed", message });
      announce?.(message);
      updateResults(container);
    }
  }

  function moveSelection(container, id, field, key) {
    const cells = orderedCellRefs();
    const index = cells.findIndex(
      (cell) => cell.id === id && cell.field === field,
    );
    if (index < 0) return;
    const columns = EDITABLE_ORDER.length;
    const delta =
      key === "ArrowLeft"
        ? -1
        : key === "ArrowRight"
          ? 1
          : key === "ArrowUp"
            ? -columns
            : columns;
    selected = cells[index + delta] || cells[index];
    updateResults(container);
  }

  function bindResults(container) {
    container
      .querySelectorAll("[data-results] a[data-app-link]")
      .forEach((link) =>
        link.addEventListener("click", (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey
          )
            return;
          event.preventDefault();
          navigate(link.getAttribute("href"));
        }),
      );
    container.querySelectorAll("[data-cell]").forEach((cell) => {
      const id = cell.getAttribute("data-id");
      const field = cell.getAttribute("data-field");
      cell.addEventListener("click", () => {
        if (editing && (editing.id !== id || editing.field !== field)) {
          commitEdit(container, { target: { id, field } });
          return;
        }
        if (!editing) {
          selected = { id, field };
          updateResults(container);
        }
      });
      cell.addEventListener("keydown", (event) => {
        if (editing?.id === id && editing?.field === field) return;
        if (event.key === "Enter") {
          event.preventDefault();
          startEdit(container, id, field);
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          moveSelection(container, id, field, event.key);
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          EDITABLE_FIELDS[field].type !== "contact" &&
          EDITABLE_FIELDS[field].type !== "date"
        ) {
          event.preventDefault();
          startEdit(container, id, field, event.key);
        }
      });
    });
    container.querySelectorAll("[data-cell-editor]").forEach((editor) => {
      editor.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEdit(container);
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commitEdit(container);
        } else if (event.key === "Tab") {
          event.preventDefault();
          commitEdit(container, { move: event.shiftKey ? -1 : 1 });
        }
      });
      editor.addEventListener("blur", () => {
        appWindow?.setTimeout(() => {
          if (editing && !editing.committing) commitEdit(container);
        }, 0);
      });
    });
    container
      .querySelectorAll("[data-results] [data-clear-filters]")
      .forEach((button) =>
        button.addEventListener("click", () => clearFilters(container)),
      );
    container
      .querySelector("[data-results] [data-create-rfi]")
      ?.addEventListener("click", () => addRfi(container));
  }

  function readFiltersFromUrl() {
    const params = new URLSearchParams(appWindow?.location.search || "");
    const next = defaultFilters();
    next.q = params.get("q") ?? "";
    next.status = params.get("status") ?? "all";
    next.responsible = params.get("responsible") ?? "all";
    next.due = ["overdue", "due_soon"].includes(params.get("due"))
      ? params.get("due")
      : "all";
    next.sort = SORT_KEYS[params.get("sort")] ? params.get("sort") : "number";
    next.direction = ["asc", "desc"].includes(params.get("direction"))
      ? params.get("direction")
      : SORT_KEYS[next.sort].defaultDir;
    filters = next;
    gridMode = readGridMode(appWindow?.location.search || "");
  }

  function syncUrl(push) {
    if (!appWindow) return;
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.responsible !== "all")
      params.set("responsible", filters.responsible);
    if (filters.due !== "all") params.set("due", filters.due);
    if (filters.sort !== "number") params.set("sort", filters.sort);
    if (filters.direction !== SORT_KEYS[filters.sort].defaultDir)
      params.set("direction", filters.direction);
    // The A/B switch is preserved across every register URL update so a reviewer
    // stays in the same implementation while filtering, sorting, and navigating.
    if (gridMode === TABULATOR_GRID_MODE) params.set("grid", TABULATOR_GRID_MODE);
    const query = params.toString();
    appWindow.history[push ? "pushState" : "replaceState"](
      {},
      "",
      `${appWindow.location.pathname}${query ? `?${query}` : ""}${appWindow.location.hash}`,
    );
  }

  function clearFilters(container) {
    const { sort, direction } = filters;
    filters = { ...defaultFilters(), sort, direction };
    syncUrl(true);
    updateResults(container);
  }

  async function addRfi(container) {
    if (!canCreate() || creating) return;
    creating = true;
    requestRender();
    try {
      const { data } = await api.createRfi(projectId, {
        subject: "Untitled RFI",
        question: "Describe the question",
        contractorSuggestion: null,
        drawingReferences: null,
        specificationReferences: null,
        responsiblePartyId: null,
        submittedBy: null,
        requestedResponseDate: null,
        costImpact: null,
        scheduleImpact: null,
      });
      state.data.rfis.push({
        ...data,
        latestResponse: null,
        attachmentCount: 0,
        isOverdue: false,
        dueSoon: false,
        capabilities: { updateDraft: true },
      });
      filters.status = "all";
      filters.q = "";
      syncUrl(false);
      selected = { id: data.id, field: "subject" };
      creating = false;
      updateResults(container);
      if (gridMode === TABULATOR_GRID_MODE) {
        await tabulatorGrid?.setRows(applyFilters(state.data.rfis));
        await tabulatorGrid?.editCell({ id: data.id, field: "subject" });
      } else {
        startEdit(container, data.id, "subject");
      }
      announce?.("New RFI draft added. Subject is ready to edit.");
    } catch (error) {
      creating = false;
      announce?.(error.message || "The RFI draft could not be added.");
      requestRender();
    }
  }

  function bindToolbar(container) {
    container
      .querySelector("#rfi-search")
      ?.addEventListener("input", (event) => {
        filters.q = event.target.value;
        syncUrl(false);
        updateResults(container);
      });
    const bind = (selector, apply) =>
      container.querySelector(selector)?.addEventListener("change", (event) => {
        apply(event.target.value);
        syncUrl(true);
        updateResults(container);
      });
    bind("#rfi-status", (value) => (filters.status = value));
    bind("#rfi-responsible", (value) => (filters.responsible = value));
    bind("#rfi-due", (value) => (filters.due = value));
    bind("#rfi-sort", (value) => {
      filters.sort = SORT_KEYS[value] ? value : "number";
      filters.direction = SORT_KEYS[filters.sort].defaultDir;
    });
    container
      .querySelector(".rfi-toolbar [data-clear-filters]")
      ?.addEventListener("click", () => clearFilters(container));
  }

  function mount(container) {
    appWindow = container.ownerDocument.defaultView;
    readFiltersFromUrl();
    if (state.status === "loaded") syncUrl(false);
    // A full re-render replaces the feature container's HTML, detaching any
    // live Tabulator host. Drop the stale instance so the grid is recreated
    // cleanly into the new host; in-register interactions use updateResults
    // (targeted DOM updates) and keep the same instance alive.
    destroyGrid();
    container.innerHTML = `<section class="workspace-page rfis-view app-register-page">${heading()}${body()}</section>`;
    container
      .querySelector("[data-rfis-retry]")
      ?.addEventListener("click", () => reload());
    container
      .querySelector(".rfi-heading [data-create-rfi]")
      ?.addEventListener("click", () => addRfi(container));
    if (state.status === "loaded") {
      bindToolbar(container);
      updateResults(container);
    }
  }

  function destroy() {
    destroyed = true;
    controller?.abort();
    destroyGrid();
  }

  return { mount, reload, destroy };
}
