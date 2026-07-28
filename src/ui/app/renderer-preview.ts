export interface RendererRuntime {
  render(definition: unknown, options?: { fill?: boolean }): string;
}

export interface RendererPreviewOptions {
  /**
   * Render the definition's field controls so bound values can be placed into
   * them. A filled preview is still read-only: the caller disables every control
   * before display. Defaults to false — a structural preview with no controls.
   */
  fill?: boolean;
}

export interface RendererPreviewAdapter {
  render(definition: unknown, options?: RendererPreviewOptions): string;
  mount(
    host: HTMLElement,
    definition: unknown,
    options?: RendererPreviewOptions,
  ): void;
}

/**
 * The application may host a controlled-document preview, but it delegates
 * rendering to the existing renderer runtime. React owns the host lifecycle;
 * the renderer remains the authority for document HTML and layout. The
 * application never reinterprets a definition or builds a second document
 * styling system.
 */
export function createRendererPreviewAdapter(
  runtime: RendererRuntime | null | undefined,
): RendererPreviewAdapter {
  if (!runtime || typeof runtime.render !== "function") {
    throw new Error("A controlled renderer runtime is required.");
  }

  return {
    render(definition, options) {
      return runtime.render(definition, { fill: options?.fill === true });
    },
    mount(host, definition, options) {
      host.replaceChildren();
      host.innerHTML = runtime.render(definition, {
        fill: options?.fill === true,
      });
    },
  };
}
