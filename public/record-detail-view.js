import {
  escapeHtml,
  fileTypeLabel,
  formatDate,
  disciplineLabel,
  recordTypeLabel,
  revisionName,
  revisionStatusLabel,
} from "./app-format.js";
import {
  createArchiveRecordDialog,
  createEditRecordDialog,
  createRevisionDialog,
} from "./record-detail-dialogs.js";

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  let publishingId = null;
  const documentsHref = `/projects/${encodeURIComponent(projectId)}/records`;
  const revisionHref = (id) =>
    `${documentsHref}/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(id)}`;
  const fileHref = (revisionId, fileId) =>
    `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/files/${encodeURIComponent(fileId)}/content`;

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
          ? "Document not found."
          : "Document could not be loaded.",
      );
      requestRender();
    }
  }

  function fileCard(file, revision, prominent = false) {
    return `<article class="document-file-card${prominent ? " is-primary" : ""}">
      <div class="document-file-icon" aria-hidden="true"><svg class="app-icon" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V21H6z"></path><path d="M14 3.5V8h4M9 12h6M9 16h4"></path></svg></div>
      <div class="document-file-copy"><strong>${escapeHtml(file.originalFilename)}</strong><span>${escapeHtml(fileTypeLabel(file.mediaType))} · ${escapeHtml(formatBytes(file.byteSize))} · Uploaded ${escapeHtml(formatDate(file.uploadedAt) || "—")}</span></div>
      <a class="secondary-button" href="${fileHref(revision.id, file.id)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(file.originalFilename)}">View file</a>
    </article>`;
  }

  function filesMarkup(revision) {
    if (!revision.files.length) return "";
    return `<div class="document-files" aria-label="Files for ${escapeHtml(revisionName(revision))}">
      ${fileCard(revision.files[0], revision, true)}
      ${
        revision.files.length > 1
          ? `<div class="document-file-list"><h4>Additional files</h4>${revision.files
              .slice(1)
              .map((file) => fileCard(file, revision))
              .join("")}</div>`
          : ""
      }
    </div>`;
  }

  function workActions(revision, isPublished = false) {
    const files = revision.files || [];
    if (
      !isPublished &&
      files.length === 0 &&
      revision.capabilities?.uploadFile
    ) {
      return `<a class="primary-button document-primary-action" href="${revisionHref(revision.id)}" data-app-link>${revision.revisionNumber === 1 ? "Upload original" : "Upload document"}</a>`;
    }
    if (!isPublished && files.length > 0) {
      return `<div class="document-action-row"><a class="primary-button" href="${revisionHref(revision.id)}" data-app-link>View current version</a>${revision.capabilities?.publishRevision ? `<button class="secondary-button" type="button" data-publish-revision="${escapeHtml(revision.id)}"${publishingId === revision.id ? ' disabled aria-busy="true"' : ""}>${publishingId === revision.id ? "Publishing…" : "Publish revision"}</button>` : ""}</div>`;
    }
    if (isPublished) return "";
    return `<a class="secondary-button" href="${revisionHref(revision.id)}" data-app-link>View current version</a>`;
  }

  function issuanceText(revision) {
    const count = Number(revision?.issuanceCount) || 0;
    return count ? `${count} issuance${count === 1 ? "" : "s"}` : "Not issued";
  }

  function revisionTone(status) {
    if (status === "published") return "success";
    if (status === "draft") return "attention";
    return "neutral";
  }

  function singleWorkPanel(revision, { draft = false } = {}) {
    return `<section class="document-work-panel is-${escapeHtml(revision.status)}" aria-labelledby="work-title">
      <div class="document-work-head"><div><p class="document-section-label">${draft ? "Current work" : "Current version"}</p><div class="document-work-title"><h3 id="work-title">${escapeHtml(revisionName(revision))}</h3><span class="status-badge status-${revisionTone(revision.status)}">${escapeHtml(revisionStatusLabel(revision.status))}</span></div><div class="document-change-summary"><span>Change summary</span><strong>${escapeHtml(revision.changeSummary || "No change summary provided.")}</strong></div></div><dl class="document-work-facts"><div><dt>Created</dt><dd>${escapeHtml(formatDate(revision.createdAt) || "—")}</dd></div><div><dt>Issuance</dt><dd><span class="issuance-badge${revision.issuanceCount ? " is-issued" : ""}">${escapeHtml(issuanceText(revision))}</span></dd></div></dl></div>
      <div class="document-files-heading"><h4>Files</h4><span>${revision.fileCount}</span></div>
      ${revision.files.length ? filesMarkup(revision) : `<div class="document-upload-empty"><div><strong>No document file yet</strong><p>Add the document file to this draft before it is published.</p></div>${workActions(revision)}</div>`}
      ${revision.files.length && draft ? workActions(revision) : ""}
    </section>`;
  }

  function currentWork(data) {
    const drafts = data.revisions.filter(
      (revision) => revision.status === "draft",
    );
    if (drafts.length === 1) return singleWorkPanel(drafts[0], { draft: true });
    if (drafts.length > 1) {
      return `<section class="document-work-panel is-draft" aria-labelledby="work-title"><div class="document-work-head"><div><p class="document-section-label">Current work</p><h3 id="work-title">${drafts.length} drafts in progress</h3></div></div><p>Choose a draft to continue its files or publishing workflow.</p><ul class="document-draft-list">${drafts.map((draft) => `<li><div><a href="${revisionHref(draft.id)}" data-app-link>${escapeHtml(revisionName(draft))}</a><span class="status-badge status-attention">Draft</span><p>${escapeHtml(draft.changeSummary)}</p></div><span>${draft.fileCount} file${draft.fileCount === 1 ? "" : "s"}</span></li>`).join("")}</ul></section>`;
    }
    if (data.currentRevision) return singleWorkPanel(data.currentRevision);
    return `<section class="document-work-panel document-empty-work" aria-labelledby="work-title"><div><p class="document-section-label">Current work</p><h3 id="work-title">No original yet</h3><p>Create the original to add the working document and begin its history.</p></div>${data.capabilities.createRevision ? '<button class="primary-button document-primary-action" type="button" data-create-revision>Create original</button>' : ""}</section>`;
  }

  function history(data) {
    const revisions = data.revisions.filter(
      (revision) => revision.status !== "draft" && !revision.isCurrent,
    );
    if (!revisions.length) return "";
    const row = (revision) =>
      `<tr><th scope="row"><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a></th><td><span class="status-badge status-${revisionTone(revision.status)}">${escapeHtml(revisionStatusLabel(revision.status))}</span></td><td class="revision-summary-cell">${escapeHtml(revision.changeSummary || "—")}</td><td class="cell-files">${revision.fileCount}</td><td class="cell-date">${escapeHtml(formatDate(revision.createdAt) || "—")}</td><td class="revision-issued-cell"><span class="issuance-badge${revision.issuanceCount ? " is-issued" : ""}">${escapeHtml(issuanceText(revision))}</span></td><td class="cell-open"><a class="open-link" href="${revisionHref(revision.id)}" data-app-link aria-label="View ${escapeHtml(revisionName(revision))}">View <span class="open-arrow" aria-hidden="true">→</span></a></td></tr>`;
    const card = (revision) =>
      `<li><div><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a><span class="status-badge status-${revisionTone(revision.status)}">${escapeHtml(revisionStatusLabel(revision.status))}</span></div><p>${escapeHtml(revision.changeSummary || "No change summary provided.")}</p><small>${revision.fileCount} file${revision.fileCount === 1 ? "" : "s"} · ${issuanceText(revision)} · Created ${escapeHtml(formatDate(revision.createdAt) || "—")}</small></li>`;
    const countLabel = `${revisions.length} previous version${revisions.length === 1 ? "" : "s"}`;
    return `<section class="document-history" aria-labelledby="history-title"><div class="document-section-heading"><h3 id="history-title">Version history</h3><span>${countLabel}</span></div><div class="document-history-table records-table-wrap"><table class="records-table app-data-table document-revision-table"><caption class="sr-only">Previous published and superseded versions</caption><thead><tr><th>Version</th><th>Status</th><th>Change summary</th><th>Files</th><th>Created</th><th>Issuance</th><th><span class="sr-only">View</span></th></tr></thead><tbody>${revisions.map(row).join("")}</tbody></table></div><ul class="document-history-cards">${revisions.map(card).join("")}</ul></section>`;
  }

  function optionsMarkup(data) {
    if (
      data.record.status !== "active" ||
      (!data.capabilities.updateRecord && !data.capabilities.archiveRecord)
    )
      return "";
    return `<details class="document-options"><summary aria-label="Document options">…</summary><div>${data.capabilities.updateRecord ? '<button type="button" data-edit-record>Edit document details</button>' : ""}${data.capabilities.archiveRecord ? '<button class="is-destructive" type="button" data-archive-record>Archive document</button>' : ""}</div></details>`;
  }

  function headerActions(data, drafts) {
    let primary = "";
    let secondary = "";
    if (drafts.length === 1) {
      const draft = drafts[0];
      primary = `<a class="primary-button" href="${revisionHref(draft.id)}" data-app-link>${draft.files.length ? "View current version" : draft.revisionNumber === 1 ? "Upload original" : "Upload document"}</a>`;
    } else if (data.currentRevision) {
      primary = `<a class="primary-button" href="${revisionHref(data.currentRevision.id)}" data-app-link>View current version</a>`;
      if (data.capabilities.createRevision) {
        secondary =
          '<button class="secondary-button" type="button" data-create-revision>Create revision</button>';
      }
    } else if (data.capabilities.createRevision) {
      primary =
        '<button class="primary-button" type="button" data-create-revision>Create revision</button>';
    }
    const options = optionsMarkup(data);
    return primary || secondary || options
      ? `<div class="document-header-actions">${primary}${secondary}${options}</div>`
      : "";
  }

  function loaded(data) {
    const record = data.record;
    const drafts = data.revisions.filter(
      (revision) => revision.status === "draft",
    );
    const focusRevision =
      drafts.length === 1 ? drafts[0] : data.currentRevision;
    const description = String(record.description ?? "").trim();
    const source = String(record.source ?? "").trim();
    const headerContext =
      description || source
        ? `<div class="document-header-context">${description ? `<p>${escapeHtml(description)}</p>` : ""}${source ? `<p><span>Source</span> ${escapeHtml(source)}</p>` : ""}</div>`
        : "";
    return `<nav class="document-breadcrumbs" aria-label="Breadcrumb"><a href="${documentsHref}" data-app-link>Documents</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(record.title)}</span></nav><header class="document-identity"><div class="document-title-row"><h2 id="page-title" tabindex="-1">${escapeHtml(record.title)}</h2>${record.status === "archived" ? '<span class="status-badge status-neutral">Archived</span>' : ""}</div>${headerActions(data, drafts)}</header><div class="document-header-facts"><span><small>Document no.</small><strong>${escapeHtml(record.recordNumber || "Unnumbered")}</strong></span><span><small>Type</small><strong>${escapeHtml(recordTypeLabel(record.recordType))}</strong></span><span><small>Discipline</small><strong>${escapeHtml(disciplineLabel(record.discipline))}</strong></span><span><small>Current version</small><strong>${focusRevision ? escapeHtml(revisionName(focusRevision)) : "—"}</strong></span></div>${headerContext}${record.status === "archived" ? `<div class="document-read-only"><strong>Archived document</strong><span>This document is read-only${record.archivedAt ? ` · Archived ${escapeHtml(formatDate(record.archivedAt))}` : ""}.</span></div>` : ""}${currentWork(data)}${history(data)}`;
  }

  function markup() {
    if (state.status === "loading")
      return '<div class="record-detail-skeleton" aria-busy="true" aria-label="Loading document"><span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span></div>';
    if (state.status === "missing")
      return `<div class="route-state route-not-found"><h2 id="page-title" tabindex="-1">Document not found</h2><p>The requested document is unavailable or you do not have access to it.</p><a class="record-back-link" href="${documentsHref}" data-app-link>← Back to Document Register</a></div>`;
    if (state.status === "error")
      return `<div class="inline-error" role="alert"><h2 id="page-title" tabindex="-1">Document could not be loaded</h2><p>${escapeHtml(state.error?.message || "No changes were made. Check your connection and try again.")}</p>${state.error?.requestId ? `<p class="request-id">Request ID <code>${escapeHtml(state.error.requestId)}</code></p>` : ""}<button class="secondary-button" type="button" data-record-retry>Try again</button></div>`;
    return loaded(state.data);
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

  async function publish(revisionId) {
    if (publishingId || !state.data) return;
    const revision = state.data.revisions.find(
      (item) => item.id === revisionId,
    );
    if (!revision?.capabilities?.publishRevision || !revision.files.length)
      return;
    publishingId = revisionId;
    requestRender();
    announce?.("Publishing revision.");
    try {
      await api.publishRevision(projectId, recordId, revisionId);
      publishingId = null;
      announce?.("Revision published.");
      await reload();
    } catch (error) {
      publishingId = null;
      state = { ...state, error };
      announce?.(
        `Revision could not be published.${error?.requestId ? ` Request ID ${error.requestId}.` : ""}`,
      );
      requestRender();
    }
  }

  function bindLink(link) {
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
    });
  }

  function mount(container) {
    container.innerHTML = `<section class="record-detail-view document-workspace app-container-register">${markup()}</section>`;
    container
      .querySelector("[data-record-retry]")
      ?.addEventListener("click", reload);
    container.querySelectorAll("a[data-app-link]").forEach(bindLink);
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
    container
      .querySelectorAll("[data-publish-revision]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          publish(button.getAttribute("data-publish-revision")),
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
