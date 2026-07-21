// Project Records register feature module. Renders below the shell-owned project
// header and tabs: an authorized list of the project's records as a semantic
// table on desktop and a list of cards on mobile, with a cohesive toolbar for
// case-insensitive search, type / discipline / current-revision-status filters,
// archived visibility, sorting, a live result count, and a capability-gated
// Create Record action.
//
// The whole authorized list (including archived records) loads in a single
// request; search, filter, and sort are applied in the browser over that
// already-authorized data — never as an authorization boundary. List state is
// mirrored into the URL query string so refresh, copied links, and browser
// back/forward restore the same view. Record identity, revision identity, and
// files are kept distinct: the record title is the record, the current revision
// is shown as "Revision <label|number>", drafts are flagged without masquerading
// as the current revision, and the file count spans the record's revisions.
import {
  escapeHtml,
  formatDate,
  recordTypeLabel,
  recordStatusLabel,
  revisionStatusLabel,
} from "./app-format.js";
import { createAddDocumentForm } from "./add-document-form.js";

const SORT_KEYS = {
  created: { label: "Newest", defaultDir: "desc" },
  updated: { label: "Recently updated", defaultDir: "desc" },
  title: { label: "Title A–Z", defaultDir: "asc" },
  recordNumber: { label: "Record number", defaultDir: "asc" },
  type: { label: "Type", defaultDir: "asc" },
};

const ARCHIVED_OPTIONS = [
  ["active", "Active only"],
  ["all", "Include archived"],
  ["archived", "Archived only"],
];

