/*
 * The single application icon component. All application icons render through
 * this wrapper so BASE never mixes arbitrary SVG families, text glyphs, emoji,
 * or CSS-generated symbols (APP_UI_FOUNDATION §4.4). Icons come from Lucide via
 * a curated registry; a feature adds an icon by extending the registry, not by
 * importing Lucide directly.
 *
 * Accessibility: an icon is decorative by default (aria-hidden). Passing a
 * `title` promotes it to an image with an accessible name — required whenever an
 * icon carries meaning that is not already in adjacent text.
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  File as FileIcon,
  FileText,
  Filter,
  Info,
  LayoutDashboard,
  Loader2,
  Lock,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  check: Check,
  "check-circle": CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  clock: Clock,
  dashboard: LayoutDashboard,
  download: Download,
  file: FileIcon,
  "file-text": FileText,
  filter: Filter,
  info: Info,
  loader: Loader2,
  lock: Lock,
  menu: Menu,
  more: MoreHorizontal,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  search: Search,
  settings: Settings,
  trash: Trash2,
  upload: Upload,
  user: User,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixel size; defaults to 16 (1em-aligned register/control glyph). */
  size?: number;
  /**
   * Accessible name. When provided the icon is exposed as an image with this
   * label; when omitted the icon is hidden from assistive technology.
   */
  title?: string;
  className?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 16,
  title,
  className,
  strokeWidth = 2,
}: IconProps) {
  const Glyph = ICONS[name];
  const labelled = title !== undefined && title.length > 0;
  return (
    <Glyph
      className={["base-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      focusable={false}
    />
  );
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
