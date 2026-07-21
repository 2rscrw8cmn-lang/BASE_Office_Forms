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
  currentRevisionText,
} from "./app-format.js";
import { createRecordForm } from "./record-form.js";

const SORT_KEYS = {
  created: { label: "Created (newest)", defaultDir: "desc" },
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
    if (present.has("none")) options.push(["none", "No published revision"]);
    return options;
  }

  function selectMarkup(id, label, options, selected) {
    const values = new Set(options.map(([value]) => value));
    const extra =
      selected !== "all" && !values.has(selected)
        ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`
        : "";
    return `<div class="app-field app-filter-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <select id="${id}">
          <option value="all"${selected === "all" ? " selected" : ""}>All</option>
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
    return `<div class="app-field app-filter-field">
        <label for="records-sort">Sort</label>
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
    return `<div class="records-toolbar">
        <div class="app-field app-search-field">
          <label for="records-search">Search records</label>
          <input id="records-search" type="search" placeholder="Search by title, number, type, or discipline"
            autocomplete="off" value="${escapeHtml(filters.q)}" />
        </div>
        ${selectMarkup("records-type", "Type", typeOptions(records), filters.type)}
        ${selectMarkup("records-discipline", "Discipline", disciplineOptions(records), filters.discipline)}
        ${selectMarkup("records-revision", "Revision status", revisionStatusOptions(records), filters.revisionStatus)}
        <div class="app-field app-filter-field">
          <label for="records-archived">Archived</label>
          <select id="records-archived">
            ${ARCHIVED_OPTIONS.map(
              ([value, text]) =>
                `<option value="${value}"${value === filters.archived ? " selected" : ""}>${escapeHtml(text)}</option>`,
            ).join("")}
          </select>
        </div>
        ${sortSelect()}
        <button class="text-link" type="button" data-clear-filters>Clear filters</button>
        <p class="result-count" aria-live="polite" data-result-count></p>
      </div>`;
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

  function currentRevisionCell(record) {
    const text = currentRevisionText(record.currentRevision);
    if (!text)
      return `<span class="record-norevision">No published revision</span>`;
    return `<span class="record-revision">${escapeHtml(text)}</span>`;
  }

  function revisionStatusCell(record) {
    if (!record.currentRevision) return "—";
    return `<span class="status-badge status-neutral">${escapeHtml(revisionStatusLabel(record.currentRevision.status))}</span>`;
  }

  function tableRows(records) {
    return records
      .map(
        (record) => `<tr>
          <th scope="row">
            <a href="${recordDetailHref(projectId, record)}" data-app-link
              aria-label="Open record ${escapeHtml(record.title)}${record.recordNumber ? ` (${escapeHtml(record.recordNumber)})` : ""}">${escapeHtml(record.title)}</a>
            ${recordMeta(record)}
          </th>
          <td>${escapeHtml(recordTypeLabel(record.recordType))}</td>
          <td>${escapeHtml(record.discipline || "—")}</td>
          <td>${currentRevisionCell(record)}</td>
          <td>${revisionStatusCell(record)}</td>
          <td class="cell-files">${escapeHtml(String(record.fileCount ?? 0))}</td>
          <td class="cell-date">${escapeHtml(formatDate(record.createdAt) || "—")}</td>
          <td class="cell-open"><a class="open-link" href="${recordDetailHref(projectId, record)}" data-app-link
            aria-label="Open record ${escapeHtml(record.title)}">Open record<span class="open-arrow" aria-hidden="true">→</span></a></td>
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
          <span class="record-card-meta">${escapeHtml(recordTypeLabel(record.recordType))}${record.discipline ? ` · ${escapeHtml(record.discipline)}` : ""}</span>
          <span class="record-card-revision">${
            currentRevisionText(record.currentRevision)
              ? `${escapeHtml(currentRevisionText(record.currentRevision))} · ${escapeHtml(revisionStatusLabel(record.currentRevision.status))}`
              : "No published revision"
          }${record.hasDraftRevision ? ` <span class="record-draft-badge">Draft in progress</span>` : ""}</span>
          <span class="record-card-foot">${escapeHtml(String(record.fileCount ?? 0))} file${record.fileCount === 1 ? "" : "s"} · Created ${escapeHtml(formatDate(record.createdAt) || "—")}</span>
        </a></li>`,
      )
      .join("");
  }

  function resultsMarkup(records) {
    const filtered = applyFilters(records);
    if (!records.length) {
      return `<div class="records-empty"><p class="section-empty">No records have been created for this project.</p>${
        canCreate()
          ? `<button class="secondary-button" type="button" data-create-record>Create record</button>`
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
      <button class="secondary-button" type="button" data-clear-filters>Clear filters</button></div>`;
    }
    return `<div class="records-table-wrap" role="region" aria-label="Project records" tabindex="0">
        <table class="records-table">
          <caption class="sr-only">Records you can access in this project</caption>
          <thead><tr>
            <th scope="col">Record</th>
            <th scope="col">Type</th>
            <th scope="col">Discipline</th>
            <th scope="col">Current revision</th>
            <th scope="col">Revision status</th>
            <th scope="col">Files</th>
            <th scope="col">Created</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>${tableRows(filtered)}</tbody>
        </table>
      </div>
      <ul class="record-cards" aria-label="Project records">${cards(filtered)}</ul>`;
  }

  function heading() {
    return `<div class="page-heading page-heading-actions records-heading"><div class="app-container-register">
        <div class="page-heading-text">
          <p class="app-eyebrow">Project documents</p>
          <h2 id="records-title" tabindex="-1">Records</h2>
          <p>Browse the document records for this project, or search, filter, and open one.</p>
        </div>${
          canCreate()
            ? `<button class="primary-button" type="button" data-create-record>Create record</button>`
            : ""
        }
      </div></div>`;
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
      countEl.textContent = `Showing ${filtered.length} of ${total} record${total === 1 ? "" : "s"}`;
    }
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
      .querySelectorAll("[data-results] [data-clear-filters]")
      .forEach((button) =>
        button.addEventListener("click", () => clearFilters(container)),
      );
    container
      .querySelector("[data-results] [data-include-archived]")
      ?.addEventListener("click", () => {
        filters.archived = "all";
        syncUrl(true);
        remountToolbar(container);
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
    filters = defaultFilters();
    syncUrl(true);
    remountToolbar(container);
    announce?.("Filters cleared.");
  }

  // Re-render the toolbar so its controls reflect a programmatic filter reset,
  // then refresh the results. Used for Clear filters, where the field values
  // themselves change (individual control edits update results in place and
  // keep focus).
  function remountToolbar(container) {
    const toolbarEl = container.querySelector(".records-toolbar");
    if (toolbarEl) {
      toolbarEl.outerHTML = toolbar(state.data.records);
      bindToolbar(container);
    }
    updateResults(container);
  }

  function openCreate(container) {
    if (!canCreate()) return;
    openForm = createRecordForm({
      api,
      projectId,
      document: container.ownerDocument,
      announce,
      onSuccess: (record) => {
        openForm = null;
        if (record?.id) navigate(recordDetailHref(projectId, record));
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
    container.innerHTML = `<section class="workspace-page records-view">${heading()}${body()}</section>`;

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
