declare module "*app-routing.js" {
  export interface AppRoute {
    id?: string;
    title?: string;
    surface?: string;
    projectTab?: string;
    redirectTo?: string;
  }

  export function canViewAdministration(role: string): boolean;
  export function isApplicationPath(pathname: string): boolean;
  export function resolveRoute(pathname: string): AppRoute | null;
}

declare module "*app-shell.js" {
  interface AppShellState {
    drawerOpen: boolean;
  }

  interface AppShell {
    ready: Promise<PromiseSettledResult<unknown>[]>;
    navigate(href: string): Promise<void>;
    openMobileNav(trigger?: Element | null): void;
    closeMobileNav(): void;
    getState(): AppShellState;
    destroy(): void;
  }

  export function createAppShell(options: {
    window: unknown;
    document: Document;
    fetch: typeof fetch;
  }): AppShell;
}

declare module "*app-format.js" {
  export function revisionName(revision: {
    revisionNumber?: number | null;
    revisionLabel?: string | null;
  }): string;
  export function fileTypeLabel(mediaType?: string | null): string;
}
