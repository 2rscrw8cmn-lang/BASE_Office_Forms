import { Badge, type BadgeTone } from "../primitives/Badge";

/**
 * One centralized status vocabulary and tone map (APP_UI_FOUNDATION §3.6).
 * Features render statuses through this map instead of inventing per-feature
 * labels or colours. Add a status here, not in a feature module.
 */
export interface StatusDescriptor {
  label: string;
  tone: BadgeTone;
}

export const STATUS_VOCABULARY = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Open", tone: "info" },
  in_review: { label: "In review", tone: "info" },
  due_soon: { label: "Due soon", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  responded: { label: "Responded", tone: "success" },
  issued: { label: "Issued", tone: "success" },
  published: { label: "Published", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  void: { label: "Void", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
} satisfies Record<string, StatusDescriptor>;

export type StatusKey = keyof typeof STATUS_VOCABULARY;

export interface StatusBadgeProps {
  status: StatusKey;
  className?: string;
}

/** Renders a domain status using the centralized vocabulary and tone map. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const descriptor = STATUS_VOCABULARY[status];
  return (
    <Badge tone={descriptor.tone} className={className}>
      {descriptor.label}
    </Badge>
  );
}
