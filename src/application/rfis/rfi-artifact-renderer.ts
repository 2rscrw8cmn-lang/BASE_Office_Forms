import type { FrozenRfiRenderPayload } from "../../domain/rfis/official-issue";

export interface RenderedRfiArtifact {
  bytes: ArrayBuffer;
  mediaType: "application/pdf";
}

/**
 * Provider-neutral official artifact boundary. Implementations receive only a
 * fully frozen payload and must not fetch mutable project, contact, template,
 * or RFI state while rendering.
 */
export interface RfiArtifactRenderer {
  readonly rendererVersion: string;
  render(payload: FrozenRfiRenderPayload): Promise<RenderedRfiArtifact>;
}
