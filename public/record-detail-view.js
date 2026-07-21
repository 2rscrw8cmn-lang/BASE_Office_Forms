import {
  escapeHtml,
  formatDate,
  recordStatusLabel,
  recordTypeLabel,
  revisionStatusLabel,
} from "./app-format.js";
import {
  createArchiveRecordDialog,
  createEditRecordDialog,
  createRevisionDialog,
} from "./record-detail-dialogs.js";

function revisionName(revision) {
  const value =
    revision.revisionLabel == null ||
    String(revision.revisionLabel).trim() === ""
      ? revision.revisionNumber
      : revision.revisionLabel;
  return `Rev ${value}`;
}
function fileText(count) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

export function createRecordDetailView({
  api,
  projectId,
  recordId,
  navigate,
  announce,
  requestRender,
}) {
  let state = { status: "loading", data: null, error: null };
  let controller = null;
  let destroyed = false;
  let requestSequence = 0;
  let dialog = null;
  const recordsHref = `/projects/${encodeURIComponent(projectId)}/records`;
  const revisionHref = (id) =>
    `${recordsHref}/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(id)}`;

  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const sequence = ++requestSequence;
    state = { status: "loading", data: null, error: null };
    requestRender();
    try {
      const { data } = await api.getRecordWorkspace(projectId, recordId, {
        signal: controller.signal,
      });
      if (destroyed || sequence !== requestSequence) return;
      state = { status: "loaded", data, error: null };
      requestRender();
    } catch (error) {
      if (destroyed || sequence !== requestSequence || error?.aborted) return;
      state = {
        status: error?.status === 404 ? "missing" : "error",
        data: null,
        error,
      };
      announce?.(
        error?.status === 404
          ? "Record not found."
          : "Record could not be loaded.",
      );
      requestRender();
    }
  }

  function currentMarkup(data) {
    const current = data.currentRevision;
    if (!current)
      return `<section class="record-current" aria-labelledby="current-title"><div class="record-section-heading"><h3 id="current-title">Current revision</h3></div><div class="record-compact-empty"><strong>No published revision</strong><p>Create a draft revision to begin this record’s revision history.</p>${data.capabilities.createRevision ? '<button class="secondary-button" type="button" data-create-revision>Create draft revision</button>' : ""}</div></section>`;
    return `<section class="record-current" aria-labelledby="current-title"><div class="record-section-heading"><h3 id="current-title">Current revision</h3></div><div class="record-current-line"><div><a href="${revisionHref(current.id)}" data-app-link class="record-revision-link">${escapeHtml(revisionName(current))}</a><span class="status-badge status-success">Published</span><p>${escapeHtml(current.changeSummary || "No change summary provided.")}</p></div><div class="record-revision-facts"><span>${fileText(current.fileCount)}</span><span>${escapeHtml(formatDate(current.createdAt) || "—")}</span></div></div></section>`;
  }

  function draftsMarkup(data) {
    const drafts = data.revisions.filter(
      (revision) => revision.status === "draft",
    );
    if (!drafts.length) return "";
    return `<section class="record-drafts" aria-labelledby="drafts-title"><div class="record-section-heading"><h3 id="drafts-title">Draft work</h3>${data.capabilities.createRevision ? '<button class="text-link" type="button" data-create-revision>Create another draft</button>' : ""}</div><ul>${drafts.map((draft) => `<li><a href="${revisionHref(draft.id)}" data-app-link>${escapeHtml(revisionName(draft))}</a><span class="status-badge status-attention">Draft</span><span>${escapeHtml(draft.changeSummary)}</span><small>${fileText(draft.fileCount)}</small></li>`).join("")}</ul></section>`;
  }

  function historyMarkup(data) {
    if (!data.revisions.length)
      return `<section class="record-history" aria-labelledby="history-title"><div class="record-section-heading"><h3 id="history-title">Revision history</h3></div><div class="record-compact-empty"><strong>No revisions yet</strong><p>Create the first draft revision to begin tracking files and issued documents.</p>${data.capabilities.createRevision ? '<button class="secondary-button" type="button" data-create-revision>Create draft revision</button>' : ""}</div></section>`;
    const rows = data.revisions
      .map(
        (revision) =>
          `<tr><th scope="row"><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a>${revision.isCurrent ? '<span class="record-current-note">Current revision</span>' : ""}</th><td>${escapeHtml(revisionStatusLabel(revision.status))}</td><td>${escapeHtml(revision.changeSummary || "—")}</td><td class="cell-number">${revision.fileCount}</td><td class="cell-date">${escapeHtml(formatDate(revision.createdAt) || "—")}</td></tr>`,
      )
      .join("");
    const cards = data.revisions
      .map(
        (revision) =>
          `<li class="record-revision-card"><div><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a><strong>${escapeHtml(revisionStatusLabel(revision.status))}${revision.isCurrent ? " · Current revision" : ""}</strong></div><p>${escapeHtml(revision.changeSummary || "No change summary provided.")}</p><small>${fileText(revision.fileCount)} · ${escapeHtml(formatDate(revision.createdAt) || "—")}</small></li>`,
      )
      .join("");
    return `<section class="record-history" aria-labelledby="history-title"><div class="record-section-heading"><h3 id="history-title">Revision history</h3><span>${data.revisions.length} revision${data.revisions.length === 1 ? "" : "s"}</span></div><div class="record-history-table"><table><caption class="sr-only">All revisions for this record</caption><thead><tr><th scope="col">Revision</th><th scope="col">Status</th><th scope="col">Change summary</th><th scope="col">Files</th><th scope="col">Created</th></tr></thead><tbody>${rows}</tbody></table></div><ul class="record-history-cards">${cards}</ul></section>`;
  }

  function detailItem(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`;
  }
  function loadedMarkup(data) {
    const record = data.record;
    return `<div class="record-detail-layout"><div class="record-detail-main"><a class="record-back-link" href="${recordsHref}" data-app-link>← Back to Records</a><header class="record-detail-header"><div class="record-detail-identity"><p class="record-detail-number">${escapeHtml(record.recordNumber || "No record number")}</p><h2 id="page-title" tabindex="-1">${escapeHtml(record.title)}</h2><p>${escapeHtml(recordTypeLabel(record.recordType))}${record.discipline ? ` · ${escapeHtml(record.discipline)}` : ""}</p></div><div class="record-detail-controls"><span class="status-badge status-${record.status === "active" ? "success" : "neutral"}">${escapeHtml(recordStatusLabel(record.status))}</span><div class="record-detail-actions">${data.capabilities.updateRecord ? '<button class="secondary-button" type="button" data-edit-record>Edit record</button>' : ""}${data.capabilities.archiveRecord ? '<button class="text-button-danger" type="button" data-archive-record>Archive</button>' : ""}${data.capabilities.createRevision && data.revisions.length ? '<button class="primary-button" type="button" data-create-revision>Create revision</button>' : ""}</div></div></header>${record.status === "archived" ? '<p class="record-archived-note">This record is archived and read-only.</p>' : ""}${currentMarkup(data)}${draftsMarkup(data)}${historyMarkup(data)}</div><aside class="record-details" aria-labelledby="details-title"><h3 id="details-title">Record details</h3><dl>${detailItem("Record type", recordTypeLabel(record.recordType))}${detailItem("Record number", record.recordNumber)}${detailItem("Discipline", record.discipline)}${detailItem("Description", record.description)}${record.source ? detailItem("Source", record.source) : ""}${detailItem("Created", formatDate(record.createdAt))}${detailItem("Updated", formatDate(record.updatedAt))}${record.archivedAt ? detailItem("Archived", formatDate(record.archivedAt)) : ""}${detailItem("Total files", String(data.totalFileCount))}</dl></aside></div>`;
  }

  function render() {
    if (state.status === "loading")
      return `<section class="record-detail-view app-container-standard"><div class="record-detail-skeleton" aria-busy="true" aria-label="Loading record"><span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span></div></section>`;
    if (state.status === "missing")
      return `<section class="record-detail-view app-container-standard"><div class="route-state route-not-found"><h2 id="page-title" tabindex="-1">Record not found</h2><p>The requested record is unavailable or you do not have access to it.</p><a href="${recordsHref}" data-app-link>Back to Records</a></div></section>`;
    if (state.status === "error")
      return `<section class="record-detail-view app-container-standard"><div class="inline-error" role="alert"><h2 id="page-title" tabindex="-1">Record could not be loaded</h2><p>${escapeHtml(state.error?.message || "No changes were made. Check your connection and try again.")}</p>${state.error?.requestId ? `<p class="request-id">Request ID <code>${escapeHtml(state.error.requestId)}</code></p>` : ""}<button class="secondary-button" type="button" data-record-retry>Try again</button></div></section>`;
    return `<section class="record-detail-view app-container-standard">${loadedMarkup(state.data)}</section>`;
  }

  function openDialog(kind, container) {
    if (!state.data || dialog) return;
    const shared = {
      api,
      projectId,
      record: state.data.record,
      document: container.ownerDocument,
      announce,
      onClose: () => {
        dialog = null;
      },
    };
    if (kind === "edit" && state.data.capabilities.updateRecord)
      dialog = createEditRecordDialog({ ...shared, onSuccess: reload });
    if (kind === "archive" && state.data.capabilities.archiveRecord)
      dialog = createArchiveRecordDialog({ ...shared, onSuccess: reload });
    if (kind === "revision" && state.data.capabilities.createRevision)
      dialog = createRevisionDialog({
        ...shared,
        onSuccess: (revision) => {
          if (revision?.id) navigate(revisionHref(revision.id));
        },
      });
  }
  function mount(container) {
    container.innerHTML = render();
    container
      .querySelector("[data-record-retry]")
      ?.addEventListener("click", reload);
    container.querySelectorAll("a[data-app-link]").forEach((link) =>
      link.addEventListener("click", (event) => {
        if (
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(link.getAttribute("href"));
      }),
    );
    container
      .querySelector("[data-edit-record]")
      ?.addEventListener("click", () => openDialog("edit", container));
    container
      .querySelector("[data-archive-record]")
      ?.addEventListener("click", () => openDialog("archive", container));
    container
      .querySelectorAll("[data-create-revision]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          openDialog("revision", container),
        ),
      );
  }
  function destroy() {
    destroyed = true;
    requestSequence += 1;
    controller?.abort();
    dialog?.close({ restoreFocus: false });
  }
  return { mount, reload, destroy };
}
