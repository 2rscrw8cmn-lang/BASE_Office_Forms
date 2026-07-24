/*
 * Compatibility mount for feature screens that have not yet been migrated to
 * React. It loads the existing browser controller (public/*-view.js) through
 * the injected runtime and drives it with the same contract the legacy shell
 * used: create → reload → mount into the container, with `requestRender`
 * re-mounting into the stable React-owned node. The controller keeps ownership
 * of its own DOM, data fetching, and interaction, so no feature workflow is
 * redesigned here.
 *
 * The component is keyed by the feature descriptor's stable key by its parent,
 * so a change of route (or of project/record/revision/rfi identity) fully
 * tears the old controller down and creates a new one — matching the legacy
 * shell's per-descriptor controller lifecycle.
 *
 * Same-route URL-history parity: some legacy controllers (records-view.js,
 * rfis-view.js) store filter/sort state through window.history.pushState /
 * replaceState issued directly (bypassing the router) and reread that state
 * from window.location.search inside their own mount() function — see
 * rfis-view.js's readFiltersFromUrl(). A query/hash-only change reaching us
 * through React Router (a genuine app navigation, or browser Back/Forward)
 * therefore needs the SAME controller remounted into the SAME container so it
 * rereads that URL state, without recreating the controller (no new factory
 * call) and without re-triggering its data reload. `locationKey` (supplied by
 * the parent from useLocation()) is the trigger for that remount; it is
 * intentionally a separate concern from the descriptor-key-driven create/
 * destroy lifecycle above.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useShell } from "./ShellContext";
import type { FeatureController } from "./types";
import type { FeatureDescriptor } from "./routing";

type LoadState = "loading" | "ready" | "error";

export function LegacyFeatureMount({
  descriptor,
  locationKey,
}: {
  descriptor: FeatureDescriptor;
  locationKey: string;
}) {
  const shell = useShell();
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FeatureController | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadNonce, setReloadNonce] = useState(0);

  const requestRender = useCallback(() => {
    const container = containerRef.current;
    if (!container || !controllerRef.current) return;
    controllerRef.current.mount(container);
    shell.requestHeadingFocus();
  }, [shell]);

  useEffect(() => {
    const active = { current: true };
    setLoadState("loading");

    void (async () => {
      let api;
      let factory;
      try {
        [api, factory] = await Promise.all([
          shell.runtime.getApiClient(),
          shell.runtime.loadFeatureFactory(descriptor.kind),
        ]);
      } catch {
        // getApiClient/loadFeatureFactory failed (e.g. a transient import
        // failure). Show the shared error+retry surface instead of leaving an
        // empty feature area; no controller exists yet, so there is nothing to
        // tear down.
        if (!active.current) return;
        setLoadState("error");
        return;
      }
      if (!active.current) return;

      const controller = factory({
        api,
        navigate: shell.navigate,
        announce: shell.announce,
        requestRender,
        getSession: shell.getSession,
        projectId: descriptor.projectId,
        recordId: descriptor.recordId,
        revisionId: descriptor.revisionId,
        rfiId: descriptor.rfiId,
      });
      controllerRef.current = controller;
      setLoadState("ready");
      // The controller's reload() sets its loading state and calls
      // requestRender(), which performs the first mount into the container.
      // Every current legacy controller catches its own load errors
      // internally and never rejects (see e.g. rfis-view.js's reload(), which
      // wraps its body in try/catch and always resolves through its own error
      // state + requestRender()); this catch is a documented, deliberate
      // defensive guard against an unhandled rejection if a controller ever
      // breaks that contract, not a UI path of its own.
      if (controller.reload) {
        controller.reload()?.catch(() => {
          /* deliberately delegated: see comment above */
        });
      } else {
        requestRender();
      }
    })();

    return () => {
      active.current = false;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
    // reloadNonce is a manual retry trigger only (bumped by handleRetry); it
    // intentionally reruns this exact creation effect.
  }, [descriptor.key, shell, requestRender, reloadNonce]);

  // Remount the existing controller (no recreate, no reload) whenever
  // locationKey changes while this component instance persists (i.e. the
  // feature descriptor did not change). The ref below tracks the location this
  // controller was last created/mounted for, so the very first location a
  // freshly created controller sees is never treated as a "change" -- the
  // creation effect above already performs that first mount.
  const lastMountedLocationRef = useRef(locationKey);
  useEffect(() => {
    if (lastMountedLocationRef.current === locationKey) return;
    lastMountedLocationRef.current = locationKey;
    const container = containerRef.current;
    if (container && controllerRef.current) {
      controllerRef.current.mount(container);
      shell.requestHeadingFocus();
    }
  }, [locationKey, shell]);

  useEffect(() => {
    lastMountedLocationRef.current = locationKey;
    // Only descriptor.key resets which location this controller "started" at;
    // locationKey itself is deliberately not a dependency here (that is the
    // effect above's job) -- this effect must not rerun just because the
    // location changed.
  }, [descriptor.key]);

  const handleRetry = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  if (loadState === "error") {
    return (
      <section
        className="route-state route-error"
        aria-labelledby="feature-load-error-title"
        role="alert"
      >
        <p className="app-eyebrow">Unable to continue</p>
        <h2 id="feature-load-error-title" tabIndex={-1}>
          This section could not be loaded
        </h2>
        <p>No changes were made. Check your connection and try again.</p>
        <div className="state-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={handleRetry}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <div
      className="feature-view"
      data-feature={descriptor.kind}
      aria-busy={loadState === "loading"}
      ref={containerRef}
    />
  );
}
