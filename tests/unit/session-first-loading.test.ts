import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

// These tests pin the session-first contract: the shell resolves the session
// before it requests any data-backed feature (Dashboard, Projects, Project
// Overview) and before it loads a project context header. A failed session is
// surfaced with its safe API message, code, and request ID, and a successful
// retry then loads whatever the current route needs.

const shells: Array<{ destroy(): void }> = [];

afterEach(() => {
  shells.splice(0).forEach((shell) => {
    shell.destroy();
  });
});

function json(payload: unknown, status = 200, requestId = "req-test") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
  });
}

function ok(data: unknown, requestId = "req-ok") {
  return json({ data, meta: { requestId } }, 200, requestId);
}

function sessionError(status: number, code: string, requestId: string) {
  return json(
    {
      error: { code, message: `Session failed: ${code}.`, requestId },
    },
    status,
    requestId,
  );
}

const sessionData = {
  user: { id: "user-1" },
  organization: { id: "org-1", name: "BASE Construction" },
  membership: { role: "org_admin" },
  projectPermissions: [],
};

const dashboardPayload = {
  summary: {
    accessibleProjectCount: 1,
    draftRevisionCount: 0,
    readyToIssueCount: 0,
    activeRfiCount: 0,
  },
  draftRevisions: [],
  readyToIssue: [],
  activeRfis: [],
  recentFiles: [],
  recentIssuances: [],
};

interface Harness {
  window: Window;
  document: Document;
  shell: ReturnType<typeof createAppShell>;
  fetch: ReturnType<typeof vi.fn>;
  calls: string[];
  setSession: (responder: () => Promise<Response>) => void;
}

function mount(
  path: string,
  sessionResponder: () => Promise<Response>,
): Harness {
  const window = new Window({ url: `https://base.test${path}` });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';
  const calls: string[] = [];
  let responder = sessionResponder;

  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const value =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const pathname = new URL(value, "https://base.test").pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${pathname}`);
    if (pathname === "/api/v2/session") return responder();
    if (pathname === "/api/v2/dashboard")
      return Promise.resolve(ok(dashboardPayload));
    if (/^\/api\/v2\/projects\/[^/]+\/overview$/.test(pathname))
      return Promise.resolve(ok({ project: {}, counts: {}, attention: {} }));
    if (/^\/api\/v2\/projects\/[^/]+$/.test(pathname))
      return Promise.resolve(
        ok({ id: "proj-1", projectNumber: "P-1", name: "P", status: "active" }),
      );
    if (pathname === "/api/v2/projects") return Promise.resolve(ok([]));
    return Promise.resolve(json({ error: { code: "X", message: "x" } }, 404));
  });

  const shell = createAppShell({ window, document, fetch });
  shells.push(shell);
  return {
    window,
    document,
    shell,
    fetch,
    calls,
    setSession: (next) => {
      responder = next;
    },
  };
}

async function waitFor(assertion: () => void, tries = 40) {
  let lastError: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

function featureRequestCount(calls: string[]): number {
  return calls.filter(
    (call) =>
      call.includes("/api/v2/dashboard") ||
      call.includes("/overview") ||
      call === "GET /api/v2/projects" ||
      /^GET \/api\/v2\/projects\/[^/]+$/.test(call),
  ).length;
}

describe("session-first feature loading", () => {
  it("surfaces a 503 AUTHENTICATION_UNAVAILABLE session error without loading the dashboard", async () => {
    const harness = mount("/dashboard", () =>
      Promise.resolve(
        sessionError(503, "AUTHENTICATION_UNAVAILABLE", "req-503"),
      ),
    );
    await harness.shell.ready;
    await waitFor(() => {
      expect(harness.document.querySelector(".route-error")).not.toBeNull();
    });
    const text =
      harness.document.querySelector(".route-error")?.textContent ?? "";
    expect(text).toContain("Session unavailable");
    expect(text).toContain("AUTHENTICATION_UNAVAILABLE");
    expect(text).toContain("req-503");
    expect(harness.document.querySelector(".dashboard-view")).toBeNull();
    expect(harness.calls).not.toContain("GET /api/v2/dashboard");
  });

  it("surfaces a 401 AUTHENTICATION_REQUIRED session error and makes no feature request", async () => {
    const harness = mount("/projects", () =>
      Promise.resolve(sessionError(401, "AUTHENTICATION_REQUIRED", "req-401")),
    );
    await harness.shell.ready;
    await waitFor(() => {
      expect(harness.document.querySelector(".route-error")).not.toBeNull();
    });
    const text =
      harness.document.querySelector(".route-error")?.textContent ?? "";
    expect(text).toContain("AUTHENTICATION_REQUIRED");
    expect(text).toContain("req-401");
    expect(featureRequestCount(harness.calls)).toBe(0);
  });

  it("surfaces a 403 membership/session failure on a project route without loading the project", async () => {
    const harness = mount("/projects/proj-1/overview", () =>
      Promise.resolve(sessionError(403, "MEMBERSHIP_REQUIRED", "req-403")),
    );
    await harness.shell.ready;
    await waitFor(() => {
      expect(harness.document.querySelector(".route-error")).not.toBeNull();
    });
    const text =
      harness.document.querySelector(".route-error")?.textContent ?? "";
    expect(text).toContain("MEMBERSHIP_REQUIRED");
    expect(text).toContain("req-403");
    expect(
      harness.document.querySelector(".project-context-header"),
    ).toBeNull();
    expect(featureRequestCount(harness.calls)).toBe(0);
  });

  it("loads the current feature after a failed session is retried successfully", async () => {
    let attempts = 0;
    const harness = mount("/dashboard", () => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? sessionError(503, "AUTHENTICATION_UNAVAILABLE", "req-1")
          : ok(sessionData),
      );
    });
    await harness.shell.ready;
    await waitFor(() => {
      expect(
        harness.document.querySelector("[data-retry='session']"),
      ).not.toBeNull();
    });
    // Nothing data-backed ran while the session was failed.
    expect(harness.calls).not.toContain("GET /api/v2/dashboard");

    harness.document
      .querySelector<HTMLButtonElement>("[data-retry='session']")
      ?.click();

    await waitFor(() => {
      expect(
        harness.document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });
    expect(harness.calls).toContain("GET /api/v2/dashboard");
  });

  it("issues no feature request until the session has resolved", async () => {
    let resolveSession: (response: Response) => void = () => {};
    const harness = mount(
      "/dashboard",
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );

    // Let the boot render settle while the session request is still pending.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.calls).toContain("GET /api/v2/session");
    expect(featureRequestCount(harness.calls)).toBe(0);
    expect(harness.document.querySelector(".dashboard-view")).toBeNull();
    expect(harness.document.querySelector(".route-loading")).not.toBeNull();

    resolveSession(ok(sessionData));
    await harness.shell.ready;
    await waitFor(() => {
      expect(
        harness.document.querySelector(".dashboard-view .summary-strip"),
      ).not.toBeNull();
    });
    expect(harness.calls).toContain("GET /api/v2/dashboard");
  });
});
