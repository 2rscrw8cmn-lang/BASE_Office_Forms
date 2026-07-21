// Project Overview feature module. Renders below the shell-owned project header
// and tabs: a compact operational summary, needs-attention lists, a recent
// project-activity timeline, and workflow shortcuts. It loads its own read model
// (`GET /api/v2/projects/:id/overview`) and never issues a duplicate
// project-detail request. Responses for an older project route are ignored.
import {
  escapeHtml,
  formatDate,
  draftRevisionReason,
  readyToIssueReason,
  activeRfiReason,
  describeActivity,
  actorLabel,
} from "./app-format.js";

function base(projectId) {
  return `/projects/${encodeURIComponent(projectId)}`;
}
function revisionHref(projectId, item) {
  return `${base(projectId)}/records/${encodeURIComponent(item.recordId)}/revisions/${encodeURIComponent(item.revisionId)}`;
}
function issueHref(projectId, item) {
  return `${revisionHref(projectId, item)}/issue`;
}
function rfiHref(projectId, item) {
  return `${base(projectId)}/rfis/${encodeURIComponent(item.rfiId)}`;
}

function attentionItem({ href, primary, secondary, reason, badge }) {
  return `<li class="attention-item"><a href="${escapeHtml(href)}" data-app-link>
      <span class="attention-primary">${escapeHtml(primary)}</span>
      ${secondary ? `<span class="attention-secondary">${escapeHtml(secondary)}</span>` : ""}
      <span class="attention-reason">${badge ? `<span class="reason-badge">${escapeHtml(badge)}</span>` : ""}${escapeHtml(reason)}</span>
    </a></li>`;
}

function attentionGroup(id, label, items, emptyMessage) {
  const body = items.length
    ? `<ul class="attention-list">${items.join("")}</ul>`
    : `<p class="attention-empty">${escapeHtml(emptyMessage)}</p>`;
  return `<section class="attention-group" aria-labelledby="${id}">
      <h3 id="${id}">${escapeHtml(label)}${items.length ? ` <span class="group-count">${items.length}</span>` : ""}</h3>
      ${body}
    </section>`;
}

