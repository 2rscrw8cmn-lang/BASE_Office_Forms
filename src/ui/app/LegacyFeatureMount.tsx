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
 */

import { useEffect, useRef } from "react";
import { useShell } from "./ShellContext";
import type { FeatureController } from "./types";
import type { FeatureDescriptor } from "./routing";

export function LegacyFeatureMount({
  descriptor,
}: {
  descriptor: FeatureDescriptor;
}) {
  const shell = useShell();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A holder object (rather than a captured `let`) so the cleanup's mutation
    // is visible to the async body's guard without the analyzer treating it as
    // a constant.
    const active = { current: true };
    let controller: FeatureController | null = null;

    const requestRender = () => {
      const container = containerRef.current;
      if (!container || !controller) return;
      controller.mount(container);
      shell.requestHeadingFocus();
    };

    void (async () => {
      const [api, factory] = await Promise.all([
        shell.runtime.getApiClient(),
        shell.runtime.loadFeatureFactory(descriptor.kind),
      ]);
      if (!active.current) return;
      controller = factory({
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
      // The controller's reload() sets its loading state and calls
      // requestRender(), which performs the first mount into the container.
      if (controller.reload) {
        void controller.reload();
      } else {
        requestRender();
      }
    })();

    return () => {
      active.current = false;
      controller?.destroy();
      controller = null;
    };
  }, [descriptor.key, shell]);

  return (
    <div
      className="feature-view"
      data-feature={descriptor.kind}
      ref={containerRef}
    />
  );
}
