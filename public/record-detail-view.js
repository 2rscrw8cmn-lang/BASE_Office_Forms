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
  const label = String(revision.revisionLabel ?? "").trim();
  return label ? `Revision ${label}` : `Revision ${revision.revisionNumber}`;
}

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
      <div class="document-file-icon" aria-hidden="true">${file.mediaType === "application/pdf" ? "PDF" : "FILE"}</div>
      <div class="document-file-copy"><strong>${escapeHtml(file.originalFilename)}</strong><span>${escapeHtml(file.mediaType || "File")} · ${escapeHtml(formatBytes(file.byteSize))} · Uploaded ${escapeHtml(formatDate(file.uploadedAt) || "—")}</span></div>
      <a class="${prominent ? "primary-button" : "secondary-button"}" href="${fileHref(revision.id, file.id)}" target="_blank" rel="noopener">Open / download</a>
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
      return `<a class="primary-button document-primary-action" href="${revisionHref(revision.id)}" data-app-link>Upload document</a>`;
    }
    if (!isPublished && files.length > 0) {
      return `<div class="document-action-row"><a class="primary-button" href="${revisionHref(revision.id)}" data-app-link>Open draft</a>${revision.capabilities?.publishRevision ? `<button class="secondary-button" type="button" data-publish-revision="${escapeHtml(revision.id)}"${publishingId === revision.id ? ' disabled aria-busy="true"' : ""}>${publishingId === revision.id ? "Publishing…" : "Publish revision"}</button>` : ""}</div>`;
    }
    if (isPublished && files.length > 0) {
      return `<div class="document-action-row"><a class="primary-button" href="${fileHref(revision.id, files[0].id)}" target="_blank" rel="noopener">Open current document</a>${state.data.capabilities.createRevision ? '<button class="secondary-button" type="button" data-create-revision>Create new revision</button>' : ""}</div>`;
    }
    if (isPublished && state.data.capabilities.createRevision) {
      return '<button class="primary-button document-primary-action" type="button" data-create-revision>Create new revision</button>';
    }
    return `<a class="secondary-button" href="${revisionHref(revision.id)}" data-app-link>Open revision</a>`;
  }

  function singleWorkPanel(revision, { draft = false } = {}) {
    return `<section class="document-work-panel" aria-labelledby="work-title">
      <div class="document-work-head"><div><p>${draft ? "Current work" : "Current published document"}</p><h3 id="work-title">${escapeHtml(revisionName(revision))}</h3><span class="status-badge status-${draft ? "attention" : "success"}">${escapeHtml(revisionStatusLabel(revision.status))}</span></div><div class="document-work-meta"><span>${revision.fileCount} file${revision.fileCount === 1 ? "" : "s"}</span><span>${escapeHtml(formatDate(revision.createdAt) || "—")}</span></div></div>
      <p class="document-change-summary"><strong>What changed</strong>${escapeHtml(revision.changeSummary || "No change summary provided.")}</p>
      ${revision.files.length ? filesMarkup(revision) : `<div class="document-upload-empty"><div><strong>No document file yet</strong><p>Add the document file to this draft before it is published.</p></div>${workActions(revision)}</div>`}
      ${revision.files.length ? workActions(revision, !draft) : ""}
    </section>`;
  }

  function currentWork(data) {
    const drafts = data.revisions.filter(
      (revision) => revision.status === "draft",
    );
    if (drafts.length === 1) return singleWorkPanel(drafts[0], { draft: true });
    if (drafts.length > 1) {
      return `<section class="document-work-panel" aria-labelledby="work-title"><div class="document-work-head"><div><p>Current work</p><h3 id="work-title">${drafts.length} drafts in progress</h3></div></div><p>Choose a draft to continue its files or publishing workflow.</p><ul class="document-draft-list">${drafts.map((draft) => `<li><div><a href="${revisionHref(draft.id)}" data-app-link>${escapeHtml(revisionName(draft))}</a><span class="status-badge status-attention">Draft</span><p>${escapeHtml(draft.changeSummary)}</p></div><span>${draft.fileCount} file${draft.fileCount === 1 ? "" : "s"}</span></li>`).join("")}</ul></section>`;
    }
    if (data.currentRevision) return singleWorkPanel(data.currentRevision);
    return `<section class="document-work-panel document-empty-work" aria-labelledby="work-title"><div><p>Current work</p><h3 id="work-title">No revision yet</h3><p>Create the first revision to add the working document and begin its history.</p></div>${data.capabilities.createRevision ? '<button class="primary-button document-primary-action" type="button" data-create-revision>Create first revision</button>' : ""}</section>`;
  }

  function history(data) {
    const revisions = data.revisions.filter(
      (revision) => revision.status !== "draft",
    );
    if (!revisions.length) return "";
    const row = (revision) =>
      `<tr><th scope="row"><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a>${revision.isCurrent ? '<span class="document-current-note">Current</span>' : ""}</th><td>${escapeHtml(revisionStatusLabel(revision.status))}</td><td>${escapeHtml(revision.changeSummary || "—")}</td><td>${revision.fileCount}</td><td>${escapeHtml(formatDate(revision.createdAt) || "—")}</td><td>${revision.issuanceCount ? `${revision.issuanceCount} issuance${revision.issuanceCount === 1 ? "" : "s"}` : "Not issued"}</td><td><a href="${revisionHref(revision.id)}" data-app-link>Open</a></td></tr>`;
    const card = (revision) =>
      `<li><div><a href="${revisionHref(revision.id)}" data-app-link>${escapeHtml(revisionName(revision))}</a><span>${escapeHtml(revisionStatusLabel(revision.status))}${revision.isCurrent ? " · Current" : ""}</span></div><p>${escapeHtml(revision.changeSummary || "No change summary provided.")}</p><small>${revision.fileCount} file${revision.fileCount === 1 ? "" : "s"} · ${revision.issuanceCount ? `${revision.issuanceCount} issued` : "Not issued"} · ${escapeHtml(formatDate(revision.createdAt) || "—")}</small></li>`;
    return `<section class="document-history" aria-labelledby="history-title"><div class="document-section-heading"><h3 id="history-title">Revision history</h3><span>${revisions.length} historical revision${revisions.length === 1 ? "" : "s"}</span></div>${revisions.length === 1 ? `<ul class="document-history-cards is-single">${card(revisions[0])}</ul>` : `<div class="document-history-table"><table><caption class="sr-only">Published and superseded revisions</caption><thead><tr><th>Revision</th><th>Status</th><th>Change summary</th><th>Files</th><th>Published / created</th><th>Issued</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${revisions.map(row).join("")}</tbody></table></div><ul class="document-history-cards">${revisions.map(card).join("")}</ul>`}</section>`;
  }

  function detailItem(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`;
  }

  function details(data) {
    const record = data.record;
    return `<details class="document-details"><summary>Document details</summary><dl>${detailItem("Document type", recordTypeLabel(record.recordType))}${detailItem("Document number", record.recordNumber)}${detailItem("Discipline", record.discipline)}${detailItem("Description", record.description)}${record.source ? detailItem("Source", record.source) : ""}${detailItem("Created", formatDate(record.createdAt))}${detailItem("Updated", formatDate(record.updatedAt))}${record.archivedAt ? detailItem("Archived", formatDate(record.archivedAt)) : ""}${detailItem("Total files", String(data.totalFileCount))}</dl></details>`;
  }

  function loaded(data) {
    const record = data.record;
    const drafts = data.revisions.filter(
      (revision) => revision.status === "draft",
    );
    return `<a class="record-back-link" href="${documentsHref}" data-app-link>← Back to Document Register</a><header class="document-identity"><div><p class="record-detail-number">${escapeHtml(record.recordNumber || "Unnumbered document")}</p><h2 id="page-title" tabindex="-1">${escapeHtml(record.title)}</h2><p>${escapeHtml(recordTypeLabel(record.recordType))}${record.discipline ? ` · ${escapeHtml(record.discipline)}` : ""}${data.currentRevision ? ` · ${escapeHtml(revisionName(data.currentRevision))}` : ""}</p></div><div class="document-identity-status"><span class="status-badge status-${record.status === "active" ? "success" : "neutral"}">${escapeHtml(recordStatusLabel(record.status))}</span>${record.status === "active" && (data.capabilities.updateRecord || data.capabilities.archiveRecord) ? `<details class="document-options"><summary aria-label="Document options">Options</summary><div>${data.capabilities.updateRecord ? '<button type="button" data-edit-record>Edit document details</button>' : ""}${data.capabilities.archiveRecord ? '<button class="is-destructive" type="button" data-archive-record>Archive document</button>' : ""}</div></details>` : ""}</div></header>${record.status === "archived" ? `<div class="document-read-only"><strong>Archived document</strong><span>This document is read-only${record.archivedAt ? ` · Archived ${escapeHtml(formatDate(record.archivedAt))}` : ""}.</span></div>` : ""}${drafts.length && data.currentRevision ? `<p class="document-published-context">Published baseline: <a href="${revisionHref(data.currentRevision.id)}" data-app-link>${escapeHtml(revisionName(data.currentRevision))}</a></p>` : ""}${currentWork(data)}${history(data)}${details(data)}`;
  }

  function markup() {
    if (state.status === "loading")
      return '<div class="record-detail-skeleton" aria-busy="true" aria-label="Loading document"><span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span></div>';
    if (state.status === "missing")
      return `<div class="route-state route-not-found"><h2 id="page-title" tabindex="-1">Document not found</h2><p>The requested document is unavailable or you do not have access to it.</p><a href="${documentsHref}" data-app-link>Back to Document Register</a></div>`;
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
