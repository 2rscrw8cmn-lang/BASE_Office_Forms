// Projects directory feature module. Renders the authenticated project list as a
// professional table on desktop and cards on mobile, with client-side text
// search, status filtering, a visible result count, and an authorization-aware
// Create Project action. Client filtering only narrows an already
// server-authorized list; it is never an authorization mechanism.
import { escapeHtml, formatDate } from "./app-format.js";
import { createProjectForm } from "./project-form.js";

const STATUS_LABELS = {
  planning: "Planning",
  active: "Active",
  closeout: "Closeout",
  suspended: "Suspended",
  archived: "Archived",
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function canCreateProjects(session) {
  const role =
    session?.status === "ready" ? session.data?.membership?.role : "";
  return role === "org_admin" || role === "document_control_admin";
}

function overviewHref(project) {
  return `/projects/${encodeURIComponent(project.id)}/overview`;
}

function locationText(project) {
  const parts = [project.address?.city, project.address?.region].filter(
    Boolean,
  );
  return parts.join(", ");
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const activeA = a.status === "active" ? 0 : 1;
    const activeB = b.status === "active" ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    const number = (a.projectNumber || "").localeCompare(
      b.projectNumber || "",
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );
    if (number !== 0) return number;
    const name = (a.name || "").localeCompare(b.name || "", undefined, {
      sensitivity: "base",
    });
    if (name !== 0) return name;
    return (a.id || "").localeCompare(b.id || "");
  });
}

