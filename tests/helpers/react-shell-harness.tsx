/*
 * Shared test harness for the UI-4 React shell correction-pass suites
 * (same-route URL-history parity, project-context revalidation, and
 * compatibility-module load-failure handling). Not a test file itself (no
 * `.test.` in its name), so Vitest does not collect it directly. Every
 * consuming test file must still carry its own
 * `// @vitest-environment happy-dom` docblock -- the pragma is resolved per
 * test file, not inherited through an import.
 */
import { useEffect, useRef } from "react";
import { act, render } from "@testing-library/react";
import {
  BrowserRouter,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import {
  AppProviders,
  ShellRoutes,
  createQueryClient,
} from "../../src/ui/app/App";
import type { ShellRuntime } from "../../src/ui/app/types";

export interface FakeResponseInit {
  status?: number;
  requestId?: string;
}

export function jsonResponse(
  body: unknown,
  init: FakeResponseInit = {},
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.requestId) headers.set("x-request-id", init.requestId);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

export function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Throwing DOM lookup so tests never rely on non-null assertions. */
export function el(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`Expected to find ${selector}.`);
  return found;
}

export interface FetchConfig {
  session: () => Response;
  project?: (id: string) => Response;
}

export function installFetch(config: FetchConfig) {
  const calls: string[] = [];
  const fetchMock = (input: string | URL | Request) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes("/api/v2/session"))
      return Promise.resolve(config.session());
    const match = /\/api\/v2\/projects\/([^/?]+)$/.exec(url);
    if (match && config.project) {
      return Promise.resolve(config.project(decodeURIComponent(match[1])));
    }
    return Promise.resolve(jsonResponse({}, { status: 404 }));
  };
  globalThis.fetch = fetchMock;
  return { calls };
}

export const READY_SESSION = (role = "project_manager") =>
  jsonResponse({
    data: {
      organization: { name: "BASE Construction" },
      membership: { role },
    },
  });

export const READY_PROJECT = (id: string) =>
  jsonResponse({
    data: {
      id,
      name: "Riverside Tower",
      projectNumber: "24-001",
      status: "active",
    },
  });

function NavigationCapture({
  onReady,
}: {
  onReady: (navigate: NavigateFunction) => void;
}) {
  const navigate = useNavigate();
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    readyRef.current(navigate);
  }, [navigate]);
  return null;
}

/**
 * Renders the real shell (AppProviders + ShellRoutes) inside a BrowserRouter --
 * the same router the production app uses (App.tsx) -- and exposes
 * `goTo`/`back`/`forward` driven by React Router's own `navigate` function.
 *
 * A `MemoryRouter` is deliberately NOT used here: it keeps its own in-memory
 * location entirely decoupled from `window.location`/`window.history`, but the
 * legacy feature controllers under test (records-view.js, rfis-view.js) read
 * `window.location.search`/`hash` directly inside their own `mount()`. Only a
 * router that actually drives the real `window.history` -- as `BrowserRouter`
 * does, and as happy-dom's `history.pushState`/`back`/`forward` and native
 * `popstate` support -- lets those reads observe the navigations this harness
 * performs, matching what happens in the real browser.
 */
export function renderShellWithNavigation(
  initialPath: string,
  runtime: ShellRuntime,
) {
  // Seed the real window location before mounting: BrowserRouter reads
  // whatever window.location already is, unlike MemoryRouter's initialEntries.
  window.history.pushState({}, "", initialPath);
  let navigateFn: NavigateFunction | null = null;
  const utils = render(
    <AppProviders queryClient={createQueryClient()}>
      <BrowserRouter>
        <NavigationCapture
          onReady={(navigate) => {
            navigateFn = navigate;
          }}
        />
        <ShellRoutes runtime={runtime} />
      </BrowserRouter>
    </AppProviders>,
  );

  const requireNavigate = (): NavigateFunction => {
    if (!navigateFn) throw new Error("Navigation is not ready yet.");
    return navigateFn;
  };

  // A pre-typed `() => void` callback (rather than an inline arrow at the call
  // site) resolves react's `act` to its synchronous overload
  // (`act(callback: () => VoidOrUndefinedOnly): void`) unambiguously.
  //
  // NavigateFunction's call signature is typed `void | Promise<void>` (it
  // supports React Router's data-router mode), but the declarative
  // `<BrowserRouter>` used by this harness always resolves it synchronously;
  // the `void` operator marks that possible promise as deliberately ignored
  // rather than silently dropping a real floating promise.
  const runSync = (task: () => void): void => {
    act(task);
  };

  return {
    ...utils,
    goTo: (to: string) => {
      runSync(() => {
        void requireNavigate()(to);
      });
    },
    back: () => {
      runSync(() => {
        void requireNavigate()(-1);
      });
    },
    forward: () => {
      runSync(() => {
        void requireNavigate()(1);
      });
    },
  };
}
