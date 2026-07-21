(function (root) {
  "use strict";

  async function request(path, options) {
    options = options || {};
    const response = await fetch(`/api/v2/templates${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error((payload.error && payload.error.message) || `Template request failed (${response.status}).`);
    return payload.data;
  }

  async function getTemplate(key) {
    return request(`/${encodeURIComponent(key)}`);
  }

  async function publishTemplate(key, options) {
    return request(`/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ name: options.name, kind: options.kind, definition: options.definition })
    });
  }

  root.BASE_TEMPLATES = { getTemplate, publishTemplate };
})(window);
