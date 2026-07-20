import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppShell } from "../../public/app-shell.js";

type Role =
  | "org_admin"
  | "document_control_admin"
  | "project_manager"
  | "contributor"
  | "viewer";

const shells: Array<{ destroy(): void }> = [];

afterEach(() => {
  shells.splice(0).forEach((shell) => {
    shell.destroy();
  });
});

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ data, meta: { requestId: "request-1" } }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function mount(
  pathname: string,
  role: Role = "viewer",
  options: { matchMedia?: (query: string) => unknown } = {},
) {
  const window = new Window({ url: `https://base.test${pathname}` });
  const document = window.document as unknown as Document;
  document.body.innerHTML = '<div id="app"></div>';
  const fetch = vi.fn((input: string | URL | Request) => {
    const value =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = new URL(value, "https://base.test").pathname;
    if (path === "/api/v2/session") {
      return Promise.resolve(
        response({
          user: { id: "user-1" },
          organization: { id: "org-1", name: "BASE Construction" },
          membership: { role },
          projectPermissions: [],
        }),
      );
    }
    if (path === "/api/v2/projects/project-1") {
      return Promise.resolve(
        response({
          id: "project-1",
          projectNumber: "P-001",
          name: "Operations Center",
          status: "active",
        }),
      );
    }
    return Promise.resolve(response(null, 404));
  });
  const shell = createAppShell({
    window,
    document,
    fetch,
    ...(options.matchMedia ? { matchMedia: options.matchMedia } : {}),
  });
  shells.push(shell);
  await shell.ready;
  return { window, document, shell, fetch };
}

type FakeMediaQueryList = {
  matches: boolean;
  media: string;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (
    type: string,
    listener: (event: unknown) => void,
  ) => void;
  emitChange: () => void;
};

function createFakeMediaQuery(initialMatches: boolean): {
  matchMedia: (query: string) => FakeMediaQueryList;
  mediaQuery: FakeMediaQueryList;
} {
  const listeners = new Set<(event: unknown) => void>();
  const mediaQuery: FakeMediaQueryList = {
    matches: initialMatches,
    media: "(max-width: 620px)",
    addEventListener(type, listener) {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "change") listeners.delete(listener);
    },
    emitChange() {
      listeners.forEach((listener) => {
        listener({ matches: this.matches, media: this.media });
      });
    },
  };
  return { matchMedia: () => mediaQuery, mediaQuery };
}

