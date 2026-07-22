// Project RFI register feature module. Renders below the shell-owned project
// header/tabs: an authorized list of the project's RFIs as a semantic data table
// on desktop and dedicated RFI cards on mobile, with a toolbar for search,
// status / responsible-party / overdue filters, sorting, a live result count,
// and a capability-gated "New RFI" action.
//
// One server read model (`getProjectRfis`) returns every row plus per-row
// capabilities, lockVersion, and server-computed overdue/due-soon flags — the
// table never issues a request per row. Search/filter/sort run in the browser
// over that already-authorized data and are mirrored into the URL query string.
// Short draft fields (subject, responsible party, requested response date) are
// inline-editable in place through the authoritative RFI update service under
// optimistic concurrency (lockVersion); long-form fields are edited in the
// workspace. The table and workspace read the same authoritative RFI record.
import {
  escapeHtml,
  formatDate,
  rfiStatusLabel,
  rfiStatusTone,
  rfiNumberLabel,
} from "./app-format.js";
import { createRfiCreateForm } from "./rfi-create-form.js";

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
  responsibleParty: { label: "Responsible party", type: "text" },
  requestedResponseDate: { label: "Requested response date", type: "date" },
};

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
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
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
  let openForm = null;
  let editing = null; // { id, field }
  const saving = new Set();
  let rowError = null; // { id, message }

  async function reload() {
    if (controller) controller.abort();
    controller = new AbortController();
    state = { status: "loading", data: null, error: null };
    editing = null;
    rowError = null;
    requestRender();
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
          capabilities: data?.capabilities || {},
        },
        error: null,
      };
      requestRender();
    } catch (error) {
      if (destroyed || error.aborted) return;
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
    const present = [
      ...new Set(rfis.map((rfi) => rfi.responsibleParty).filter(Boolean)),
    ];
    return present.sort(collate).map((value) => [value, value]);
  }

  function statusOptions(rfis) {
    const present = [...new Set(rfis.map((rfi) => rfi.status))];
    const order = [
      "draft",
      "ready_to_issue",
      "open",
      "response_received",
      "returned_for_clarification",
      "closed",
      "void",
    ];
    return order
      .filter((value) => present.includes(value))
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
    const filtered = rfis.filter((rfi) => {
      if (filters.status !== "all" && rfi.status !== filters.status)
        return false;
      if (
        filters.responsible !== "all" &&
        (rfi.responsibleParty || "") !== filters.responsible
      )
        return false;
      if (filters.due === "overdue" && !rfi.isOverdue) return false;
      if (filters.due === "due_soon" && !rfi.dueSoon) return false;
      if (!query) return true;
      const haystack = [
        rfi.rfiNumber || "",
        rfi.subject,
        rfi.question,
        rfi.responsibleParty || "",
        rfi.latestResponse || "",
        rfi.legacyReference || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return sortRfis(filtered);
  }

  function sortRfis(rfis) {
    const dir = filters.direction === "asc" ? 1 : -1;
    const key = filters.sort;
    return [...rfis].sort((a, b) => {
      let cmp = 0;
      if (key === "subject") cmp = collate(a.subject, b.subject);
      else if (key === "updated") cmp = compareDate(a.updatedAt, b.updatedAt);
      else if (key === "created") cmp = compareDate(a.createdAt, b.createdAt);
      else if (key === "due")
        cmp = compareDate(a.requestedResponseDate, b.requestedResponseDate);
      else cmp = collateNumber(a.rfiNumber || "~", b.rfiNumber || "~");
      const primary = cmp * dir;
      if (primary !== 0) return primary;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  // ---- markup -----------------------------------------------------------

  function statusCell(rfi) {
    const flags = [];
    if (rfi.isOverdue)
      flags.push(`<span class="rfi-flag rfi-flag-overdue">Overdue</span>`);
    else if (rfi.dueSoon)
      flags.push(`<span class="rfi-flag rfi-flag-soon">Due soon</span>`);
    return `<span class="status-badge status-${rfiStatusTone(rfi.status)}">${escapeHtml(rfiStatusLabel(rfi.status))}</span>${flags.join("")}`;
  }

  function numberCell(rfi) {
    const number = rfi.rfiNumber
      ? `<span class="rfi-number">${escapeHtml(rfi.rfiNumber)}</span>`
      : `<span class="rfi-number rfi-number-draft">Unnumbered Draft</span>`;
    const legacy = rfi.legacyReference
      ? `<span class="rfi-legacy" title="Imported legacy reference">Legacy ${escapeHtml(rfi.legacyReference)}</span>`
      : "";
    return `${number}${legacy}`;
  }

  // An editable short-field cell. When this cell is the active edit target it
  // renders an input; otherwise the value plus an edit affordance (draft rows
  // with update capability only). Non-editable rows render plain text.
  function editableCell(rfi, field) {
    const meta = EDITABLE_FIELDS[field];
    const raw = rfi[field];
    const display =
      field === "requestedResponseDate"
        ? formatDate(raw) || "—"
        : escapeHtml(raw || "—");
    const editable = rfi.capabilities?.updateDraft === true;
    if (editing && editing.id === rfi.id && editing.field === field) {
      const value = escapeHtml(raw || "");
      const inputType = meta.type === "date" ? "date" : "text";
      return `<form class="rfi-inline-form" data-inline-form data-id="${escapeHtml(rfi.id)}" data-field="${field}">
        <input class="rfi-inline-input" type="${inputType}" name="value" value="${value}"
          aria-label="${escapeHtml(meta.label)}" />
        <button type="submit" class="rfi-inline-save" aria-label="Save">✓</button>
        <button type="button" class="rfi-inline-cancel" data-inline-cancel aria-label="Cancel">✕</button>
      </form>`;
    }
    const busy = saving.has(`${rfi.id}:${field}`);
    const error =
      rowError && rowError.id === rfi.id && rowError.field === field
        ? `<span class="rfi-inline-error" role="alert">${escapeHtml(rowError.message)}</span>`
        : "";
    if (!editable) {
      return field === "requestedResponseDate"
        ? `${display}`
        : `<span class="rfi-cell-text">${display}</span>`;
    }
    return `<span class="rfi-editable${busy ? " is-saving" : ""}">
      <span class="rfi-cell-text">${display}</span>
      <button type="button" class="rfi-edit-trigger" data-edit="${escapeHtml(rfi.id)}" data-field="${field}"
        aria-label="Edit ${escapeHtml(meta.label)}"${busy ? " disabled" : ""}>${busy ? "…" : "Edit"}</button>
      ${error}
    </span>`;
  }

  function tableRows(rfis) {
    return rfis
      .map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        return `<tr class="app-data-row" data-app-row data-href="${href}">
          <th scope="row" class="rfi-cell-number">${numberCell(rfi)}</th>
          <td class="rfi-cell-subject"><a href="${href}" data-app-link>${editableCell(rfi, "subject")}</a></td>
          <td class="rfi-cell-status">${statusCell(rfi)}</td>
          <td class="rfi-cell-responsible">${editableCell(rfi, "responsibleParty")}</td>
          <td class="cell-date">${escapeHtml(formatDate(rfi.issuedAt) || "—")}</td>
          <td class="rfi-cell-due">${editableCell(rfi, "requestedResponseDate")}</td>
          <td class="rfi-cell-long">${escapeHtml(truncate(rfi.question)) || "—"}</td>
          <td class="rfi-cell-long">${rfi.latestResponse ? escapeHtml(truncate(rfi.latestResponse)) : "—"}</td>
          <td class="cell-date">${escapeHtml(formatDate(rfi.updatedAt) || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  function cards(rfis) {
    return rfis
      .map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        return `<li class="rfi-card">
          <a class="rfi-card-main" href="${href}" data-app-link aria-label="Open RFI ${escapeHtml(rfi.subject)}">
            <span class="rfi-card-top">${numberCell(rfi)}<span class="status-badge status-${rfiStatusTone(rfi.status)}">${escapeHtml(rfiStatusLabel(rfi.status))}</span></span>
            <span class="rfi-card-subject">${escapeHtml(rfi.subject)}</span>
            <span class="rfi-card-question">${escapeHtml(truncate(rfi.question, 120)) || ""}</span>
          </a>
          <dl class="rfi-card-facts">
            <div><dt>Responsible</dt><dd>${escapeHtml(rfi.responsibleParty || "—")}</dd></div>
            <div><dt>Response due</dt><dd>${escapeHtml(formatDate(rfi.requestedResponseDate) || "—")}${rfi.isOverdue ? ' <span class="rfi-flag rfi-flag-overdue">Overdue</span>' : rfi.dueSoon ? ' <span class="rfi-flag rfi-flag-soon">Due soon</span>' : ""}</dd></div>
            <div><dt>Updated</dt><dd>${escapeHtml(formatDate(rfi.updatedAt) || "—")}</dd></div>
          </dl>
        </li>`;
      })
      .join("");
  }

  function resultsMarkup(rfis) {
    const filtered = applyFilters(rfis);
    if (!rfis.length) {
      return `<div class="records-empty"><h3>No RFIs yet</h3><p class="section-empty">Create the first RFI draft for this project to begin tracking questions and responses.</p>${
        canCreate()
          ? `<button class="secondary-button" type="button" data-create-rfi>New RFI</button>`
          : ""
      }</div>`;
    }
    if (!filtered.length) {
      return `<div class="records-empty" role="status"><p class="section-empty">No RFIs match these filters.</p>
        <button class="secondary-button" type="button" data-clear-filters>Clear all</button></div>`;
    }
    return `<div class="records-table-wrap rfi-table-wrap" role="region" aria-label="Project RFIs" tabindex="0">
        <table class="records-table app-data-table rfi-table">
          <caption class="sr-only">RFIs you can access in this project</caption>
          <thead><tr>
            <th scope="col">RFI No.</th>
            <th scope="col">Subject</th>
            <th scope="col">Status</th>
            <th scope="col">Responsible Party</th>
            <th scope="col">Issued</th>
            <th scope="col">Response Due</th>
            <th scope="col">Question</th>
            <th scope="col">Response</th>
            <th scope="col">Updated</th>
          </tr></thead>
          <tbody>${tableRows(filtered)}</tbody>
        </table>
      </div>
      <ul class="rfi-cards" aria-label="Project RFIs">${cards(filtered)}</ul>`;
  }

  function selectMarkup(id, label, options, selected) {
    return `<div class="app-field app-filter-field app-register-control">
        <label class="sr-only" for="${id}">${escapeHtml(label)}</label>
        <select id="${id}">
          <option value="all"${selected === "all" ? " selected" : ""}>${escapeHtml(label)}</option>
          ${options
            .map(
              ([value, text]) =>
                `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(text)}</option>`,
            )
            .join("")}
        </select>
      </div>`;
  }

  function toolbar(rfis) {
    return `<div class="app-register-toolbar rfi-toolbar">
      <div class="app-register-controls">
        <div class="app-field app-search-field app-register-search app-register-control">
          <label class="sr-only" for="rfi-search">Search RFIs</label>
          <input id="rfi-search" type="search" placeholder="Search RFIs..." autocomplete="off" value="${escapeHtml(filters.q)}" />
        </div>
        <div class="app-register-filters">
          ${selectMarkup("rfi-status", "All statuses", statusOptions(rfis), filters.status)}
          ${selectMarkup("rfi-responsible", "All responsible parties", responsibleOptions(rfis), filters.responsible)}
          <div class="app-field app-filter-field app-register-control">
            <label class="sr-only" for="rfi-due">Due status</label>
            <select id="rfi-due">
              ${DUE_OPTIONS.map(([value, text]) => `<option value="${value}"${value === filters.due ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
            </select>
          </div>
          <div class="app-field app-filter-field app-register-control app-register-sort">
            <label class="sr-only" for="rfi-sort">Sort RFIs</label>
            <select id="rfi-sort">
              ${Object.entries(SORT_KEYS).map(([value, { label }]) => `<option value="${value}"${value === filters.sort ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="app-register-filter-state">
        <button class="text-link" type="button" data-clear-filters${hasActiveFilters() ? "" : " hidden"}>Clear all</button>
        <p class="app-register-result-count" aria-live="polite" data-result-count></p>
      </div>
    </div>`;
  }

  function heading() {
    const total = state.status === "loaded" ? state.data.rfis.length : null;
    return `<header class="app-register-header rfi-heading app-container-register">
        <div class="app-register-title">
          <h2 id="rfis-title" tabindex="-1">RFIs</h2>
          ${total === null ? "" : `<span class="app-register-count">${total} RFI${total === 1 ? "" : "s"}</span>`}
        </div>${
          canCreate()
            ? `<button class="primary-button" type="button" data-create-rfi>New RFI</button>`
            : ""
        }
      </header>`;
  }

  function loadingSkeleton() {
    const rows = Array.from({ length: 5 })
      .map(
        () =>
          `<div class="records-skeleton-row"><span class="skeleton-line skeleton-medium"></span><span class="skeleton-line skeleton-short"></span></div>`,
      )
      .join("");
    return `<section class="records-loading" aria-busy="true" aria-label="Loading RFIs">${rows}</section>`;
  }

  function body() {
    if (state.status === "loading")
      return `<div class="records-body app-container-register">${loadingSkeleton()}</div>`;
    if (state.status === "missing")
      return `<div class="records-body app-container-register"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unavailable</p>
          <p>These RFIs are unavailable or you do not have access to this project.</p>
        </section></div>`;
    if (state.status === "error") {
      const requestId = state.error?.requestId;
      return `<div class="records-body app-container-register"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unable to load</p>
          <p>The RFIs could not be loaded. No changes were made.</p>
          ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
          <div class="state-actions"><button class="secondary-button" type="button" data-rfis-retry>Try again</button></div>
        </section></div>`;
    }
    return `<div class="records-body app-container-register">${toolbar(state.data.rfis)}<div class="records-results" data-results></div></div>`;
  }

  function updateResults(container) {
    if (state.status !== "loaded") return;
    const region = container.querySelector("[data-results]");
    if (region) region.innerHTML = resultsMarkup(state.data.rfis);
    const filtered = applyFilters(state.data.rfis);
    const total = state.data.rfis.length;
    const countEl = container.querySelector("[data-result-count]");
    if (countEl)
      countEl.textContent = hasActiveFilters()
        ? `${filtered.length} of ${total} RFI${total === 1 ? "" : "s"}`
        : "";
    const clear = container.querySelector(".rfi-toolbar [data-clear-filters]");
    if (clear) clear.hidden = !hasActiveFilters();
    bindResults(container);
    // Focus an active inline-edit input after re-render.
    const activeInput = container.querySelector("[data-inline-form] input");
    if (activeInput) {
      activeInput.focus();
      activeInput.select?.();
    }
  }

  // ---- inline editing ---------------------------------------------------

  function startEdit(container, id, field) {
    if (saving.size) return;
    editing = { id, field };
    rowError = null;
    updateResults(container);
  }

  function cancelEdit(container) {
    editing = null;
    updateResults(container);
  }

  async function commitEdit(container, form) {
    const id = form.getAttribute("data-id");
    const field = form.getAttribute("data-field");
    const rfi = state.data.rfis.find((item) => item.id === id);
    if (!rfi) return;
    const input = form.querySelector("input[name=value]");
    const nextValue = input.value.trim();
    const currentValue = rfi[field] || "";
    editing = null;
    if (nextValue === currentValue) {
      updateResults(container);
      return;
    }
    const key = `${id}:${field}`;
    saving.add(key);
    rowError = null;
    updateResults(container);
    announce?.("Saving…");
    try {
      const { data } = await api.updateRfi(projectId, id, {
        [field]: nextValue || null,
        lockVersion: rfi.lockVersion,
      });
      saving.delete(key);
      Object.assign(rfi, {
        [field]: data?.[field] ?? (nextValue || null),
        lockVersion: data?.lockVersion ?? rfi.lockVersion,
        updatedAt: data?.updatedAt ?? rfi.updatedAt,
      });
      announce?.(`${EDITABLE_FIELDS[field].label} saved.`);
      updateResults(container);
    } catch (error) {
      saving.delete(key);
      if (error.status === 409) {
        announce?.("This RFI changed elsewhere. Reloading the latest.");
        await reload();
        return;
      }
      rowError = {
        id,
        field,
        message: error.message || "Could not save. Try again.",
      };
      announce?.("The change could not be saved.");
      updateResults(container);
    }
  }

  function bindResults(container) {
    container.querySelectorAll("[data-results] a[data-app-link]").forEach((link) =>
      link.addEventListener("click", (event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.target.closest("[data-edit], [data-inline-form]")
        )
          return;
        event.preventDefault();
        navigate(link.getAttribute("href"));
      }),
    );
    container.querySelectorAll("[data-results] [data-app-row]").forEach((row) =>
      row.addEventListener("click", (event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.target.closest(
            "a, button, input, select, textarea, label, [data-inline-form]",
          )
        )
          return;
        const selection = row.ownerDocument.defaultView?.getSelection?.();
        if (selection && !selection.isCollapsed && selection.toString()) return;
        navigate(row.getAttribute("data-href"));
      }),
    );
    container.querySelectorAll("[data-edit]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startEdit(
          container,
          button.getAttribute("data-edit"),
          button.getAttribute("data-field"),
        );
      }),
    );
    container.querySelectorAll("[data-inline-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        commitEdit(container, form);
      });
      form
        .querySelector("[data-inline-cancel]")
        ?.addEventListener("click", () => cancelEdit(container));
      form.querySelector("input")?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEdit(container);
        }
      });
    });
    container
      .querySelectorAll("[data-results] [data-clear-filters]")
      .forEach((button) =>
        button.addEventListener("click", () => clearFilters(container)),
      );
    container
      .querySelector("[data-results] [data-create-rfi]")
      ?.addEventListener("click", () => openCreate(container));
  }

  // ---- URL sync ---------------------------------------------------------

  function readFiltersFromUrl() {
    const params = new URLSearchParams(appWindow?.location.search || "");
    const next = defaultFilters();
    next.q = params.get("q") ?? "";
    next.status = params.get("status") ?? "all";
    next.responsible = params.get("responsible") ?? "all";
    const due = params.get("due");
    next.due = due === "overdue" || due === "due_soon" ? due : "all";
    const sort = params.get("sort");
    next.sort = SORT_KEYS[sort] ? sort : "number";
    const direction = params.get("direction");
    next.direction =
      direction === "asc" || direction === "desc"
        ? direction
        : SORT_KEYS[next.sort].defaultDir;
    filters = next;
  }

  function syncUrl(push) {
    if (!appWindow) return;
    const params = new URLSearchParams();
    const trimmed = filters.q.trim();
    if (trimmed) params.set("q", trimmed);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.responsible !== "all")
      params.set("responsible", filters.responsible);
    if (filters.due !== "all") params.set("due", filters.due);
    if (filters.sort !== "number") params.set("sort", filters.sort);
    if (filters.direction !== SORT_KEYS[filters.sort].defaultDir)
      params.set("direction", filters.direction);
    const query = params.toString();
    const url = `${appWindow.location.pathname}${query ? `?${query}` : ""}${appWindow.location.hash}`;
    appWindow.history[push ? "pushState" : "replaceState"]({}, "", url);
  }

  function clearFilters(container) {
    const { sort, direction } = filters;
    filters = { ...defaultFilters(), sort, direction };
    syncUrl(true);
    updateResults(container);
    announce?.("Filters cleared.");
  }

  function openCreate(container) {
    if (!canCreate() || openForm) return;
    openForm = createRfiCreateForm({
      api,
      projectId,
      document: container.ownerDocument,
      announce,
      onSuccess: (rfi) => {
        openForm = null;
        if (rfi?.id) navigate(rfiWorkspaceHref(projectId, rfi.id));
      },
      onClose: () => {
        openForm = null;
      },
    });
  }

  function bindToolbar(container) {
    container.querySelector("#rfi-search")?.addEventListener("input", (event) => {
      filters.q = event.target.value;
      syncUrl(false);
      updateResults(container);
    });
    const bindSelect = (id, apply) =>
      container.querySelector(id)?.addEventListener("change", (event) => {
        apply(event.target.value);
        syncUrl(true);
        updateResults(container);
      });
    bindSelect("#rfi-status", (value) => (filters.status = value));
    bindSelect("#rfi-responsible", (value) => (filters.responsible = value));
    bindSelect("#rfi-due", (value) => (filters.due = value));
    bindSelect("#rfi-sort", (value) => {
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
    container.innerHTML = `<section class="workspace-page rfis-view app-register-page">${heading()}${body()}</section>`;
    container
      .querySelector("[data-rfis-retry]")
      ?.addEventListener("click", () => reload());
    container
      .querySelector(".rfi-heading [data-create-rfi]")
      ?.addEventListener("click", () => openCreate(container));
    if (state.status === "loaded") {
      bindToolbar(container);
      updateResults(container);
    }
  }

  function destroy() {
    destroyed = true;
    if (controller) controller.abort();
    if (openForm) openForm.close({ restoreFocus: false });
  }

  return { mount, reload, destroy };
}
