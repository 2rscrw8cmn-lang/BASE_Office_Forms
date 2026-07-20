import {
  PROJECT_TABS,
  canViewAdministration,
  projectTabHref,
  resolveRoute,
} from "./app-routing.js";

const iconPaths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
  projects:
    '<path d="M3 7h7l2 2h9v11H3z"></path><path d="M3 7V5h7l2 2"></path>',
  tools:
    '<path d="m14.7 6.3 3-3a4.2 4.2 0 0 1-5.4 5.4l-7.8 7.8a2.1 2.1 0 0 0 3 3l7.8-7.8a4.2 4.2 0 0 0 5.4-5.4l-3 3z"></path>',
  form: '<path d="M6 3.5h8l4 4V21H6z"></path><path d="M14 3.5V8h4M9 12h6M9 16h4"></path>',
  library: '<path d="M4 5.5h5v14H4zM10 5.5h5v14h-5zM16 7h4v12.5h-4z"></path>',
  admin:
    '<circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20a6.5 6.5 0 0 1 13 0"></path>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
  close: '<path d="m6 6 12 12M18 6 6 18"></path>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"></path>',
};

function icon(name) {
  return `<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readableRole(role) {
  const labels = {
    org_admin: "Organization administrator",
    document_control_admin: "Document control administrator",
    project_manager: "Project manager",
    contributor: "Contributor",
    viewer: "Viewer",
  };
  return labels[role] || "Authenticated member";
}

function apiRequestId(payload, response) {
  return (
    payload?.meta?.requestId || response.headers?.get?.("x-request-id") || ""
  );
}

export function createAppShell(options = {}) {
  const appWindow = options.window || window;
  const appDocument = options.document || document;
  const fetchImpl = options.fetch || appWindow.fetch.bind(appWindow);
  const matchMediaImpl =
    options.matchMedia ||
    (typeof appWindow.matchMedia === "function"
      ? appWindow.matchMedia.bind(appWindow)
      : null);
  const root = appDocument.getElementById("app");
  if (!root) throw new Error("The application root was not found.");

  const state = {
    route: null,
    session: { status: "loading", data: null },
    project: { status: "idle", id: null, data: null, requestId: "" },
    drawerOpen: false,
    drawerTrigger: null,
  };

  function currentUrl() {
    return new URL(appWindow.location.href);
  }

  function activeAttribute(section) {
    const active = state.route?.globalSection === section;
    const toolsChild = section === "tools" && state.route?.id !== "tools";
    return active && !toolsChild ? ' aria-current="page"' : "";
  }

  function navLink(href, label, iconName, section, extraClass = "") {
    const active = state.route?.globalSection === section;
    return `<a class="app-nav-link ${extraClass}${active ? " is-active" : ""}" href="${href}" data-app-link${activeAttribute(section)}>${icon(iconName)}<span>${label}</span></a>`;
  }

  function renderNavigation(variant) {
    const showAdministration = canViewAdministration(
      state.session.data?.membership?.role,
    );
    return `<nav class="app-navigation app-navigation-${variant}" aria-label="Application navigation">
      <div class="app-nav-primary">
        ${navLink("/dashboard", "Dashboard", "dashboard", "dashboard")}
        ${navLink("/projects", "Projects", "projects", "projects")}
      </div>
      <div class="app-nav-group">
        <p class="app-nav-label">Tools</p>
        ${navLink("/tools", "Tools overview", "tools", "tools")}
        <div class="app-nav-children">
          <a class="app-nav-child${state.route?.id === "tools-forms" ? " is-active" : ""}" href="/tools/forms" data-app-link${state.route?.id === "tools-forms" ? ' aria-current="page"' : ""}>Forms</a>
          <a class="app-nav-child${state.route?.id === "tools-library" ? " is-active" : ""}" href="/tools/library" data-app-link${state.route?.id === "tools-library" ? ' aria-current="page"' : ""}>Document Library</a>
        </div>
      </div>
      ${showAdministration ? `<div class="app-nav-group app-nav-admin"><p class="app-nav-label">Administrative</p>${navLink("/admin", "Administration", "admin", "admin")}</div>` : ""}
    </nav>`;
  }

  function renderAccountSummary() {
    if (state.session.status === "loading") {
      return '<div class="account-summary" aria-busy="true"><span class="account-mark" aria-hidden="true"></span><div><strong>Loading account</strong><small>Please wait</small></div></div>';
    }
    if (state.session.status !== "ready") {
      return '<div class="account-summary"><span class="account-mark" aria-hidden="true">B</span><div><strong>BASE workspace</strong><small>Session unavailable</small></div></div>';
    }
    const organization =
      state.session.data.organization?.name || "BASE workspace";
    const role = readableRole(state.session.data.membership?.role);
    return `<div class="account-summary"><span class="account-mark" aria-hidden="true">B</span><div><strong>${escapeHtml(organization)}</strong><small>${escapeHtml(role)}</small></div></div>`;
  }

  function renderSidebar() {
    return `<aside class="app-sidebar">
      <a class="sidebar-brand" href="/dashboard" data-app-link aria-label="BASE Office Forms dashboard">
        <img src="/assets/base-logo.svg?v=20260718" alt="BASE" />
        <span>Office Forms</span>
      </a>
      ${renderNavigation("desktop")}
      ${renderAccountSummary()}
    </aside>`;
  }

  function renderMobileChrome() {
    const title = state.route?.title || "Workspace";
    return `<header class="mobile-app-header">
      <button class="mobile-menu-button" type="button" aria-label="Open navigation" aria-controls="mobile-navigation" aria-expanded="false">${icon("menu")}</button>
      <a class="mobile-brand" href="/dashboard" data-app-link aria-label="BASE Office Forms dashboard"><img src="/assets/base-logo.svg?v=20260718" alt="BASE" /></a>
      <span class="mobile-context">${escapeHtml(title)}</span>
    </header>
    <div class="mobile-nav-layer" hidden>
      <button class="mobile-nav-backdrop" type="button" aria-label="Close navigation"></button>
      <aside id="mobile-navigation" class="mobile-nav-drawer" aria-label="Mobile navigation" aria-hidden="true">
        <div class="mobile-nav-head"><div><p class="eyebrow">BASE Office Forms</p><strong>Workspace navigation</strong></div><button class="mobile-nav-close" type="button" aria-label="Close navigation">${icon("close")}</button></div>
        ${renderNavigation("mobile")}
        ${renderAccountSummary()}
      </aside>
    </div>`;
  }

  function renderLoadingState(label = "Loading page") {
    return `<section class="route-state route-loading" aria-busy="true" aria-label="${escapeHtml(label)}">
      <span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span>
    </section>`;
  }

  function renderErrorState(title, description, requestId = "", retry = "") {
    return `<section class="route-state route-error" aria-labelledby="route-error-title">
      <p class="eyebrow">Unable to continue</p>
      <h1 id="route-error-title" tabindex="-1">${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
      <div class="state-actions">${retry ? `<button class="secondary-button" type="button" data-retry="${retry}">Try again</button>` : ""}<a href="/dashboard" data-app-link>Return to Dashboard</a></div>
    </section>`;
  }

  function renderNotFound(
    title = "Page not found",
    description = "The requested page is not available.",
  ) {
    return `<section class="route-state route-not-found" aria-labelledby="not-found-title">
      <p class="eyebrow">BASE Office Forms</p>
      <h1 id="not-found-title" tabindex="-1">${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="state-actions"><a class="primary-button" href="/dashboard" data-app-link>Go to Dashboard</a><a href="/projects" data-app-link>Browse Projects</a></div>
    </section>`;
  }

  function renderProjectHeader(route) {
    const projectId = route.params.projectId;
    if (state.project.status === "loading" || state.project.id !== projectId) {
      return `<header class="project-context-header" aria-busy="true"><div><p class="eyebrow">Project context</p><h1 tabindex="-1">Loading project&hellip;</h1><p class="project-context-id">Project ID <code>${escapeHtml(projectId)}</code></p></div><span class="status-badge status-neutral">Loading</span></header>`;
    }
    const project = state.project.data;
    return `<header class="project-context-header"><div><p class="eyebrow">${escapeHtml(project.projectNumber || "Project")}</p><h1 tabindex="-1">${escapeHtml(project.name)}</h1><p class="project-context-id">Project number <code>${escapeHtml(project.projectNumber)}</code></p></div><span class="status-badge status-${project.status === "active" ? "success" : "neutral"}">${escapeHtml(project.status)}</span></header>`;
  }

  function renderProjectTabs(route) {
    const projectId = route.params.projectId;
    return `<nav class="project-tabs" aria-label="Project navigation"><div class="project-tabs-scroll">${PROJECT_TABS.map(
      (tab) => {
        const selected = tab.id === route.projectTab;
        return `<a href="${projectTabHref(projectId, tab.id)}" data-app-link${selected ? ' class="is-active" aria-current="page"' : ""}>${tab.label}</a>`;
      },
    ).join("")}</div></nav>`;
  }

  function renderPlaceholder(route) {
    return `<section class="route-placeholder" aria-labelledby="page-title">
      <div class="page-heading"><div><p class="eyebrow">${escapeHtml(route.eyebrow)}</p><h${route.params.projectId ? "2" : "1"} id="page-title" tabindex="-1">${escapeHtml(route.title)}</h${route.params.projectId ? "2" : "1"}><p>${escapeHtml(route.description)}</p></div></div>
      <div class="placeholder-panel"><div class="placeholder-rule" aria-hidden="true"></div><p class="placeholder-label">Planned route</p><code>${escapeHtml(route.pathname)}</code><p>${escapeHtml(route.placeholderNote)}</p></div>
    </section>`;
  }

  function renderToolCard(title, description, href, iconName) {
    return `<article class="tool-card">${icon(iconName)}<div><h2>${title}</h2><p>${description}</p></div><a href="${href}" data-app-link>Open ${title} ${icon("arrow")}</a></article>`;
  }

  function renderTools(route) {
    return `<section class="route-placeholder tools-route" aria-labelledby="page-title">
      <div class="page-heading"><div><p class="eyebrow">${escapeHtml(route.eyebrow)}</p><h1 id="page-title" tabindex="-1">${escapeHtml(route.title)}</h1><p>${escapeHtml(route.description)}</p></div></div>
      <div class="tool-grid">
        ${renderToolCard("Forms", "Create forms, documents, and packages in the existing Document Studio.", "/tools/forms", "form")}
        ${renderToolCard("Document Library", "Browse the preserved shared library and its controlled documents.", "/tools/library", "library")}
      </div>
    </section>`;
  }

  function renderToolAdapter(route, kind) {
    const forms = kind === "forms-tool";
    const href = forms ? "/builder.html?new=form" : "/library";
    const label = forms ? "Open Document Studio" : "Open Document Library";
    return `<section class="route-placeholder tool-adapter" aria-labelledby="page-title">
      <div class="page-heading"><div><p class="eyebrow">${escapeHtml(route.eyebrow)}</p><h1 id="page-title" tabindex="-1">${escapeHtml(route.title)}</h1><p>${escapeHtml(route.description)}</p></div></div>
      <div class="tool-adapter-panel">${icon(forms ? "form" : "library")}<div><p class="placeholder-label">Preserved experience</p><h2>${escapeHtml(route.title)}</h2><p>This tool remains separate from the new project workspace so its existing behavior and renderer stay unchanged.</p></div><a class="primary-button" href="${href}">${label} ${icon("arrow")}</a></div>
    </section>`;
  }

  function renderRouteContent() {
    const route = state.route;
    if (!route) return renderNotFound();
    if (route.requiresAdministration) {
      if (state.session.status === "loading")
        return renderLoadingState("Checking administration access");
      if (!canViewAdministration(state.session.data?.membership?.role))
        return renderNotFound();
    }
    if (route.surface === "not-found")
      return renderNotFound(route.title, route.description);
    if (route.surface === "tools") return renderTools(route);
    if (route.surface === "forms-tool" || route.surface === "library-tool")
      return renderToolAdapter(route, route.surface);
    if (route.params?.projectId) {
      if (
        state.project.id === route.params.projectId &&
        state.project.status === "missing"
      ) {
        return renderNotFound(
          "Project not found",
          "The project is unavailable or you do not have access to it.",
        );
      }
      if (
        state.project.id === route.params.projectId &&
        state.project.status === "error"
      ) {
        return renderErrorState(
          "Project context unavailable",
          "No changes were made. Check your connection and try again.",
          state.project.requestId,
          "project",
        );
      }
      return `${renderProjectHeader(route)}${renderProjectTabs(route)}<div class="project-route-content">${renderPlaceholder(route)}</div>`;
    }
    return renderPlaceholder(route);
  }

  function render() {
    root.innerHTML = `${renderSidebar()}${renderMobileChrome()}<main id="main-content" class="app-main" tabindex="-1">${renderRouteContent()}</main><p class="sr-only" id="route-announcer" aria-live="polite" aria-atomic="true"></p>`;
    root.setAttribute("aria-busy", "false");
    appDocument.title = `${state.route?.title || "Workspace"} | BASE Office Forms`;
    bindRenderedEvents();
    if (state.drawerOpen) {
      const layer = root.querySelector(".mobile-nav-layer");
      const drawer = root.querySelector(".mobile-nav-drawer");
      const menuButton = root.querySelector(".mobile-menu-button");
      if (layer) layer.hidden = false;
      drawer?.setAttribute("aria-hidden", "false");
      menuButton?.setAttribute("aria-expanded", "true");
      state.drawerTrigger = menuButton;
      appDocument.body.classList.add("mobile-nav-open");
      setBackgroundInert(true);
      if (drawer && !drawer.contains(appDocument.activeElement)) {
        drawer.querySelector(".mobile-nav-close")?.focus();
      }
    }
  }

  function focusPageHeading() {
    const heading = root.querySelector(
      "#page-title, .project-context-header h1, .route-state h1",
    );
    if (heading) heading.focus({ preventScroll: true });
    const announcer = root.querySelector("#route-announcer");
    if (announcer)
      announcer.textContent = `${state.route?.title || "Page"} loaded`;
    const selectedTab = root.querySelector(
      ".project-tabs [aria-current='page']",
    );
    selectedTab?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }

  function resolveCurrentRoute(replace = false) {
    let route = resolveRoute(currentUrl().pathname);
    if (route?.redirectTo) {
      const url = currentUrl();
      url.pathname = route.redirectTo;
      appWindow.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      route = resolveRoute(url.pathname);
    }
    state.route = route;
    if (replace) render();
    return route;
  }

  async function loadSession() {
    state.session = { status: "loading", data: null };
    try {
      const response = await fetchImpl("/api/v2/session", {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload?.error?.message || "Session unavailable");
      state.session = { status: "ready", data: payload.data };
    } catch (_error) {
      state.session = { status: "unavailable", data: null };
    }
    render();
  }

  async function loadProject(projectId) {
    if (!projectId) {
      state.project = { status: "idle", id: null, data: null, requestId: "" };
      return;
    }
    state.project = {
      status: "loading",
      id: projectId,
      data: null,
      requestId: "",
    };
    render();
    try {
      const response = await fetchImpl(
        `/api/v2/projects/${encodeURIComponent(projectId)}`,
        { headers: { Accept: "application/json" } },
      );
      const payload = await response.json().catch(() => ({}));
      if (state.route?.params?.projectId !== projectId) return;
      if (response.status === 403 || response.status === 404) {
        state.project = {
          status: "missing",
          id: projectId,
          data: null,
          requestId: apiRequestId(payload, response),
        };
      } else if (!response.ok) {
        state.project = {
          status: "error",
          id: projectId,
          data: null,
          requestId: apiRequestId(payload, response),
        };
      } else {
        state.project = {
          status: "ready",
          id: projectId,
          data: payload.data,
          requestId: apiRequestId(payload, response),
        };
      }
    } catch (_error) {
      if (state.route?.params?.projectId !== projectId) return;
      state.project = {
        status: "error",
        id: projectId,
        data: null,
        requestId: "",
      };
    }
    render();
  }

  function setBackgroundInert(value) {
    const main = root.querySelector(".app-main");
    const sidebar = root.querySelector(".app-sidebar");
    if (main) main.inert = value;
    if (sidebar) sidebar.inert = value;
  }

  function openMobileNav(trigger) {
    const layer = root.querySelector(".mobile-nav-layer");
    const drawer = root.querySelector(".mobile-nav-drawer");
    const menuButton = root.querySelector(".mobile-menu-button");
    if (!layer || !drawer || !menuButton) return;
    state.drawerOpen = true;
    state.drawerTrigger = trigger || menuButton;
    layer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    menuButton.setAttribute("aria-expanded", "true");
    appDocument.body.classList.add("mobile-nav-open");
    setBackgroundInert(true);
    drawer.querySelector(".mobile-nav-close")?.focus();
  }

  function closeMobileNav({ restoreFocus = true } = {}) {
    if (!state.drawerOpen) return;
    const layer = root.querySelector(".mobile-nav-layer");
    const drawer = root.querySelector(".mobile-nav-drawer");
    const menuButton = root.querySelector(".mobile-menu-button");
    state.drawerOpen = false;
    if (layer) layer.hidden = true;
    if (drawer) drawer.setAttribute("aria-hidden", "true");
    menuButton?.setAttribute("aria-expanded", "false");
    appDocument.body.classList.remove("mobile-nav-open");
    setBackgroundInert(false);
    if (restoreFocus) (state.drawerTrigger || menuButton)?.focus();
  }

  function focusableDrawerItems() {
    return [
      ...root.querySelectorAll(
        ".mobile-nav-drawer a[href], .mobile-nav-drawer button:not([disabled])",
      ),
    ].filter((item) => !item.hidden);
  }

  async function navigate(href, { replace = false, focus = true } = {}) {
    const target = new URL(href, appWindow.location.href);
    if (target.origin !== appWindow.location.origin) {
      appWindow.location.assign(target.href);
      return;
    }
    closeMobileNav({ restoreFocus: false });
    appWindow.history[replace ? "replaceState" : "pushState"](
      {},
      "",
      `${target.pathname}${target.search}${target.hash}`,
    );
    resolveCurrentRoute();
    const projectId = state.route?.params?.projectId;
    if (!projectId)
      state.project = { status: "idle", id: null, data: null, requestId: "" };
    render();
    if (focus) focusPageHeading();
    if (projectId) await loadProject(projectId);
    if (focus) focusPageHeading();
  }

  function onDocumentKeydown(event) {
    if (!state.drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileNav();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableDrawerItems();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && appDocument.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && appDocument.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindRenderedEvents() {
    root
      .querySelector(".mobile-menu-button")
      ?.addEventListener("click", (event) =>
        openMobileNav(event.currentTarget),
      );
    root
      .querySelector(".mobile-nav-close")
      ?.addEventListener("click", () => closeMobileNav());
    root
      .querySelector(".mobile-nav-backdrop")
      ?.addEventListener("click", () => closeMobileNav());
    root
      .querySelector("[data-retry='project']")
      ?.addEventListener("click", () =>
        loadProject(state.route?.params?.projectId),
      );
    root.querySelectorAll("a[data-app-link]").forEach((link) => {
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
        navigate(link.href);
      });
    });
  }

  async function onPopState() {
    closeMobileNav({ restoreFocus: false });
    resolveCurrentRoute();
    render();
    const projectId = state.route?.params?.projectId;
    if (projectId) await loadProject(projectId);
    focusPageHeading();
  }

  const mobileMediaQuery = matchMediaImpl
    ? matchMediaImpl("(max-width: 620px)")
    : null;

  function onViewportChange(event) {
    const isMobile =
      event && typeof event.matches === "boolean"
        ? event.matches
        : Boolean(mobileMediaQuery?.matches);
    if (isMobile) return;
    // The viewport left mobile mode: CSS now hides the drawer and its trigger,
    // so drop the inert desktop shell and reset drawer state. The mobile
    // trigger is hidden, so focus must not be restored to it.
    closeMobileNav({ restoreFocus: false });
  }

  function addMediaQueryListener() {
    if (!mobileMediaQuery) return;
    if (typeof mobileMediaQuery.addEventListener === "function")
      mobileMediaQuery.addEventListener("change", onViewportChange);
    else if (typeof mobileMediaQuery.addListener === "function")
      mobileMediaQuery.addListener(onViewportChange);
  }

  function removeMediaQueryListener() {
    if (!mobileMediaQuery) return;
    if (typeof mobileMediaQuery.removeEventListener === "function")
      mobileMediaQuery.removeEventListener("change", onViewportChange);
    else if (typeof mobileMediaQuery.removeListener === "function")
      mobileMediaQuery.removeListener(onViewportChange);
  }

  appDocument.addEventListener("keydown", onDocumentKeydown);
  appWindow.addEventListener("popstate", onPopState);
  addMediaQueryListener();
  resolveCurrentRoute();
  render();
  const sessionReady = loadSession();
  const projectReady = state.route?.params?.projectId
    ? loadProject(state.route.params.projectId)
    : Promise.resolve();

  return {
    ready: Promise.allSettled([sessionReady, projectReady]),
    navigate,
    openMobileNav,
    closeMobileNav,
    getState: () => state,
    destroy() {
      appDocument.removeEventListener("keydown", onDocumentKeydown);
      appWindow.removeEventListener("popstate", onPopState);
      removeMediaQueryListener();
    },
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const start = () => createAppShell();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
