/*
 * Setup for BASE component tests. Component test files opt in with a
 * `// @vitest-environment happy-dom` docblock; this file registers the
 * jest-dom matchers, wires Testing Library auto-cleanup, and polyfills the few
 * browser APIs Radix primitives touch that the DOM environment does not provide
 * (matchMedia, ResizeObserver, pointer capture, scrollIntoView). Node-only unit
 * tests are unaffected — the polyfills are guarded to the DOM environment.
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

if (typeof globalThis.window !== "undefined") {
  const win = globalThis.window;

  if (typeof win.matchMedia !== "function") {
    win.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
  }

  if (typeof globalThis.ResizeObserver === "undefined") {
    class ResizeObserverStub {
      observe() {
        /* no-op */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    }
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  const elementProto = win.Element.prototype as unknown as Record<
    string,
    unknown
  >;
  if (typeof elementProto.hasPointerCapture !== "function") {
    elementProto.hasPointerCapture = () => false;
  }
  if (typeof elementProto.setPointerCapture !== "function") {
    elementProto.setPointerCapture = () => undefined;
  }
  if (typeof elementProto.releasePointerCapture !== "function") {
    elementProto.releasePointerCapture = () => undefined;
  }
  if (typeof elementProto.scrollIntoView !== "function") {
    elementProto.scrollIntoView = () => undefined;
  }
}
