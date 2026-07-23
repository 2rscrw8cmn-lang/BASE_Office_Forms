// Project RFI register. Rows are a clean read-only summary; clicking an
// editable draft's subject opens one inline editor panel beneath the row with
// every editable field as an ordinary form control, each saved on commit
// (blur / Enter / selection) through the per-field update service. Only one
// row's editor is open at a time. Optimistic-concurrency failures reload the
// latest values while preserving URL filter/sort state.
import {
  escapeHtml,
  formatDate,
  formatRelativeUpdated,
  formatShortDate,
  rfiDueUrgencyText,
  rfiStatusLabel,
  rfiStatusTone,
} from "./app-format.js";

const SORT_KEYS = {
  number: { label: "RFI number", defaultDir: "asc" },
  updated: { label: "Recently updated", defaultDir: "desc" },
  // "created" has no dedicated header (the register only sorts by its five
  // visible columns) but stays a valid key so old bookmarked/shared URLs
  // still parse instead of silently resetting to the default sort.
  created: { label: "Newest", defaultDir: "desc" },
  subject: { label: "Subject A–Z", defaultDir: "asc" },
  responsible: { label: "Party", defaultDir: "asc" },
  due: { label: "Response due date", defaultDir: "asc" },
};

// Header label + sort key for each sortable desktop column, in display order.
const SORT_HEADERS = [
  ["number", "RFI"],
  ["subject", "Subject"],
  ["responsible", "Party"],
  ["due", "Due"],
  ["updated", "Updated"],
];

const DUE_OPTIONS = [
  ["all", "Any due status"],
  ["overdue", "Overdue"],
  ["due_soon", "Due soon"],
];

