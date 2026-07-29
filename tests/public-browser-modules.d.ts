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
  // Presentation vocabulary the UI-7 workspaces port rather than import; the
  // parity suite compares the ported maps against these originals.
  export function describeActivity(action: string): string;
  export function actorLabel(event: {
    actorType: string;
    actorDisplayName?: string | null;
  }): string;
  export function rfiActivityDetail(event: {
    changedFields?: string[];
    role?: string | null;
  }): string;
  export function rfiAttachmentRoleLabel(role: string): string;
  export function rfiFieldLabel(field: string): string;
  export function rfiNumberLabel(rfiNumber?: string | null): string;
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

declare module "*rfi-preview-template-reconciliation.mjs" {
  export const previewTemplateIds: { stale: string; canonical: string };
  export function planPreviewTemplateReconciliation(input: {
    versions: { id: string; status: string; definition_json: string }[];
    records: Record<string, unknown>[];
  }): {
    canonicalVersionId: string;
    publishCanonicalVersion: boolean;
    retireVersionId: string | null;
    promoteCanonicalVersion: boolean;
    rebindRecordIds: string[];
  };
}

declare module "*rfi-production-template-reconciliation.mjs" {
  export const productionReconciliation: {
    database: string;
    failedRfiId: string;
    failedRequestId: string;
    affectedVersionId: string;
  };
  export function expectedPreFieldIdDefinition(): Record<string, unknown>;
  export function structuralDifferences(
    actual: unknown,
    expected: unknown,
  ): Array<{ path: string; actual: unknown; expected: unknown }>;
  export function isEligibleProductionRfi(
    record: Record<string, unknown>,
  ): boolean;
  export function planProductionTemplateReconciliation(input: {
    organizationId: string;
    templateId: string;
    sequence: { last_number: number };
    versions: Array<Record<string, unknown>>;
    records: Array<Record<string, unknown>>;
  }): Record<string, unknown>;
  export function planFingerprint(plan: Record<string, unknown>): string;
  export function applyProductionTemplateReconciliation(input: {
    query(command: string): Promise<Array<Record<string, unknown>>>;
    execute(command: string): Promise<void>;
    sql(value: string): string;
    actorUserId: string;
    reviewedPlanFingerprint: string;
  }): Promise<Record<string, unknown>>;
}
