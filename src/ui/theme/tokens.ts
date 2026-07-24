/*
 * Machine-readable registry of the BASE application semantic tokens declared in
 * tokens.css. The token-enforcement test asserts that every custom property a
 * component stylesheet references exists here, so a component cannot silently
 * introduce an ad-hoc `--app-*` value or a raw colour. Keep this list in sync
 * with tokens.css.
 */

export const APP_TOKENS = [
  // Surfaces
  "--app-workspace",
  "--app-surface",
  "--app-surface-sunken",
  "--app-surface-hover",
  "--app-surface-selected",
  // Borders
  "--app-border-subtle",
  "--app-border-strong",
  // Text
  "--app-text-primary",
  "--app-text-muted",
  "--app-text-inverse",
  "--app-text-disabled",
  // Accent
  "--app-accent",
  "--app-accent-strong",
  "--app-accent-soft",
  "--app-accent-contrast",
  // Focus
  "--app-focus-ring",
  "--app-focus-width",
  "--app-focus-offset",
  // Status
  "--app-success",
  "--app-success-soft",
  "--app-warning",
  "--app-warning-soft",
  "--app-danger",
  "--app-danger-soft",
  "--app-info",
  "--app-info-soft",
  "--app-neutral",
  "--app-neutral-soft",
  // Typography
  "--app-font-sans",
  "--app-font-mono",
  "--app-text-2xs",
  "--app-text-xs",
  "--app-text-sm",
  "--app-text-md",
  "--app-text-lg",
  "--app-text-xl",
  "--app-text-2xl",
  "--app-line-tight",
  "--app-line-normal",
  "--app-weight-regular",
  "--app-weight-medium",
  "--app-weight-semibold",
  "--app-weight-bold",
  // Geometry
  "--app-control-height",
  "--app-control-height-compact",
  "--app-touch-target",
  "--app-radius-sm",
  "--app-radius-md",
  "--app-radius-lg",
  "--app-radius-pill",
  "--app-border-width",
  // Spacing
  "--app-space-0",
  "--app-space-1",
  "--app-space-2",
  "--app-space-3",
  "--app-space-4",
  "--app-space-5",
  "--app-space-6",
  "--app-space-8",
  "--app-space-10",
  "--app-gutter",
  // Elevation
  "--app-scrim",
  "--app-shadow-panel",
  "--app-shadow-overlay",
  // Layering
  "--app-z-header",
  "--app-z-drawer",
  "--app-z-overlay",
  "--app-z-toast",
  // Motion
  "--app-motion-fast",
  "--app-motion-normal",
  "--app-ease",
] as const;

export type AppToken = (typeof APP_TOKENS)[number];

/**
 * Brand tokens supplied by public/brand-tokens.css. tokens.css reads these with
 * an inline fallback, so they are permitted references in component stylesheets.
 */
export const BRAND_TOKENS = [
  "--ink",
  "--accent",
  "--accent-dk",
  "--mono",
  "--field",
  "--divider",
  "--row",
  "--page-bg",
  "--hover",
  "--paper",
  "--sans",
  "--code",
] as const;
