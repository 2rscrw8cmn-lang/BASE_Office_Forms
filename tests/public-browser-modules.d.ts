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

interface BrowserView {
  mount(container: HTMLElement): void;
  reload(): Promise<void>;
  destroy(): void;
}

declare module "*rfis-view.js" {
  export function createRfisView(options: Record<string, unknown>): BrowserView;
}

declare module "*rfi-workspace-view.js" {
  export function createRfiWorkspaceView(
    options: Record<string, unknown>,
  ): BrowserView;
}

declare module "*rfi-tabulator-adapter.js" {
  interface TabulatorGrid {
    mount(host: unknown): Promise<void>;
    setRows(rows: unknown[]): Promise<void>;
    setCellState(id: string, field: string, state: unknown): void;
    focusCell(ref: unknown): void;
    editCell(ref: { id: string; field: string }): Promise<void>;
    destroy(): void;
    _getCellState(id: string, field: string): unknown;
    _handleCommit(cell: unknown): Promise<void>;
    _ensureTable(): Promise<unknown>;
    readonly table: unknown;
  }

  export const TABULATOR_GRID_MODE: string;
  export const TABULATOR_EDITABLE_FIELDS: Record<
    string,
    { label: string; type: string }
  >;
  export const TABULATOR_EDITABLE_ORDER: string[];
  export function readGridMode(search: string): string;
  export function isTabulatorMode(search: string): boolean;
  export function isRowEditable(row: unknown): boolean;
  export function normalizeCellValue(value: unknown): string | null;
  export function buildPatchPayload(
    field: string,
    value: unknown,
    lockVersion: unknown,
  ): Record<string, unknown>;
  export function validateField(field: string, value: unknown): string | null;
  export function buildColumnDefinitions(
    options: Record<string, unknown>,
  ): Array<Record<string, unknown>>;
  export function loadTabulator(doc?: unknown): Promise<unknown>;
  export function createRfiTabulatorGrid(
    options: Record<string, unknown>,
  ): TabulatorGrid;
}