export function createProjectsView({
  api,
  navigate,
  announce,
  requestRender,
  getSession,
}) {
  let state = { status: "loading", data: null, error: null };
  const filters = { search: "", status: "all" };
  let controller = null;
  let destroyed = false;
  let openForm = null;

  async function reload() {
    if (controller) controller.abort();
    controller = new AbortController();
    state = { status: "loading", data: null, error: null };
    requestRender();
    try {
      const { data } = await api.getProjects({ signal: controller.signal });
      if (destroyed) return;
      state = { status: "loaded", data: data || [], error: null };
      requestRender();
    } catch (error) {
      if (destroyed || error.aborted) return;
      state = { status: "error", data: null, error };
      announce?.("Projects could not be loaded.");
      requestRender();
    }
  }

  function applyFilters(projects) {
    const query = filters.search.trim().toLowerCase();
    return sortProjects(
      projects.filter((project) => {
        if (filters.status !== "all" && project.status !== filters.status)
          return false;
        if (!query) return true;
        return (
          (project.projectNumber || "").toLowerCase().includes(query) ||
          (project.name || "").toLowerCase().includes(query)
        );
      }),
    );
  }

  function hasActiveFilters() {
    return Boolean(filters.search.trim()) || filters.status !== "all";
  }

  function heading(session) {
    const showCreate = canCreateProjects(session);
    const total = state.status === "loaded" ? state.data.length : null;
    return `<header class="app-register-header app-container-register">
        <div class="app-register-title">
          <h1 id="page-title" tabindex="-1">Projects</h1>
          ${total === null ? "" : `<span class="app-register-count">${total} project${total === 1 ? "" : "s"}</span>`}
        </div>${
          showCreate
            ? `<button class="primary-button" type="button" data-create-project>Create project</button>`
            : ""
        }
      </header>`;
  }

  function toolbar(projects) {
    const statuses = [
      ...new Set(projects.map((project) => project.status)),
    ].sort();
    return `<div class="app-register-toolbar projects-toolbar">
      <div class="app-register-controls">
        <div class="app-field app-search-field app-register-search app-register-control">
          <label class="sr-only" for="projects-search">Search projects</label>
          <input id="projects-search" type="search" placeholder="Search projects..."
            autocomplete="off" value="${escapeHtml(filters.search)}" />
        </div>
        <div class="app-field app-filter-field app-register-control">
          <label class="sr-only" for="projects-status">Filter projects by status</label>
          <select id="projects-status">
            <option value="all">All statuses</option>
            ${statuses
              .map(
                (status) =>
                  `<option value="${escapeHtml(status)}"${status === filters.status ? " selected" : ""}>${escapeHtml(statusLabel(status))}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="app-register-filter-state">
        <button class="text-link" type="button" data-clear-filters hidden>Clear all</button>
        <p class="app-register-result-count" aria-live="polite" data-result-count></p>
      </div>
    </div>`;
  }

  function tableRows(projects) {
    return projects
      .map(
        (
          project,
        ) => `<tr class="app-data-row" data-app-row data-href="${overviewHref(project)}">
          <th scope="row"><a href="${overviewHref(project)}" data-app-link
              aria-label="Open ${escapeHtml(project.name)} (${escapeHtml(project.projectNumber || "no number")})">${escapeHtml(project.name)}</a><span class="project-number">${escapeHtml(project.projectNumber || "No project number")}</span></th>
          <td><span class="status-badge status-${project.status === "active" ? "success" : "neutral"}">${escapeHtml(statusLabel(project.status))}</span></td>
          <td>${escapeHtml(locationText(project) || "—")}</td>
          <td class="cell-date">${escapeHtml(formatDate(project.updatedAt) || "—")}</td>
        </tr>`,
      )
      .join("");
  }

  function cards(projects) {
    return projects
      .map(
        (
          project,
        ) => `<li><a class="project-card" href="${overviewHref(project)}" data-app-link
          aria-label="Open ${escapeHtml(project.name)} (${escapeHtml(project.projectNumber || "no number")})">
          <span class="project-card-top">
            <span class="project-card-number">${escapeHtml(project.projectNumber || "—")}</span>
            <span class="status-badge status-${project.status === "active" ? "success" : "neutral"}">${escapeHtml(statusLabel(project.status))}</span>
          </span>
          <span class="project-card-name">${escapeHtml(project.name)}</span>
          <span class="project-card-meta"><span>${escapeHtml(locationText(project) || "No location")}</span><span>Updated ${escapeHtml(formatDate(project.updatedAt) || "—")}</span></span>
        </a></li>`,
      )
      .join("");
  }

  function resultsMarkup(projects) {
    const filtered = applyFilters(projects);
    if (!projects.length) {
      return `<div class="projects-empty"><p class="section-empty">No projects are available to you yet.</p></div>`;
    }
    if (!filtered.length) {
      return `<div class="projects-empty" role="status"><p class="section-empty">No projects match your search or filters.</p>
        <button class="secondary-button" type="button" data-clear-filters>Clear all</button></div>`;
    }
    return `<div class="projects-table-wrap" role="region" aria-label="Projects" tabindex="0">
        <table class="projects-table app-data-table">
          <caption class="sr-only">Projects you can access</caption>
          <thead><tr>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Location</th>
            <th scope="col">Updated</th>
          </tr></thead>
          <tbody>${tableRows(filtered)}</tbody>
        </table>
      </div>
      <ul class="project-cards" aria-label="Projects">${cards(filtered)}</ul>`;
  }

  function body() {
    if (state.status === "loading") {
      return `<div class="projects-body app-container-register"><section class="route-state route-loading" aria-busy="true" aria-label="Loading projects">
          <span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span>
        </section></div>`;
    }
    if (state.status === "error") {
      const requestId = state.error?.requestId;
      return `<div class="projects-body app-container-register"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unable to load</p>
          <p>Projects could not be loaded. No changes were made.</p>
          ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
          <div class="state-actions"><button class="secondary-button" type="button" data-projects-retry>Try again</button></div>
        </section></div>`;
    }
    return `<div class="projects-body app-container-register">${toolbar(state.data)}<div class="projects-results" data-results></div></div>`;
  }

  function updateResults(container) {
    if (state.status !== "loaded") return;
    const region = container.querySelector("[data-results]");
    if (region) region.innerHTML = resultsMarkup(state.data);
    const filtered = applyFilters(state.data);
    const countEl = container.querySelector("[data-result-count]");
    if (countEl) {
      countEl.textContent = hasActiveFilters()
        ? `${filtered.length} of ${state.data.length} project${state.data.length === 1 ? "" : "s"}`
        : "";
    }
    const clear = container.querySelector(
      ".projects-toolbar [data-clear-filters]",
    );
    if (clear) clear.hidden = !hasActiveFilters();
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
  }

  function clearFilters(container) {
    filters.search = "";
    filters.status = "all";
    const search = container.querySelector("#projects-search");
    const status = container.querySelector("#projects-status");
    if (search) search.value = "";
    if (status) status.value = "all";
    updateResults(container);
    announce?.("Filters cleared.");
  }

  function openCreate(container) {
    const session = getSession?.();
    if (!canCreateProjects(session)) return;
    openForm = createProjectForm({
      api,
      document: container.ownerDocument,
      announce,
      onSuccess: (project) => {
        openForm = null;
        if (project?.id) navigate(overviewHref(project));
      },
      onClose: () => {
        openForm = null;
      },
    });
  }

  function mount(container) {
    const session = getSession?.();
    container.innerHTML = `<section class="workspace-page projects-view app-register-page">${heading(session)}${body()}</section>`;

    container
      .querySelector("[data-projects-retry]")
      ?.addEventListener("click", () => reload());
    container
      .querySelector("[data-create-project]")
      ?.addEventListener("click", () => openCreate(container));

    if (state.status === "loaded") {
      const search = container.querySelector("#projects-search");
      const status = container.querySelector("#projects-status");
      search?.addEventListener("input", (event) => {
        filters.search = event.target.value;
        updateResults(container);
      });
      status?.addEventListener("change", (event) => {
        filters.status = event.target.value;
        updateResults(container);
      });
      container
        .querySelector(".projects-toolbar [data-clear-filters]")
        ?.addEventListener("click", () => clearFilters(container));
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