describe("application shell", () => {
  it("renders global navigation and both Tools destinations", async () => {
    const { document } = await mount("/dashboard");
    const labels = [
      ...document.querySelectorAll(".app-navigation-desktop a"),
    ].map((link) => link.textContent.trim());
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "Projects",
        "Tools overview",
        "Forms",
        "Document Library",
      ]),
    );
    expect(
      document.querySelector(
        '.app-navigation-desktop a[href="/dashboard"][aria-current="page"]',
      ),
    ).not.toBeNull();
  });

  it("renders project context and tabs for a direct nested route", async () => {
    const { document } = await mount(
      "/projects/project-1/records/record-1/revisions/revision-1",
    );
    expect(
      document.querySelector(".project-context-header h1")?.textContent,
    ).toBe("Operations Center");
    expect(document.querySelectorAll(".project-tabs a")).toHaveLength(5);
    expect(
      document.querySelector('.project-tabs a[aria-current="page"]')
        ?.textContent,
    ).toBe("Records");
    expect(document.querySelector("#page-title")?.textContent).toBe(
      "Revision detail",
    );
  });

  it("keeps issuance details on the Issuances tab", async () => {
    const { document } = await mount(
      "/projects/project-1/issuances/issuance-1",
    );
    expect(
      document.querySelector('.project-tabs a[aria-current="page"]')
        ?.textContent,
    ).toBe("Issuances");
  });

  it("shows Administration only to organization administrators", async () => {
    const admin = await mount("/dashboard", "org_admin");
    expect(
      admin.document.querySelector('.app-navigation-desktop a[href="/admin"]'),
    ).not.toBeNull();

    const contributor = await mount("/dashboard", "contributor");
    expect(
      contributor.document.querySelector(
        '.app-navigation-desktop a[href="/admin"]',
      ),
    ).toBeNull();
  });

  it("does not reveal the Administration route to unauthorized roles", async () => {
    const { document } = await mount("/admin", "project_manager");
    expect(document.querySelector("#not-found-title")?.textContent).toBe(
      "Page not found",
    );
    expect(document.body.textContent).not.toContain(
      "Organization administration will be delivered",
    );
  });

  it("opens and closes mobile navigation, restoring focus on Escape", async () => {
    const { window, document, shell } = await mount("/dashboard");
    const trigger = document.querySelector<HTMLButtonElement>(
      ".mobile-menu-button",
    );
    trigger?.focus();
    shell.openMobileNav(trigger);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.querySelector(".mobile-nav-layer")?.hasAttribute("hidden"),
    ).toBe(false);

    const drawerItems = [
      ...document.querySelectorAll<HTMLElement>(
        ".mobile-nav-drawer a[href], .mobile-nav-drawer button:not([disabled])",
      ),
    ];
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }) as unknown as Event,
    );
    expect(document.activeElement).toBe(drawerItems.at(-1));
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
      }) as unknown as Event,
    );
    expect(document.activeElement).toBe(drawerItems[0]);

    document.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      }) as unknown as Event,
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes mobile navigation after route selection", async () => {
    const { window, document, shell } = await mount("/dashboard");
    shell.openMobileNav(
      document.querySelector<HTMLButtonElement>(".mobile-menu-button"),
    );
    document
      .querySelector<HTMLAnchorElement>(
        '.app-navigation-mobile a[href="/tools/forms"]',
      )
      ?.click();
    await Promise.resolve();
    expect(shell.getState().drawerOpen).toBe(false);
    expect(window.location.pathname).toBe("/tools/forms");
  });

  it("restores the interactive desktop shell when the viewport leaves mobile mode", async () => {
    const { matchMedia, mediaQuery } = createFakeMediaQuery(true);
    const { document, shell } = await mount("/dashboard", "viewer", {
      matchMedia,
    });
    const trigger = document.querySelector<HTMLButtonElement>(
      ".mobile-menu-button",
    );
    trigger?.focus();
    shell.openMobileNav(trigger);

    const main = document.querySelector<HTMLElement>(".app-main");
    const sidebar = document.querySelector<HTMLElement>(".app-sidebar");
    const drawer = document.querySelector<HTMLElement>(".mobile-nav-drawer");
    expect(shell.getState().drawerOpen).toBe(true);
    expect(main?.inert).toBe(true);
    expect(sidebar?.inert).toBe(true);

    // Cross above the mobile breakpoint while the drawer is open.
    mediaQuery.matches = false;
    mediaQuery.emitChange();

    expect(shell.getState().drawerOpen).toBe(false);
    expect(main?.inert).toBe(false);
    expect(sidebar?.inert).toBe(false);
    expect(document.body.classList.contains("mobile-nav-open")).toBe(false);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.getAttribute("aria-hidden")).toBe("true");
    // Focus must not be restored to the now-hidden mobile trigger.
    expect(document.activeElement).not.toBe(trigger);
  });

  it("renders Not Found for an unknown route", async () => {
    const { document } = await mount("/unknown-route");
    expect(document.querySelector("#not-found-title")?.textContent).toBe(
      "Page not found",
    );
  });

  it("keeps the existing Forms and Document Library entries accessible", async () => {
    const forms = await mount("/tools/forms");
    expect(
      forms.document.querySelector<HTMLAnchorElement>(
        'a[href="/builder.html?new=form"]',
      )?.textContent,
    ).toContain("Open Document Studio");

    const library = await mount("/tools/library");
    expect(
      library.document.querySelector<HTMLAnchorElement>('a[href="/library"]')
        ?.textContent,
    ).toContain("Open Document Library");
  });
});