function defaultFilters() {
  return {
    q: "",
    type: "all",
    discipline: "all",
    revisionStatus: "all",
    archived: "active",
    sort: "created",
    direction: "desc",
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
  const av = Date.parse(a || "") || 0;
  const bv = Date.parse(b || "") || 0;
  return av - bv;
}

function recordDetailHref(projectId, record) {
  return `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(record.id)}`;
}

function currentRevisionStatusValue(record) {
  return record.currentRevision ? record.currentRevision.status : "none";
}

export function createRecordsView({
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
  let openForm = null;
  let appWindow = null;

  async function reload() {
    if (controller) controller.abort();
    controller = new AbortController();
    state = { status: "loading", data: null, error: null };
    requestRender();
    try {
      // Always request the full authorized set (including archived) so archived
      // visibility can be toggled in the browser without another round trip.
      const { data } = await api.getProjectRecords(projectId, {
        includeArchived: true,
        signal: controller.signal,
      });
      if (destroyed) return;
      state = {
        status: "loaded",
        data: {
          records: Array.isArray(data?.records) ? data.records : [],
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
      announce?.("Records could not be loaded.");
      requestRender();
    }
  }

  function canCreate() {
    return (
      state.status === "loaded" && state.data.capabilities.createRecord === true
    );
  }

  // Records matching the current archived-visibility setting only — the universe
  // the result count is measured against, before search and field filters.
  function visibleUniverse(records) {
    return records.filter((record) => {
      if (filters.archived === "active") return record.status === "active";
      if (filters.archived === "archived") return record.status === "archived";
      return true;
    });
  }

  function applyFilters(records) {
    const query = filters.q.trim().toLowerCase();
    const filtered = visibleUniverse(records).filter((record) => {
      if (filters.type !== "all" && record.recordType !== filters.type)
        return false;
      if (
        filters.discipline !== "all" &&
        (record.discipline || "") !== filters.discipline
      )
        return false;
      if (
        filters.revisionStatus !== "all" &&
        currentRevisionStatusValue(record) !== filters.revisionStatus
      )
        return false;
      if (!query) return true;
      const haystack = [
        record.title,
        record.recordNumber || "",
        recordTypeLabel(record.recordType),
        record.discipline || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return sortRecords(filtered);
  }

  function sortRecords(records) {
    const dir = filters.direction === "asc" ? 1 : -1;
    const key = filters.sort;
    return [...records].sort((a, b) => {
      let cmp = 0;
      if (key === "title") cmp = collate(a.title, b.title);
      else if (key === "recordNumber")
        cmp = collateNumber(a.recordNumber, b.recordNumber);
      else if (key === "type")
        cmp = collate(
          recordTypeLabel(a.recordType),
          recordTypeLabel(b.recordType),
        );
      else if (key === "updated") cmp = compareDate(a.updatedAt, b.updatedAt);
      else cmp = compareDate(a.createdAt, b.createdAt);
      const primary = cmp * dir;
      if (primary !== 0) return primary;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  // Filter options are drawn only from values actually present in the authorized
  // response (plus a "No published revision" bucket) so no discipline or type is
  // ever invented.
  function typeOptions(records) {
    const present = [...new Set(records.map((record) => record.recordType))];
    return present
      .sort((a, b) => collate(recordTypeLabel(a), recordTypeLabel(b)))
      .map((value) => [value, recordTypeLabel(value)]);
  }

  function disciplineOptions(records) {
    const present = [
      ...new Set(
        records.map((record) => record.discipline).filter((value) => value),
      ),
    ];
    return present.sort((a, b) => collate(a, b)).map((value) => [value, value]);
  }

  function revisionStatusOptions(records) {
    const present = new Set(
      records.map((record) => currentRevisionStatusValue(record)),
    );
    const ordered = ["published", "superseded", "draft"].filter((value) =>
      present.has(value),
    );
    const options = ordered.map((value) => [value, revisionStatusLabel(value)]);
    if (present.has("none")) options.push(["none", "No revision"]);
    return options;
  }

  function hasActiveFilters() {
    return (
      Boolean(filters.q.trim()) ||
      filters.type !== "all" ||
      filters.discipline !== "all" ||
      filters.revisionStatus !== "all" ||
      filters.archived !== "active"
    );
  }

  function selectMarkup(id, label, defaultLabel, options, selected) {
    const values = new Set(options.map(([value]) => value));
    const extra =
      selected !== "all" && !values.has(selected)
        ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`
        : "";
    return `<div class="app-field app-filter-field app-register-control">
        <label class="sr-only" for="${id}">${escapeHtml(label)}</label>
        <select id="${id}">
          <option value="all"${selected === "all" ? " selected" : ""}>${escapeHtml(defaultLabel)}</option>
          ${extra}
          ${options
            .map(
              ([value, text]) =>
                `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(text)}</option>`,
            )
            .join("")}
        </select>
      </div>`;
  }

  function sortSelect() {
    return `<div class="app-field app-filter-field app-register-control app-register-sort">
        <label class="sr-only" for="records-sort">Sort records</label>
        <select id="records-sort">
          ${Object.entries(SORT_KEYS)
            .map(
              ([value, { label }]) =>
                `<option value="${value}"${value === filters.sort ? " selected" : ""}>${escapeHtml(label)}</option>`,
            )
            .join("")}
        </select>
      </div>`;
  }

  function toolbar(records) {
    return `<div class="app-register-toolbar records-toolbar">
      <div class="app-register-controls">
        <div class="app-field app-search-field app-register-search app-register-control">
          <label class="sr-only" for="records-search">Search records</label>
          <input id="records-search" type="search" placeholder="Search records..."
            autocomplete="off" value="${escapeHtml(filters.q)}" />
        </div>
        <div class="app-register-filters">
          ${selectMarkup("records-type", "Filter by record type", "All types", typeOptions(records), filters.type)}
          ${selectMarkup("records-discipline", "Filter by discipline", "All disciplines", disciplineOptions(records), filters.discipline)}
          ${selectMarkup("records-revision", "Filter by revision status", "All revisions", revisionStatusOptions(records), filters.revisionStatus)}
          <div class="app-field app-filter-field app-register-control">
            <label class="sr-only" for="records-archived">Archived visibility</label>
            <select id="records-archived">
              ${ARCHIVED_OPTIONS.map(
                ([value, text]) =>
                  `<option value="${value}"${value === filters.archived ? " selected" : ""}>${escapeHtml(text)}</option>`,
              ).join("")}
            </select>
          </div>
          ${sortSelect()}
        </div>
      </div>
      <div class="app-register-filter-state">
        <div class="app-filter-chip-list" data-filter-chips hidden></div>
        <button class="text-link" type="button" data-clear-filters hidden>Clear all</button>
        <p class="app-register-result-count" aria-live="polite" data-result-count></p>
      </div>
    </div>`;
  }

  function activeFilterChips() {
    const chips = [];
    if (filters.type !== "all")
      chips.push(["type", "Type", recordTypeLabel(filters.type)]);
    if (filters.discipline !== "all")
      chips.push(["discipline", "Discipline", filters.discipline]);
    if (filters.revisionStatus !== "all") {
      chips.push([
        "revisionStatus",
        "Revision",
        filters.revisionStatus === "none"
          ? "No revision"
          : revisionStatusLabel(filters.revisionStatus),
      ]);
    }
    if (filters.archived !== "active") {
      const archivedLabel =
        ARCHIVED_OPTIONS.find(([value]) => value === filters.archived)?.[1] ||
        filters.archived;
      chips.push(["archived", "Archived", archivedLabel]);
    }
    return chips
      .map(
        ([key, category, value]) =>
          `<button class="app-filter-chip" type="button" data-remove-filter="${key}" aria-label="Remove ${escapeHtml(category)} filter: ${escapeHtml(value)}"><span>${escapeHtml(category)}: <strong>${escapeHtml(value)}</strong></span><span aria-hidden="true">×</span></button>`,
      )
      .join("");
  }

  function updateToolbarState(container) {
    const values = {
      "#records-search": filters.q,
      "#records-type": filters.type,
      "#records-discipline": filters.discipline,
      "#records-revision": filters.revisionStatus,
      "#records-archived": filters.archived,
      "#records-sort": filters.sort,
    };
    Object.entries(values).forEach(([selector, value]) => {
      const control = container.querySelector(selector);
      if (control && control.value !== value) control.value = value;
    });
    const chipList = container.querySelector("[data-filter-chips]");
    if (chipList) {
      const markup = activeFilterChips();
      chipList.innerHTML = markup;
      chipList.hidden = !markup;
      chipList.querySelectorAll("[data-remove-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.getAttribute("data-remove-filter");
          if (!key || !(key in filters)) return;
          filters[key] = defaultFilters()[key];
          syncUrl(true);
          updateResults(container);
          announce?.(`${button.textContent.trim()} removed.`);
        });
      });
    }
    const clear = container.querySelector(
      ".records-toolbar [data-clear-filters]",
    );
    if (clear) clear.hidden = !hasActiveFilters();
  }

  function recordMeta(record) {
    const bits = [];
    if (record.recordNumber)
      bits.push(
        `<span class="record-number">${escapeHtml(record.recordNumber)}</span>`,
      );
    if (record.status === "archived")
      bits.push(`<span class="status-badge status-neutral">Archived</span>`);
    if (record.hasDraftRevision)
      bits.push(`<span class="record-draft-badge">Draft in progress</span>`);
    return bits.length
      ? `<span class="record-meta">${bits.join("")}</span>`
      : "";
  }

  function revisionCell(record) {
    if (!record.currentRevision)
      return `<span class="record-norevision">No revision</span>`;
    const value =
      record.currentRevision.revisionLabel ||
      String(record.currentRevision.revisionNumber);
    return `<span class="record-revision">Rev ${escapeHtml(value)}</span><span class="record-revision-status">${escapeHtml(revisionStatusLabel(record.currentRevision.status))}</span>`;
  }

  function tableRows(records) {
    return records
      .map(
        (
          record,
        ) => `<tr class="app-data-row" data-app-row data-href="${recordDetailHref(projectId, record)}">
          <th scope="row">
            <a href="${recordDetailHref(projectId, record)}" data-app-link
              aria-label="Open record ${escapeHtml(record.title)}${record.recordNumber ? ` (${escapeHtml(record.recordNumber)})` : ""}">${escapeHtml(record.title)}</a>
            ${recordMeta(record)}
          </th>
          <td>${escapeHtml(recordTypeLabel(record.recordType))}</td>
          <td>${escapeHtml(record.discipline || "—")}</td>
          <td class="cell-revision">${revisionCell(record)}</td>
          <td class="cell-files">${escapeHtml(String(record.fileCount ?? 0))}</td>
          <td class="cell-date">${escapeHtml(formatDate(record.updatedAt) || "—")}</td>
        </tr>`,
      )
      .join("");
  }

  function cards(records) {
    return records
      .map(
        (
          record,
        ) => `<li><a class="record-card" href="${recordDetailHref(projectId, record)}" data-app-link
          aria-label="Open record ${escapeHtml(record.title)}${record.recordNumber ? ` (${escapeHtml(record.recordNumber)})` : ""}">
          <span class="record-card-top">
            <span class="record-card-number">${escapeHtml(record.recordNumber || "No record number")}</span>
            <span class="status-badge status-${record.status === "active" ? "success" : "neutral"}">${escapeHtml(recordStatusLabel(record.status))}</span>
          </span>
          <span class="record-card-title">${escapeHtml(record.title)}</span>
          <span class="record-card-meta"><span>${escapeHtml(recordTypeLabel(record.recordType))}</span><span>${escapeHtml(record.discipline || "No discipline")}</span></span>
          <span class="record-card-revision">${revisionCell(record)}${record.hasDraftRevision ? ` <span class="record-draft-badge">Draft in progress</span>` : ""}</span>
          <span class="record-card-foot"><span>${escapeHtml(String(record.fileCount ?? 0))} file${record.fileCount === 1 ? "" : "s"}</span><span>Updated ${escapeHtml(formatDate(record.updatedAt) || "—")}</span></span>
        </a></li>`,
      )
      .join("");
  }

  function resultsMarkup(records) {
    const filtered = applyFilters(records);
    if (!records.length) {
      return `<div class="records-empty"><h3>No records yet</h3><p class="section-empty">Create the first record for this project to begin tracking revisions and files.</p>${
        canCreate()
          ? `<button class="secondary-button" type="button" data-create-record>Add document</button>`
          : ""
      }</div>`;
    }
    if (
      records.length > 0 &&
      visibleUniverse(records).length === 0 &&
      filters.archived === "active"
    ) {
      return `<div class="records-empty" role="status">
      <p class="section-empty">No active records. This project has archived records.</p>
      <button class="secondary-button" type="button" data-include-archived>
        Include archived records
      </button>
    </div>`;
    }
    if (!filtered.length) {
      return `<div class="records-empty" role="status"><p class="section-empty">No records match these filters.</p>
      <button class="secondary-button" type="button" data-clear-filters>Clear all</button></div>`;
    }
    return `<div class="records-table-wrap" role="region" aria-label="Project records" tabindex="0">
        <table class="records-table app-data-table">
          <caption class="sr-only">Documents you can access in this project</caption>
          <thead><tr>
            <th scope="col">Record</th>
            <th scope="col">Type</th>
            <th scope="col">Discipline</th>
            <th scope="col">Revision</th>
            <th scope="col">Files</th>
            <th scope="col">Updated</th>
          </tr></thead>
          <tbody>${tableRows(filtered)}</tbody>
        </table>
      </div>
      <ul class="record-cards" aria-label="Project records">${cards(filtered)}</ul>`;
  }

  function heading() {
    const total = state.status === "loaded" ? state.data.records.length : null;
    return `<header class="app-register-header records-heading app-container-register">
        <div class="app-register-title">
          <h2 id="records-title" tabindex="-1">Document Register</h2>
          ${total === null ? "" : `<span class="app-register-count">${total} record${total === 1 ? "" : "s"}</span>`}
        </div>${
          canCreate()
            ? `<button class="primary-button" type="button" data-create-record>Add document</button>`
            : ""
        }
      </header>`;
  }

  function loadingSkeleton() {
    const rows = Array.from({ length: 4 })
      .map(
        () =>
          `<div class="records-skeleton-row"><span class="skeleton-line skeleton-medium"></span><span class="skeleton-line skeleton-short"></span></div>`,
      )
      .join("");
    return `<section class="records-loading" aria-busy="true" aria-label="Loading records">${rows}</section>`;
  }

  function body() {
    if (state.status === "loading")
      return `<div class="records-body app-container-register">${loadingSkeleton()}</div>`;
    if (state.status === "missing") {
      return `<div class="records-body app-container-register"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unavailable</p>
          <p>These records are unavailable or you do not have access to this project.</p>
        </section></div>`;
    }
    if (state.status === "error") {
      const requestId = state.error?.requestId;
      return `<div class="records-body app-container-register"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unable to load</p>
          <p>The records could not be loaded. No changes were made.</p>
          ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
          <div class="state-actions"><button class="secondary-button" type="button" data-records-retry>Try again</button></div>
        </section></div>`;
    }
    return `<div class="records-body app-container-register">${toolbar(state.data.records)}<div class="records-results" data-results></div></div>`;
  }

  function updateResults(container) {
    if (state.status !== "loaded") return;
    const region = container.querySelector("[data-results]");
    if (region) region.innerHTML = resultsMarkup(state.data.records);
    const filtered = applyFilters(state.data.records);
    const total = visibleUniverse(state.data.records).length;
    const countEl = container.querySelector("[data-result-count]");
    if (countEl) {
      countEl.textContent = hasActiveFilters()
        ? `${filtered.length} of ${total} record${total === 1 ? "" : "s"}`
        : "";
    }
    updateToolbarState(container);
    bindResultLinks(container);
  }

  function bindResultLinks(container) {
    container
      .querySelectorAll("[data-results] a[data-app-link]")
      .forEach((link) => {
        link.addEventListener("click", (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          navigate(link.getAttribute("href"));
        });
      });
    container
      .querySelectorAll("[data-results] [data-app-row]")
      .forEach((row) => {
        row.addEventListener("click", (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.target.closest?.(
              "a, button, input, select, textarea, label, [contenteditable='true']",
            )
          )
            return;
          const selection = row.ownerDocument.defaultView?.getSelection?.();
          if (selection && !selection.isCollapsed && selection.toString())
            return;
          navigate(row.getAttribute("data-href"));
        });
      });
    container
      .querySelectorAll("[data-results] [data-clear-filters]")
      .forEach((button) =>
        button.addEventListener("click", () => clearFilters(container)),
      );
    container
      .querySelector("[data-results] [data-include-archived]")
      ?.addEventListener("click", () => {
        filters.archived = "all";
        syncUrl(true);
        updateResults(container);
        announce?.("Archived records included.");
      });
    container
      .querySelector("[data-results] [data-create-record]")
      ?.addEventListener("click", () => openCreate(container));
  }

  // ---- URL query-string synchronization ---------------------------------

  function readFiltersFromUrl() {
    const params = new URLSearchParams(appWindow?.location.search || "");
    const next = defaultFilters();
    next.q = params.get("q") ?? "";
    next.type = params.get("type") ?? "all";
    next.discipline = params.get("discipline") ?? "all";
    next.revisionStatus = params.get("revisionStatus") ?? "all";
    const archived = params.get("archived");
    next.archived =
      archived === "all" || archived === "archived" ? archived : "active";
    const sort = params.get("sort");
    next.sort = SORT_KEYS[sort] ? sort : "created";
    const direction = params.get("direction");
    next.direction =
      direction === "asc" || direction === "desc"
        ? direction
        : SORT_KEYS[next.sort].defaultDir;
    filters = next;
  }

  function normalizeFilters(records) {
    const typeValues = new Set(typeOptions(records).map(([value]) => value));
    const disciplineValues = new Set(
      disciplineOptions(records).map(([value]) => value),
    );
    const revisionValues = new Set(
      revisionStatusOptions(records).map(([value]) => value),
    );
    if (filters.type !== "all" && !typeValues.has(filters.type))
      filters.type = "all";
    if (
      filters.discipline !== "all" &&
      !disciplineValues.has(filters.discipline)
    )
      filters.discipline = "all";
    if (
      filters.revisionStatus !== "all" &&
      !revisionValues.has(filters.revisionStatus)
    )
      filters.revisionStatus = "all";
  }

  function syncUrl(push) {
    if (!appWindow) return;
    const params = new URLSearchParams();
    const trimmed = filters.q.trim();
    if (trimmed) params.set("q", trimmed);
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.discipline !== "all")
      params.set("discipline", filters.discipline);
    if (filters.revisionStatus !== "all")
      params.set("revisionStatus", filters.revisionStatus);
    if (filters.archived !== "active") params.set("archived", filters.archived);
    if (filters.sort !== "created") params.set("sort", filters.sort);
    if (filters.direction !== SORT_KEYS[filters.sort].defaultDir)
      params.set("direction", filters.direction);
    const query = params.toString();
    const url = `${appWindow.location.pathname}${query ? `?${query}` : ""}${appWindow.location.hash}`;
    appWindow.history[push ? "pushState" : "replaceState"]({}, "", url);
  }

  function clearFilters(container) {
    const sort = filters.sort;
    const direction = filters.direction;
    filters = { ...defaultFilters(), sort, direction };
    syncUrl(true);
    updateResults(container);
    announce?.("Filters cleared.");
  }

  function openCreate(container) {
    if (!canCreate()) return;
    openForm = createAddDocumentForm({
      api,
      projectId,
      document: container.ownerDocument,
      announce,
      onSuccess: (result) => {
        openForm = null;
        if (result?.href) navigate(result.href);
        else if (result?.record?.id && result?.revision?.id)
          navigate(
            `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(result.record.id)}/revisions/${encodeURIComponent(result.revision.id)}`,
          );
      },
      onClose: () => {
        openForm = null;
      },
    });
  }

  function bindToolbar(container) {
    const search = container.querySelector("#records-search");
    search?.addEventListener("input", (event) => {
      filters.q = event.target.value;
      syncUrl(false);
      updateResults(container);
    });
    const bindSelect = (id, apply) => {
      container.querySelector(id)?.addEventListener("change", (event) => {
        apply(event.target.value);
        syncUrl(true);
        updateResults(container);
      });
    };
    bindSelect("#records-type", (value) => (filters.type = value));
    bindSelect("#records-discipline", (value) => (filters.discipline = value));
    bindSelect(
      "#records-revision",
      (value) => (filters.revisionStatus = value),
    );
    bindSelect("#records-archived", (value) => (filters.archived = value));
    bindSelect("#records-sort", (value) => {
      filters.sort = SORT_KEYS[value] ? value : "created";
      filters.direction = SORT_KEYS[filters.sort].defaultDir;
    });
    container
      .querySelector(".records-toolbar [data-clear-filters]")
      ?.addEventListener("click", () => clearFilters(container));
  }

  function mount(container) {
    appWindow = container.ownerDocument.defaultView;
    // Restore list state from the URL on every (re)mount so refresh, copied
    // links, and browser back/forward all reproduce the same view.
    readFiltersFromUrl();
    if (state.status === "loaded") {
      normalizeFilters(state.data.records);
      syncUrl(false);
    }
    container.innerHTML = `<section class="workspace-page records-view app-register-page">${heading()}${body()}</section>`;

    container
      .querySelector("[data-records-retry]")
      ?.addEventListener("click", () => reload());
    container
      .querySelector(".records-heading [data-create-record]")
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
