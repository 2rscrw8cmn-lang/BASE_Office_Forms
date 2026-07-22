(function (root) {
  "use strict";

  const EDIT_KEYS = "baseStudio.sharedEditKeys.v1";

  async function request(path, options) {
    options = options || {};
    const response = await fetch(`/api/${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) {
      const base = payload.error || `Shared library request failed (${response.status}).`;
      // The definition-validation endpoint returns the generic message above
      // plus a full validationErrors array -- surface the first concrete
      // issue so a failed save/publish isn't a dead end for the user.
      const issue = Array.isArray(payload.validationErrors) ? payload.validationErrors[0] : null;
      const detail = issue ? ` ${issue.path || ""} ${issue.message || ""}`.replace(/\s+/g, " ").trim() : "";
      throw new Error(detail ? `${base} ${detail}` : base);
    }
    return payload;
  }

  function keys() {
    try { return JSON.parse(localStorage.getItem(EDIT_KEYS) || "{}"); }
    catch (_) { return {}; }
  }

  function rememberEditKey(id, value) {
    if (!id || !value) return;
    const stored = keys();
    stored[id] = value;
    localStorage.setItem(EDIT_KEYS, JSON.stringify(stored));
  }

  function editKey(id) { return keys()[id] || ""; }

  function forgetEditKey(id) {
    if (!id) return;
    const stored = keys();
    delete stored[id];
    localStorage.setItem(EDIT_KEYS, JSON.stringify(stored));
  }

  async function listDocuments(filters) {
    const params = new URLSearchParams();
    if (filters && filters.folderId) params.set("folder", filters.folderId);
    if (filters && filters.kind) params.set("kind", filters.kind);
    return (await request(`documents${params.size ? `?${params}` : ""}`)).documents || [];
  }

  async function getDocument(id) {
    return (await request(`documents/${encodeURIComponent(id)}`)).document;
  }

  async function saveDocument(definition, options) {
    options = options || {};
    const id = options.id || "";
    const token = options.editToken || editKey(id);
    const payload = await request(id ? `documents/${encodeURIComponent(id)}` : "documents", {
      method: id ? "PUT" : "POST",
      headers: token ? { "X-Edit-Token": token } : {},
      body: JSON.stringify({ definition, folderId: options.folderId || null, version: options.version || null })
    });
    if (payload.editToken) rememberEditKey(payload.document.id, payload.editToken);
    return { document: payload.document, editToken: payload.editToken || token };
  }

  async function deleteDocument(id, token) {
    const result = await request(`documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Edit-Token": token || editKey(id) }
    });
    forgetEditKey(id);
    return result;
  }

  async function listFolders() { return (await request("folders")).folders || []; }

  async function createFolder(name, parentId) {
    return (await request("folders", { method: "POST", body: JSON.stringify({ name, parentId: parentId || null }) })).folder;
  }

  function viewUrl(id) {
    const url = new URL("viewer.html", location.href);
    url.searchParams.set("id", id);
    url.hash = "";
    return url.href;
  }

  function editUrl(id, token) {
    const url = new URL("builder.html", location.href);
    url.searchParams.set("id", id);
    url.hash = `key=${encodeURIComponent(token || editKey(id))}`;
    return url.href;
  }

  root.BASE_LIBRARY = { listDocuments, getDocument, saveDocument, deleteDocument, listFolders, createFolder, rememberEditKey, forgetEditKey, editKey, viewUrl, editUrl };
})(window);
