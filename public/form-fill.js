/* BASE form-fill state: capture, restore, and reset answers for interactive
   forms rendered by engine.js, keyed safely per form (including forms nested
   inside a package) and persisted to localStorage. */
(function (root) {
  "use strict";

  const STORAGE_PREFIX = "baseFormFill:";

  function cssEscape(value) {
    if (root.CSS && typeof root.CSS.escape === "function") return root.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, match => `\\${match}`);
  }

  function fieldName(prefix, field) {
    return `${prefix || ""}${field.id}`;
  }

  function readField(container, prefix, field) {
    const name = cssEscape(fieldName(prefix, field));
    if (field.type === "text") {
      const element = container.querySelector(`[name="${name}"]`);
      return element ? element.value : "";
    }
    if (field.type === "choose_one") {
      const element = container.querySelector(`[name="${name}"]:checked`);
      return element ? element.value : "";
    }
    return [...container.querySelectorAll(`[name="${name}"]:checked`)].map(element => element.value);
  }

  function writeField(container, prefix, field, value) {
    const name = cssEscape(fieldName(prefix, field));
    if (field.type === "text") {
      const element = container.querySelector(`[name="${name}"]`);
      if (element) element.value = value == null ? "" : value;
      return;
    }
    const wanted = Array.isArray(value) ? value : value == null ? [] : [value];
    container.querySelectorAll(`[name="${name}"]`).forEach(element => {
      element.checked = wanted.includes(element.value);
    });
  }

  function isEmptyValue(value) {
    return Array.isArray(value) ? value.length === 0 : value == null || value === "";
  }

  // A lone top-level form has one target with an empty prefix; anything else
  // (a package, or a package with no fillable forms) uses the documents
  // shape so callers can tell the two apart from the JSON alone.
  function isSingleForm(targets) {
    return targets.length === 1 && targets[0].prefix === "";
  }

  function collect(container, definition, targets) {
    targets = targets || root.BASE.formFillTargets(definition);
    const documents = targets.map(({ prefix, form }) => ({
      no: form.no || "",
      title: form.title || "",
      answers: Object.fromEntries(
        form._schema.map(field => [field.id, readField(container, prefix, field)]),
      ),
    }));
    if (isSingleForm(targets)) return { form: documents[0].no, answers: documents[0].answers };
    return { package: (definition && definition.no) || "", documents };
  }

  function apply(container, definition, data, targets) {
    if (!data) return;
    targets = targets || root.BASE.formFillTargets(definition);
    if (isSingleForm(targets)) {
      const answers = data.answers || data;
      targets[0].form._schema.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(answers, field.id)) {
          writeField(container, "", field, answers[field.id]);
        }
      });
      return;
    }
    const byNumber = new Map((data.documents || []).map(doc => [doc.no, doc]));
    targets.forEach(({ prefix, form }, index) => {
      const source = byNumber.get(form.no) || (data.documents || [])[index];
      if (!source) return;
      form._schema.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(source.answers || {}, field.id)) {
          writeField(container, prefix, field, source.answers[field.id]);
        }
      });
    });
  }

  function reset(container, definition, targets) {
    targets = targets || root.BASE.formFillTargets(definition);
    targets.forEach(({ prefix, form }) => {
      form._schema.forEach(field => writeField(container, prefix, field, field.type === "text" ? "" : []));
    });
  }

  function isEmpty(container, definition, targets) {
    const data = collect(container, definition, targets);
    const documents = data.documents || [data];
    return documents.every(doc => Object.values(doc.answers || {}).every(isEmptyValue));
  }

  function storageKey(key) {
    return `${STORAGE_PREFIX}${key}`;
  }

  function loadStored(key) {
    try {
      const raw = root.localStorage.getItem(storageKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveStored(key, data) {
    try {
      root.localStorage.setItem(storageKey(key), JSON.stringify(data));
    } catch (_) {
      // Storage unavailable (private browsing, quota) -- fill still works,
      // it just won't survive a reload.
    }
  }

  function clearStored(key) {
    try {
      root.localStorage.removeItem(storageKey(key));
    } catch (_) {
      // ignore
    }
  }

  // Wires a rendered container to localStorage under `key`: restores any
  // previously saved answers immediately, then persists on every change.
  // Call `detach()` before re-rendering a different definition into the
  // same container so stale listeners don't write over the new form's key.
  function attach(container, definition, key) {
    const targets = root.BASE.formFillTargets(definition);
    const restored = loadStored(key);
    if (restored) apply(container, definition, restored, targets);
    const onChange = () => saveStored(key, collect(container, definition, targets));
    container.addEventListener("input", onChange);
    container.addEventListener("change", onChange);
    return {
      targets,
      flush: () => {
        const data = collect(container, definition, targets);
        saveStored(key, data);
        return data;
      },
      reset: () => {
        reset(container, definition, targets);
        clearStored(key);
      },
      isEmpty: () => isEmpty(container, definition, targets),
      detach: () => {
        container.removeEventListener("input", onChange);
        container.removeEventListener("change", onChange);
      },
    };
  }

  root.BASE_FILL = { collect, apply, reset, isEmpty, attach, clearStored };
})(window);