export function createProjectOverviewView({
  api,
  navigate,
  announce,
  requestRender,
  projectId,
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
      const { data } = await api.getProjectOverview(projectId, {
        signal: controller.signal,
      });
      if (destroyed) return;
      state = { status: "loaded", data, error: null };
      requestRender();
    } catch (error) {
      if (destroyed || error.aborted) return;
      state = {
        status:
          error.status === 403 || error.status === 404 ? "missing" : "error",
        data: null,
        error,
      };
      requestRender();
    }
  }

  function summary(counts) {
    const tiles = [
      {
        label: "Records",
        value: counts.records,
        href: `${base(projectId)}/records`,
      },
      { label: "Draft revisions", value: counts.draftRevisions },
      { label: "Published revisions", value: counts.publishedRevisions },
      { label: "Files", value: counts.files },
      {
        label: "Issuances",
        value: counts.issuances,
        href: `${base(projectId)}/issuances`,
      },
      {
        label: "Active RFIs",
        value: counts.activeRfis,
        href: `${base(projectId)}/rfis`,
      },
    ];
    // One compact, shared strip rather than six equal free-standing boxes.
    return `<dl class="overview-summary" aria-label="Project summary">${tiles
      .map((tile) =>
        tile.href
          ? `<a class="overview-metric overview-metric-link" href="${escapeHtml(tile.href)}" data-app-link><dt>${escapeHtml(tile.label)}</dt><dd>${escapeHtml(String(tile.value))}</dd></a>`
          : `<div class="overview-metric"><dt>${escapeHtml(tile.label)}</dt><dd>${escapeHtml(String(tile.value))}</dd></div>`,
      )
      .join("")}</dl>`;
  }

  function needsAttention(data) {
    const draftItems = data.attention.draftRevisions.map((item) =>
      attentionItem({
        href: revisionHref(projectId, item),
        primary: `${item.recordTitle} · Rev ${item.revisionNumber}`,
        reason: draftRevisionReason(),
      }),
    );
    const readyItems = data.attention.readyToIssue.map((item) =>
      attentionItem({
        href: issueHref(projectId, item),
        primary: `${item.recordTitle} · Rev ${item.revisionNumber}`,
        reason: readyToIssueReason(item.fileCount),
      }),
    );
    const rfiItems = data.attention.activeRfis.map((item) =>
      attentionItem({
        href: rfiHref(projectId, item),
        primary: `${item.rfiNumber ? item.rfiNumber + " · " : ""}${item.title}`,
        reason: activeRfiReason(item.status),
        badge: item.dueDate ? `Due ${formatDate(item.dueDate)}` : "",
      }),
    );
    if (!draftItems.length && !readyItems.length && !rfiItems.length) {
      return `<section class="overview-section" aria-labelledby="ov-attention">
          <h2 id="ov-attention">Needs attention</h2>
          <p class="section-empty">No work currently requires attention in this project.</p>
        </section>`;
    }
    return `<section class="overview-section" aria-labelledby="ov-attention">
        <h2 id="ov-attention">Needs attention</h2>
        <div class="attention-groups">
          ${attentionGroup("ov-draft", "Draft revisions", draftItems, "No draft revisions.")}
          ${attentionGroup("ov-ready", "Ready to issue", readyItems, "No revisions ready to issue.")}
          ${attentionGroup("ov-rfi", "Active RFIs", rfiItems, "No active RFIs.")}
        </div>
      </section>`;
  }

  function recentActivity(events) {
    if (!events.length) {
      return `<section class="overview-section" aria-labelledby="ov-recent">
          <h2 id="ov-recent">Recent activity</h2>
          <p class="section-empty">No recent activity in this project yet.</p>
        </section>`;
    }
    const items = events
      .map(
        (event) => `<li class="timeline-item">
          <span class="timeline-action">${escapeHtml(describeActivity(event.action))}</span>
          <span class="timeline-meta">${escapeHtml(actorLabel(event))} · ${escapeHtml(formatDate(event.occurredAt))}</span>
        </li>`,
      )
      .join("");
    return `<section class="overview-section" aria-labelledby="ov-recent">
        <h2 id="ov-recent">Recent activity</h2>
        <ul class="timeline">${items}</ul>
      </section>`;
  }

  function shortcuts(counts) {
    const links = [
      {
        label: "Records",
        href: `${base(projectId)}/records`,
        value: counts.records,
      },
      {
        label: "Issuances",
        href: `${base(projectId)}/issuances`,
        value: counts.issuances,
      },
      {
        label: "RFIs",
        href: `${base(projectId)}/rfis`,
        value: counts.activeRfis,
      },
      {
        label: "Team",
        href: `${base(projectId)}/team`,
        value: counts.teamMembers,
      },
    ];
    return `<nav class="overview-section overview-shortcuts" aria-labelledby="ov-shortcuts">
        <h2 id="ov-shortcuts">Workflow shortcuts</h2>
        <div class="shortcut-grid">${links
          .map(
            (
              link,
            ) => `<a class="shortcut-card" href="${escapeHtml(link.href)}" data-app-link>
              <span class="shortcut-label">${escapeHtml(link.label)}</span>
              <span class="shortcut-go"><span class="shortcut-count">${escapeHtml(String(link.value))}</span><span class="shortcut-arrow" aria-hidden="true">→</span></span>
            </a>`,
          )
          .join("")}</div>
      </nav>`;
  }

  function markup() {
    if (state.status === "loading") {
      return `<section class="route-state route-loading" aria-busy="true" aria-label="Loading project overview">
          <span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span>
        </section>`;
    }
    if (state.status === "missing") {
      return `<section class="inline-error" role="alert">
          <p class="app-eyebrow">Unavailable</p>
          <p>This project overview is unavailable or you do not have access to it.</p>
        </section>`;
    }
    if (state.status === "error") {
      const requestId = state.error?.requestId;
      return `<section class="inline-error" role="alert">
          <p class="app-eyebrow">Unable to load</p>
          <p>The project overview could not be loaded. No changes were made.</p>
          ${requestId ? `<p class="request-id">Request ID <code>${escapeHtml(requestId)}</code></p>` : ""}
          <div class="state-actions"><button class="secondary-button" type="button" data-overview-retry>Try again</button></div>
        </section>`;
    }
    const data = state.data;
    return `${summary(data.counts)}${needsAttention(data)}${recentActivity(data.recentActivity)}${shortcuts(data.counts)}`;
  }

  function mount(container) {
    container.innerHTML = `<div class="overview-view app-container-standard">${markup()}</div>`;
    container
      .querySelector("[data-overview-retry]")
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