// Every field the register editor can edit, in panel display order. `wide`
// fields span both columns of the editor grid.
const EDITABLE_FIELDS = {
  subject: { label: "Subject", type: "text", wide: true },
  responsiblePartyId: { label: "Party", type: "contact" },
  requestedResponseDate: { label: "Response due", type: "date" },
  question: { label: "Question", type: "textarea", wide: true },
  contractorSuggestion: {
    label: "Contractor suggestion",
    type: "textarea",
    wide: true,
  },
  drawingReferences: { label: "Drawing references", type: "text" },
  specificationReferences: { label: "Specification references", type: "text" },
};
const PANEL_ORDER = Object.keys(EDITABLE_FIELDS);

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
function responsibleSortKey(rfi) {
  return rfi.responsibleParty || rfi.responsiblePartyLegacyText || "";
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
}) {
  let state = { status: "loading", data: null, error: null };
  let filters = defaultFilters();
  let controller = null;
  let destroyed = false;
  let appWindow = null;
  let creating = false;
  let editorOpen = null; // rfi id whose inline editor panel is open
  let focusAfterRender = null; // selector to focus once after a full render
  const fieldStates = new Map(); // "id:field" -> { status, message }

  async function reload({ quiet = false } = {}) {
    controller?.abort();
    controller = new AbortController();
    if (!quiet) {
      state = { status: "loading", data: null, error: null };
      editorOpen = null;
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
      else if (filters.sort === "responsible")
        comparison = collate(responsibleSortKey(a), responsibleSortKey(b));
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

  // Desktop "RFI" identity column: number/draft label stacked above a plain
  // status text line. Kept separate from numberCell/statusCell above so the
  // unchanged mobile cards keep their existing inline number+badge layout.
  function identityCell(rfi) {
    const isLegacyIncomplete =
      rfi.issuanceReconciliationState === "legacy_incomplete";
    const numberText = rfi.rfiNumber || "Unnumbered";
    const numberClass = rfi.rfiNumber
      ? "rfi-id-number"
      : "rfi-id-number rfi-id-number-draft";
    const statusText = isLegacyIncomplete
      ? "Needs issue repair"
      : rfiStatusLabel(rfi.status);
    const legacy = rfi.legacyReference
      ? `<span class="rfi-id-legacy">Legacy ${escapeHtml(rfi.legacyReference)}</span>`
      : "";
    return `<span class="${numberClass}">${escapeHtml(numberText)}</span><span class="rfi-id-status${isLegacyIncomplete ? " is-attention" : ""}">${escapeHtml(statusText)}</span>${legacy}`;
  }

  // Subject cell. Editable drafts render the subject as a button that toggles
  // the row's inline editor; locked rows render it as a plain workspace link.
  function subjectCell(rfi, href) {
    const editable = rfi.capabilities?.updateDraft === true;
    const questionPreview = truncate(rfi.question, 90);
    const refs = [rfi.drawingReferences, rfi.specificationReferences]
      .filter(Boolean)
      .join(" · ");
    const subjectText = escapeHtml(rfi.subject || "Untitled RFI");
    const title = editable
      ? `<button type="button" class="rfi-subject-open" data-subject-edit data-id="${escapeHtml(rfi.id)}" aria-expanded="${editorOpen === rfi.id}" aria-controls="rfi-editor-${escapeHtml(rfi.id)}"><span class="rfi-subject-open-text">${subjectText}</span></button>`
      : `<a class="rfi-subject-link" href="${href}" data-app-link title="${escapeHtml(rfi.subject || "")}">${subjectText}</a>`;
    return `<td class="rfi-cell-subject" data-subject-cell data-id="${escapeHtml(rfi.id)}">
      ${title}
      ${questionPreview ? `<span class="rfi-subject-secondary">${escapeHtml(questionPreview)}</span>` : ""}
      ${refs ? `<span class="rfi-subject-meta">${escapeHtml(refs)}</span>` : ""}
    </td>`;
  }

  function responsibleDisplay(rfi) {
    if (rfi.responsiblePartyLegacyText) {
      return `<span class="rfi-cell-text">${escapeHtml(rfi.responsiblePartyLegacyText)} <span class="rfi-responsible-legacy">(unresolved)</span></span>`;
    }
    if (!rfi.responsibleParty) {
      return '<span class="rfi-cell-text rfi-responsible-empty">Unassigned</span>';
    }
    const contact = state.data.responsibleContacts.find(
      (item) => item.id === rfi.responsiblePartyId,
    );
    const company = contact?.companyName
      ? `<span class="rfi-responsible-company">${escapeHtml(contact.companyName)}</span>`
      : "";
    return `<span class="rfi-cell-text">${escapeHtml(rfi.responsibleParty)}</span>${company}`;
  }

  function dueDisplay(rfi) {
    const dateText = formatShortDate(rfi.requestedResponseDate) || "—";
    const urgency = rfiDueUrgencyText(rfi.requestedResponseDate, rfi.isOverdue);
    const tone = rfi.isOverdue
      ? " is-overdue"
      : rfi.dueSoon
        ? " is-due-soon"
        : "";
    return `<span class="rfi-cell-text rfi-due-date">${escapeHtml(dateText)}</span>${urgency ? `<span class="rfi-due-urgency${tone}">${escapeHtml(urgency)}</span>` : ""}`;
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

  function fieldStateInner(id, field) {
    const st = fieldStates.get(`${id}:${field}`);
    return st
      ? `<span class="rfi-cell-save-state is-${st.status}" role="${st.status === "failed" ? "alert" : "status"}">${escapeHtml(st.message)}</span>`
      : "";
  }

  function panelControl(rfi, field, inputId) {
    const meta = EDITABLE_FIELDS[field];
    const value = rfi[field] ?? "";
    const attrs = `id="${inputId}" data-field-input data-id="${escapeHtml(rfi.id)}" data-field="${field}"`;
    if (meta.type === "contact") {
      return `<select ${attrs}>
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
      return `<textarea ${attrs} rows="3">${escapeHtml(value)}</textarea>`;
    }
    return `<input ${attrs} type="${meta.type}" value="${escapeHtml(value)}">`;
  }

  function panelField(rfi, field) {
    const meta = EDITABLE_FIELDS[field];
    const inputId = `rfi-edit-${rfi.id}-${field}`;
    const legacyNote =
      field === "responsiblePartyId" && rfi.responsiblePartyLegacyText
        ? `<small class="rfi-legacy-note">Legacy value “${escapeHtml(rfi.responsiblePartyLegacyText)}” remains until a contact is selected.</small>`
        : "";
    return `<div class="app-field rfi-editor-field${meta.wide ? " is-wide" : ""}">
      <label for="${inputId}">${escapeHtml(meta.label)}</label>
      ${panelControl(rfi, field, inputId)}
      ${legacyNote}
      <span class="rfi-field-state" data-field-state="${escapeHtml(rfi.id)}:${field}">${fieldStateInner(rfi.id, field)}</span>
    </div>`;
  }

  function editorRow(rfi) {
    if (rfi.capabilities?.updateDraft !== true) return "";
    const open = editorOpen === rfi.id;
    return `<tr class="rfi-editor-row" id="rfi-editor-${escapeHtml(rfi.id)}" data-editor-row="${escapeHtml(rfi.id)}"${open ? "" : " hidden"}>
      <td colspan="5">
        <div class="rfi-editor-panel" role="group" aria-label="Edit ${escapeHtml(rfi.subject || "this RFI")}">
          <div class="rfi-editor-grid">
            ${PANEL_ORDER.map((field) => panelField(rfi, field)).join("")}
          </div>
          <div class="rfi-editor-foot"><button type="button" class="secondary-button is-quiet" data-editor-done data-id="${escapeHtml(rfi.id)}">Done</button></div>
        </div>
      </td>
    </tr>`;
  }

  function mainRowCells(rfi) {
    const href = rfiWorkspaceHref(projectId, rfi.id);
    return `<th scope="row" class="rfi-cell-id"><a class="rfi-id-link" href="${href}" data-app-link aria-label="Open RFI ${escapeHtml(rfi.rfiNumber || "Unnumbered")}">${identityCell(rfi)}</a></th>
      ${subjectCell(rfi, href)}
      <td class="rfi-cell-responsible">${responsibleDisplay(rfi)}</td>
      <td class="rfi-cell-due">${dueDisplay(rfi)}</td>
      <td class="rfi-cell-updated"><span class="rfi-updated-text" title="${escapeHtml(formatDate(rfi.updatedAt) || "")}">${escapeHtml(formatRelativeUpdated(rfi.updatedAt) || "—")}</span></td>`;
  }

  function tableRows(rfis) {
    return rfis
      .map((rfi) => {
        const editable = rfi.capabilities?.updateDraft === true;
        return `<tr class="app-data-row${editable ? "" : " is-locked"}" data-rfi-row="${escapeHtml(rfi.id)}">${mainRowCells(rfi)}</tr>${editorRow(rfi)}`;
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
            <div><dt>Party</dt><dd>${escapeHtml(displayValue(rfi, "responsiblePartyId"))}</dd></div>
            <div><dt>Response due</dt><dd>${escapeHtml(formatDate(rfi.requestedResponseDate) || "—")}</dd></div>
            <div><dt>Updated</dt><dd>${escapeHtml(formatDate(rfi.updatedAt) || "—")}</dd></div>
          </dl>
        </li>`;
      })
      .join("");
  }

  function sortHeader(key, label) {
    const active = filters.sort === key;
    const direction = filters.direction === "asc" ? "ascending" : "descending";
    const arrow = filters.direction === "asc" ? "↑" : "↓";
    const nextDirectionLabel = active
      ? filters.direction === "asc"
        ? "descending"
        : "ascending"
      : SORT_KEYS[key].defaultDir === "asc"
        ? "ascending"
        : "descending";
    return `<th scope="col" aria-sort="${active ? direction : "none"}"><button type="button" class="rfi-sort-header${active ? " is-active" : ""}" data-sort-header="${key}" aria-label="Sort by ${escapeHtml(label)}, ${nextDirectionLabel}">${escapeHtml(label)}${active ? ` <span class="rfi-sort-arrow" aria-hidden="true">${arrow}</span>` : ""}</button></th>`;
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
      <table class="records-table app-data-table rfi-table" role="grid" aria-describedby="rfi-register-hint">
        <caption class="sr-only">Editable project RFI register</caption>
        <thead><tr>
          ${SORT_HEADERS.map(([key, label]) => sortHeader(key, label)).join("")}
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
          ${selectMarkup("rfi-responsible", "All parties", responsibleOptions(rfis), filters.responsible)}
          ${selectMarkup("rfi-due", "Any due status", DUE_OPTIONS.slice(1), filters.due)}
        </div>
      </div>
      <div class="app-register-filter-state"><button class="text-link" type="button" data-clear-filters${hasActiveFilters() ? "" : " hidden"}>Clear all</button><p class="app-register-result-count" aria-live="polite" data-result-count></p></div>
    </div>`;
  }

  function heading() {
    const total = state.status === "loaded" ? state.data.rfis.length : null;
    return `<header class="app-register-header rfi-heading app-container-register">
      <div class="app-register-title">
        <h2 id="rfis-title" tabindex="-1">RFIs</h2>${total === null ? "" : `<span class="app-register-count">${total} RFI${total === 1 ? "" : "s"}</span>`}
      </div>
      <p class="sr-only" id="rfi-register-hint">Click a draft RFI's subject to edit its fields inline. Click a column header to sort.</p>
      ${canCreate() ? `<button class="primary-button" type="button" data-create-rfi${creating ? " disabled" : ""}>${creating ? "Adding…" : "Add RFI"}</button>` : ""}
    </header>`;
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

  function updateResults(container) {
    if (state.status !== "loaded") return;
    const region = container.querySelector("[data-results]");
    if (region) region.innerHTML = resultsMarkup(state.data.rfis);
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
    bindResults(container);
    if (focusAfterRender) {
      const selector = focusAfterRender;
      focusAfterRender = null;
      container.querySelector(selector)?.focus();
    }
  }

  function toggleEditor(container, id) {
    if (editorOpen === id) {
      closeEditor(container);
      return;
    }
    const rfi = state.data.rfis.find((item) => item.id === id);
    if (!rfi?.capabilities?.updateDraft) return;
    editorOpen = id;
    focusAfterRender = `#rfi-edit-${id}-subject`;
    updateResults(container);
    announce?.(`Editing ${rfi.subject || "RFI"}.`);
  }

  function closeEditor(container) {
    const id = editorOpen;
    if (!id) return;
    editorOpen = null;
    focusAfterRender = `[data-subject-edit][data-id="${id}"]`;
    updateResults(container);
    announce?.("Editor closed.");
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

  function setFieldState(container, id, field, status, message) {
    if (status) fieldStates.set(`${id}:${field}`, { status, message });
    else fieldStates.delete(`${id}:${field}`);
    const slot = container.querySelector(`[data-field-state="${id}:${field}"]`);
    if (slot) slot.innerHTML = fieldStateInner(id, field);
  }

  // Refresh a row's read-only summary cells in place (subject text, question
  // preview, references, party, due) without touching the open editor panel,
  // so a per-field save is reflected above without disturbing focus.
  function refreshRowDisplay(container, rfi) {
    const row = container.querySelector(
      `tr.app-data-row[data-rfi-row="${rfi.id}"]`,
    );
    if (!row) return;
    row.innerHTML = mainRowCells(rfi);
    bindRow(container, row);
  }

  async function saveField(container, id, field, rawValue) {
    const rfi = state.data.rfis.find((item) => item.id === id);
    if (!rfi?.capabilities?.updateDraft) return;
    const nextText = String(rawValue ?? "").trim();
    const normalized = nextText || null;
    const current = (rfi[field] ?? "") || null;
    const validation = validationMessage(field, nextText);
    if (validation) {
      setFieldState(container, id, field, "failed", validation);
      announce?.(validation);
      return;
    }
    if (normalized === current) {
      setFieldState(container, id, field, null);
      return;
    }
    setFieldState(container, id, field, "saving", "Saving…");
    announce?.("Saving…");
    try {
      const { data } = await api.updateRfi(projectId, id, {
        [field]: normalized,
        lockVersion: rfi.lockVersion,
      });
      Object.assign(rfi, data || {});
      setFieldState(container, id, field, "saved", "Saved");
      refreshRowDisplay(container, rfi);
      announce?.(`${EDITABLE_FIELDS[field].label} saved.`);
      appWindow?.setTimeout(() => {
        if (destroyed) return;
        if (fieldStates.get(`${id}:${field}`)?.status === "saved") {
          setFieldState(container, id, field, null);
        }
      }, 1400);
    } catch (error) {
      if (error.status === 409) {
        try {
          await refreshLatestRows();
        } catch {
          // Keep current rows if the refresh itself fails.
        }
        fieldStates.set(`${id}:${field}`, {
          status: "failed",
          message: "Changed elsewhere. Latest values loaded; review and retry.",
        });
        announce?.("This RFI changed elsewhere. Latest values were loaded.");
        // A conflict replaced the row data, so re-render both row and panel.
        updateResults(container);
        return;
      }
      const message =
        error.status === 403
          ? "You no longer have permission to edit this draft."
          : error.message || "Could not save. Try again.";
      setFieldState(container, id, field, "failed", message);
      announce?.(message);
    }
  }

  function bindRow(container, row) {
    row.querySelectorAll("a[data-app-link]").forEach((link) =>
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
    row.querySelectorAll("[data-subject-edit]").forEach((button) => {
      const id = button.getAttribute("data-id");
      button.addEventListener("click", () => toggleEditor(container, id));
    });
  }

  function bindResults(container) {
    container
      .querySelectorAll("[data-results] tr.app-data-row")
      .forEach((row) => bindRow(container, row));
    // Mobile card links live outside the table rows.
    container
      .querySelectorAll("[data-results] .rfi-card a[data-app-link]")
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
    container
      .querySelectorAll("[data-editor-done]")
      .forEach((button) =>
        button.addEventListener("click", () => closeEditor(container)),
      );
    container.querySelectorAll("[data-field-input]").forEach((input) => {
      const id = input.getAttribute("data-id");
      const field = input.getAttribute("data-field");
      input.addEventListener("change", () =>
        saveField(container, id, field, input.value),
      );
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          // Commit any pending change before the panel closes.
          input.blur();
          closeEditor(container);
        } else if (
          event.key === "Enter" &&
          input.tagName !== "TEXTAREA" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          input.blur();
        }
      });
    });
    container.querySelectorAll("[data-subject-edit]").forEach((button) => {
      const id = button.getAttribute("data-id");
      button.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && editorOpen === id) {
          event.preventDefault();
          closeEditor(container);
        }
      });
    });
    container
      .querySelectorAll("[data-results] [data-sort-header]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.getAttribute("data-sort-header");
          if (filters.sort === key) {
            filters.direction = filters.direction === "asc" ? "desc" : "asc";
          } else {
            filters.sort = key;
            filters.direction = SORT_KEYS[key].defaultDir;
          }
          syncUrl(true);
          updateResults(container);
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
      editorOpen = data.id;
      focusAfterRender = `#rfi-edit-${data.id}-subject`;
      creating = false;
      updateResults(container);
      announce?.("New RFI draft added. Its subject is ready to edit.");
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
    container
      .querySelector(".rfi-toolbar [data-clear-filters]")
      ?.addEventListener("click", () => clearFilters(container));
  }

  function mount(container) {
    appWindow = container.ownerDocument.defaultView;
    readFiltersFromUrl();
    if (state.status === "loaded") syncUrl(false);
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
  }

  return { mount, reload, destroy };
}
