/*
 * The shell's inline navigation line-icon family, retained from the legacy
 * shell for visual parity (styled by `.app-icon` in public/app-shell.css). This
 * is the global-navigation chrome only; migrated feature components use the
 * Lucide-backed `Icon` component per the UI foundation.
 */

const ICON_PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7h7l2 2h9v11H3z" />
      <path d="M3 7V5h7l2 2" />
    </>
  ),
  form: (
    <>
      <path d="M6 3.5h8l4 4V21H6z" />
      <path d="M14 3.5V8h4M9 12h6M9 16h4" />
    </>
  ),
  library: <path d="M4 5.5h5v14H4zM10 5.5h5v14h-5zM16 7h4v12.5h-4z" />,
  admin: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
} as const;

export type ShellIconName = keyof typeof ICON_PATHS;

export function ShellIcon({ name }: { name: ShellIconName }) {
  return (
    <svg className="app-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}
