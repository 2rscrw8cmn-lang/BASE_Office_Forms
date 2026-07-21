// Work Dashboard feature module. Owns dashboard data loading, rendering, and
// state transitions. The shell owns global layout, route changes, and focus;
// this module renders into a container the shell provides and re-renders itself
// through the shell-supplied requestRender callback.
import {
  escapeHtml,
  formatDate,
  purposeLabel,
  draftRevisionReason,
  readyToIssueReason,
  activeRfiReason,
  fileUploadedReason,
  issuanceCreatedReason,
} from "./app-format.js";

function revisionHref(item) {
  return `/projects/${encodeURIComponent(item.projectId)}/records/${encodeURIComponent(item.recordId)}/revisions/${encodeURIComponent(item.revisionId)}`;
}

function issueHref(item) {
  return `${revisionHref(item)}/issue`;
}

function rfiHref(item) {
  return `/projects/${encodeURIComponent(item.projectId)}/rfis/${encodeURIComponent(item.rfiId)}`;
}

function issuanceHref(item) {
  return `/projects/${encodeURIComponent(item.projectId)}/issuances/${encodeURIComponent(item.issuanceId)}`;
}

function projectLabel(item) {
  return `${item.projectNumber} · ${item.projectName}`;
}

function metric(label, value) {
  return `<div class="summary-metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
}

function attentionItem({ href, primary, secondary, reason, badge }) {
  return `<li class="attention-item"><a href="${escapeHtml(href)}" data-app-link>
      <span class="attention-primary">${escapeHtml(primary)}</span>
      <span class="attention-secondary">${escapeHtml(secondary)}</span>
      <span class="attention-reason">${badge ? `<span class="reason-badge">${escapeHtml(badge)}</span>` : ""}${escapeHtml(reason)}</span>
    </a></li>`;
}

function attentionGroup(title, items, emptyMessage) {
  const body = items.length
    ? `<ul class="attention-list">${items.join("")}</ul>`
    : `<p class="attention-empty">${escapeHtml(emptyMessage)}</p>`;
  return `<section class="attention-group" aria-labelledby="${title.id}">
      <h3 id="${title.id}">${escapeHtml(title.label)}${items.length ? ` <span class="group-count">${items.length}</span>` : ""}</h3>
      ${body}
    </section>`;
}

export function createDashboardView({
  api,
  navigate,
  announce,
  requestRender,
  getSession,
}) {
  let state = { status: "loading", data: null, error: null };
  let controller = null;
  let destroyed = false;

  async function reload() {
    if (controller) controller.abort();
    controller = new AbortController();
    state = { status: "loading", data: null, error: null };
    requestRender();
    try {
      const { data } = await api.getDashboard({ signal: controller.signal });
      if (destroyed) return;
      state = { status: "loaded", data, error: null };
      requestRender();
    } catch (error) {
      if (destroyed || error.aborted) return;
      state = { status: "error", data: null, error };
      announce?.("The dashboard could not be loaded.");
      requestRender();
    }
  }

  function heading() {
    const session = getSession?.();
    const org =
      session?.status === "ready" ? session.data?.organization?.name : "";
    return `<div class="page-heading"><div class="app-container-standard">
        <p class="app-eyebrow">Workspace</p>
        <h1 id="page-title" tabindex="-1">Work Dashboard</h1>
        <p>What needs your attention today across the projects you can access.</p>
        ${org ? `<p class="page-context">${escapeHtml(org)}</p>` : ""}
      </div></div>`;
  }

  function summaryStrip(summary) {
    return `<dl class="summary-strip" aria-label="Workspace summary">
        ${metric("Accessible projects", summary.accessibleProjectCount)}
        ${metric("Draft revisions", summary.draftRevisionCount)}
        ${metric("Ready to issue", summary.readyToIssueCount)}
        ${metric("Active RFIs", summary.activeRfiCount)}
      </dl>`;
  }

  function needsAttention(data) {
    const draftItems = data.draftRevisions.map((item) =>
      attentionItem({
        href: revisionHref(item),
        primary: `${item.recordTitle} · Rev ${item.revisionNumber}`,
        secondary: projectLabel(item),
        reason: draftRevisionReason(),
      }),
    );
    const readyItems = data.readyToIssue.map((item) =>
      attentionItem({
        href: issueHref(item),
        primary: `${item.recordTitle} · Rev ${item.revisionNumber}`,
        secondary: projectLabel(item),
        reason: readyToIssueReason(item.fileCount),
      }),
    );
    const rfiItems = data.activeRfis.map((item) =>
      attentionItem({
        href: rfiHref(item),
        primary: `${item.rfiNumber ? item.rfiNumber + " · " : ""}${item.title}`,
        secondary: projectLabel(item),
        reason: activeRfiReason(item.status),
        badge: item.dueDate ? `Due ${formatDate(item.dueDate)}` : "",
      }),
    );

    const allEmpty =
      !draftItems.length && !readyItems.length && !rfiItems.length;
    const noProjects = data.summary.accessibleProjectCount === 0;
    if (allEmpty) {
      const message = noProjects
        ? "You do not have access to any projects yet."
        : "No work currently requires your attention.";
      return `<section class="dashboard-section" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs attention</h2>
          <p class="section-empty">${escapeHtml(message)}</p>
        </section>`;
    }

    return `<section class="dashboard-section" aria-labelledby="attention-title">
        <h2 id="attention-title">Needs attention</h2>
        <div class="attention-groups">
          ${attentionGroup({ id: "attn-draft", label: "Draft revisions" }, draftItems, "No draft revisions.")}
          ${attentionGroup({ id: "attn-ready", label: "Ready to issue" }, readyItems, "No revisions ready to issue.")}
          ${attentionGroup({ id: "attn-rfi", label: "Active RFIs" }, rfiItems, "No active RFIs.")}
        </div>
      </section>`;
  }

  function recentActivity(data) {
    const files = data.recentFiles.map((item) =>
      attentionItem({
        href: revisionHref(item),
        primary: item.originalFilename,
        secondary: `${item.recordTitle} · ${projectLabel(item)}`,
        reason: fileUploadedReason(item.uploadedAt),
      }),
    );
    const issuances = data.recentIssuances.map((item) =>
      attentionItem({
        href: issuanceHref(item),
        primary: `${item.issueNumber} · ${item.recordTitle}`,
        secondary: projectLabel(item),
        reason: `${issuanceCreatedReason(item.issueNumber)} · ${purposeLabel(item.purpose)}`,
      }),
    );
    if (!files.length && !issuances.length) {
      return `<section class="dashboard-section" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent activity</h2>
          <p class="section-empty">No recent files or issuances yet.</p>
        </section>`;
    }
    return `<section class="dashboard-section" aria-labelledby="recent-title">
        <h2 id="recent-title">Recent activity</h2>
        <div class="attention-groups">
          ${attentionGroup({ id: "recent-files", label: "Recent file uploads" }, files, "No recent file uploads.")}
          ${attentionGroup({ id: "recent-iss", label: "Recent issuances" }, issuances, "No recent issuances.")}
        </div>
      </section>`;
  }

  function body() {
    if (state.status === "loading") {
      return `<div class="dashboard-body app-container-standard"><section class="route-state route-loading" aria-busy="true" aria-label="Loading dashboard">
          <span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span>
        </section></div>`;
    }
    if (state.status === "error") {
      const requestId = state.error?.requestId;
      return `<div class="dashboard-body app-container-standard"><section class="inline-error" role="alert">
          <p class="app-eyebrow">Unable to load</p>
          <p>The dashboard could not be loaded. No changes were made.</p>
          ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
          <div class="state-actions"><button class="secondary-button" type="button" data-dashboard-retry>Try again</button></div>
        </section></div>`;
    }
    const data = state.data;
    return `<div class="dashboard-body app-container-standard">
        ${summaryStrip(data.summary)}
        ${needsAttention(data)}
        ${recentActivity(data)}
        <section class="dashboard-section projects-shortcut">
          <a class="text-link" href="/projects" data-app-link>View all projects</a>
        </section>
      </div>`;
  }

  function mount(container) {
    container.innerHTML = `<section class="workspace-page dashboard-view">${heading()}${body()}</section>`;
    container
      .querySelector("[data-dashboard-retry]")
      ?.addEventListener("click", () => reload());
    container.querySelectorAll("a[data-app-link]").forEach((link) => {
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
  }

  function destroy() {
    destroyed = true;
    if (controller) controller.abort();
  }

  return { mount, reload, destroy };
}
