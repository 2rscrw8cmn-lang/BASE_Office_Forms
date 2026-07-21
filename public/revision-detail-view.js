import {
  escapeHtml,
  formatDate,
  recordTypeLabel,
  revisionName,
  revisionStatusLabel,
} from "./app-format.js";

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createRevisionDetailView({
  api,
  projectId,
  recordId,
  revisionId,
  navigate,
  announce,
  requestRender,
}) {
  let state = {
    status: "loading",
    data: null,
    error: null,
    uploading: false,
    publishing: false,
    uploadError: null,
    selectedFile: null,
  };
  let controller = null;
  let destroyed = false;
  let sequence = 0;
  const documentsHref = `/projects/${encodeURIComponent(projectId)}/records`;
  const documentHref = `/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}`;
  const fileHref = (fileId) =>
    `/api/v2/projects/${encodeURIComponent(projectId)}/records/${encodeURIComponent(recordId)}/revisions/${encodeURIComponent(revisionId)}/files/${encodeURIComponent(fileId)}/content`;

  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const requestId = ++sequence;
    state = {
      ...state,
      status: "loading",
      data: null,
      error: null,
      uploadError: null,
      selectedFile: null,
    };
    requestRender();
    try {
      const { data } = await api.getRevisionWorkspace(
        projectId,
        recordId,
        revisionId,
        { signal: controller.signal },
      );
      if (destroyed || requestId !== sequence) return;
      state = { ...state, status: "loaded", data, error: null };
      requestRender();
    } catch (error) {
      if (destroyed || requestId !== sequence || error?.aborted) return;
      state = {
        ...state,
        status: error?.status === 404 ? "missing" : "error",
        error,
      };
      announce?.(
        error?.status === 404
          ? "Revision not found."
          : "Revision could not be loaded.",
      );
      requestRender();
    }
  }

  function fileCard(file, primary = false) {
    return `<article class="document-file-card${primary ? " is-primary" : ""}"><div class="document-file-icon" aria-hidden="true"><svg class="app-icon" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V21H6z"></path><path d="M14 3.5V8h4M9 12h6M9 16h4"></path></svg></div><div class="document-file-copy"><strong>${escapeHtml(file.originalFilename)}</strong><span>${escapeHtml(file.mediaType)} · ${escapeHtml(formatBytes(file.byteSize))} · Uploaded ${escapeHtml(formatDate(file.uploadedAt) || "—")}</span></div><a class="secondary-button" href="${fileHref(file.id)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(file.originalFilename)}">View file</a></article>`;
  }

  function uploadMarkup(revision) {
    if (!revision.capabilities.uploadFile) return "";
    const selected = state.selectedFile;
    return `<form class="revision-upload" data-upload-form><div><label for="revision-file">${revision.files.length ? "Add another file" : "Upload document"}</label><p>Files are stored privately and attached to this draft revision.</p></div><input id="revision-file" name="file" type="file"${state.uploading ? " disabled" : ""}><button class="primary-button" type="submit"${state.uploading || !selected ? " disabled" : ""}>${state.uploading ? "Uploading…" : selected ? `Upload ${escapeHtml(selected.name)}` : "Upload file"}</button>${selected ? `<p class="revision-selected-file">Selected: ${escapeHtml(selected.name)} · ${escapeHtml(formatBytes(selected.size))}</p>` : ""}${state.uploadError ? `<p class="app-dialog-error" role="alert">${escapeHtml(state.uploadError.message || "The file could not be uploaded.")}${state.uploadError.requestId ? ` <span class="request-id">Request ID <code>${escapeHtml(state.uploadError.requestId)}</code></span>` : ""}</p>` : ""}</form>`;
  }

  function loaded(data) {
    const { record, revision } = data;
    const isDraft = revision.status === "draft";
    const isArchived = record.status === "archived";
    return `<nav class="document-breadcrumbs" aria-label="Breadcrumb"><a href="${documentsHref}" data-app-link>Documents</a><span aria-hidden="true">/</span><a href="${documentHref}" data-app-link>${escapeHtml(record.title)}</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(revisionName(revision))}</span></nav><header class="revision-identity"><div><p>${escapeHtml(record.recordNumber || "Unnumbered document")} · ${escapeHtml(recordTypeLabel(record.recordType))}</p><h2 id="page-title" tabindex="-1">${escapeHtml(revisionName(revision))}</h2><p>${escapeHtml(record.title)}</p></div><div class="revision-status-stack"><span class="status-badge status-${isDraft ? "attention" : revision.status === "published" ? "success" : "neutral"}">${escapeHtml(revisionStatusLabel(revision.status))}</span>${revision.isCurrent ? '<span class="document-current-note">Current published revision</span>' : ""}</div></header>${isArchived ? '<div class="document-read-only"><strong>Archived document</strong><span>This revision remains available but is read-only.</span></div>' : !isDraft ? '<div class="document-read-only"><strong>Read-only revision</strong><span>Published and superseded revisions cannot be changed from this workspace.</span></div>' : ""}<section class="revision-summary"><div><span>Change summary</span><p>${escapeHtml(revision.changeSummary || "No change summary provided.")}</p></div><div><span>Created</span><p>${escapeHtml(formatDate(revision.createdAt) || "—")}</p></div><div><span>Files</span><p>${revision.fileCount}</p></div><div><span>Issuance</span><p><span class="issuance-badge${revision.issuanceCount ? " is-issued" : ""}">${revision.issuanceCount ? `${revision.issuanceCount} issuance${revision.issuanceCount === 1 ? "" : "s"}` : "Not issued"}</span></p></div></section><section class="revision-document" aria-labelledby="revision-files-title"><div class="document-section-heading"><h3 id="revision-files-title">Revision files</h3>${revision.files.length ? `<span>${revision.files.length} file${revision.files.length === 1 ? "" : "s"}</span>` : ""}</div>${
      revision.files.length
        ? `<div class="document-files">${fileCard(revision.files[0], true)}${revision.files
            .slice(1)
            .map((file) => fileCard(file))
            .join("")}</div>`
        : `<div class="document-upload-empty"><div><strong>No files attached</strong><p>${isDraft && !isArchived ? "Upload the working document before publishing this revision." : "No file was attached to this revision."}</p></div></div>`
    }${uploadMarkup(revision)}${revision.capabilities.publishRevision && revision.files.length ? `<div class="revision-publish"><div><strong>Ready to publish?</strong><p>Publishing makes this revision the current read-only document.</p></div><button class="primary-button" type="button" data-publish${state.publishing ? ' disabled aria-busy="true"' : ""}>${state.publishing ? "Publishing…" : "Publish revision"}</button>${state.error && state.publishing === false ? `<p class="app-dialog-error" role="alert">${escapeHtml(state.error.message || "The revision could not be published.")}${state.error.requestId ? ` Request ID ${escapeHtml(state.error.requestId)}` : ""}</p>` : ""}</div>` : ""}</section>`;
  }

  function markup() {
    if (state.status === "loading")
      return '<div class="record-detail-skeleton" aria-busy="true" aria-label="Loading revision"><span class="skeleton-line skeleton-short"></span><span class="skeleton-line"></span><span class="skeleton-line skeleton-medium"></span></div>';
    if (state.status === "missing")
      return `<div class="route-state route-not-found"><h2 id="page-title" tabindex="-1">Revision not found</h2><p>The requested revision is unavailable or you do not have access to it.</p><a class="record-back-link" href="${documentHref}" data-app-link>← Back to document</a></div>`;
    if (state.status === "error")
      return `<div class="inline-error" role="alert"><h2 id="page-title" tabindex="-1">Revision could not be loaded</h2><p>${escapeHtml(state.error?.message || "Check your connection and try again.")}</p>${state.error?.requestId ? `<p class="request-id">Request ID <code>${escapeHtml(state.error.requestId)}</code></p>` : ""}<button class="secondary-button" type="button" data-revision-retry>Try again</button></div>`;
    return loaded(state.data);
  }

  async function upload() {
    if (!state.selectedFile || state.uploading || !state.data) return;
    if (!state.data.revision.capabilities.uploadFile) return;
    state = { ...state, uploading: true, uploadError: null };
    requestRender();
    announce?.("Uploading document file.");
    try {
      await api.uploadRevisionFile(
        projectId,
        recordId,
        revisionId,
        state.selectedFile,
      );
      state = { ...state, uploading: false, selectedFile: null };
      announce?.("Document file uploaded.");
      await reload();
    } catch (error) {
      state = { ...state, uploading: false, uploadError: error };
      announce?.("The document file could not be uploaded.");
      requestRender();
    }
  }

  async function publish() {
    if (state.publishing || !state.data) return;
    const revision = state.data.revision;
    if (!revision.capabilities.publishRevision || !revision.files.length)
      return;
    state = { ...state, publishing: true, error: null };
    requestRender();
    announce?.("Publishing revision.");
    try {
      await api.publishRevision(projectId, recordId, revisionId);
      state = { ...state, publishing: false };
      announce?.("Revision published.");
      await reload();
    } catch (error) {
      state = { ...state, publishing: false, error };
      announce?.("The revision could not be published.");
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
    container.innerHTML = `<section class="revision-detail-view document-workspace app-container-register">${markup()}</section>`;
    container.querySelectorAll("a[data-app-link]").forEach(bindLink);
    container
      .querySelector("[data-revision-retry]")
      ?.addEventListener("click", reload);
    const fileInput = container.querySelector("#revision-file");
    fileInput?.addEventListener("change", () => {
      state = {
        ...state,
        selectedFile: fileInput.files?.[0] ?? null,
        uploadError: null,
      };
      requestRender();
    });
    container
      .querySelector("[data-upload-form]")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        upload();
      });
    container
      .querySelector("[data-publish]")
      ?.addEventListener("click", publish);
  }

  function destroy() {
    destroyed = true;
    sequence += 1;
    controller?.abort();
  }

  return { mount, reload, destroy };
}
