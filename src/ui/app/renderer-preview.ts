export interface RendererRuntime {
  render(definition: unknown, options?: { fill?: boolean }): string;
}

export interface RendererPreviewAdapter {
  render(definition: unknown): string;
  mount(host: HTMLElement, definition: unknown): void;
}

/**
 * The application may host a controlled-document preview, but it delegates
 * rendering to the existing renderer runtime. React owns the host lifecycle;
 * the renderer remains the authority for document HTML and layout.
 */
export function createRendererPreviewAdapter(
  runtime: RendererRuntime | null | undefined,
): RendererPreviewAdapter {
  if (!runtime || typeof runtime.render !== "function") {
    throw new Error("A controlled renderer runtime is required.");
  }

  return {
    render(definition) {
      return runtime.render(definition, { fill: false });
    },
    mount(host, definition) {
      host.replaceChildren();
      host.innerHTML = runtime.render(definition, { fill: false });
    },
  };
}
