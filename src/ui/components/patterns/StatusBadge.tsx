import type { RfiStatus } from "../../../domain/rfis/rfi";
import type { RecordStatus } from "../../../domain/records/record";
import type { RevisionStatus } from "../../../domain/revisions/revision";
import { Badge, type BadgeTone } from "../primitives/Badge";

/**
 * Status badges render one centralized, domain-typed vocabulary per
 * authoritative status enum (APP_UI_FOUNDATION §3.6) instead of a single
 * flattened, feature-invented list. Each map is a `Record<DomainStatus, …>`
 * keyed by the exact domain status union imported from `src/domain`, so
 * TypeScript rejects an incomplete or stale map the moment the domain enum
 * changes, and `tests/unit/base-status-badges.test.tsx` additionally asserts
 * the map keys match the domain constant at runtime. Add a status here,
 * sourced from the domain layer — never invent a feature-local label or
 * colour, and never duplicate this vocabulary in a feature module.
 *
 * Due/overdue are calculated presentation conditions, never stored statuses
 * (`src/domain/rfis/rfi.ts`, `docs/WORKFLOWS.md` §5.1), so they render
 * through the separate `AttentionBadge`/`ATTENTION_VOCABULARY` rather than
 * being mixed into a status enum.
 */
export interface StatusDescriptor {
  label: string;
  tone: BadgeTone;
}

export const RFI_STATUS_VOCABULARY: Record<RfiStatus, StatusDescriptor> = {
  draft: { label: "Draft", tone: "neutral" },
  ready_to_issue: { label: "Ready to issue", tone: "info" },
  open: { label: "Open", tone: "info" },
  response_received: { label: "Response received", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  returned_for_clarification: {
    label: "Returned for clarification",
    tone: "warning",
  },
  void: { label: "Void", tone: "danger" },
};

export const RECORD_STATUS_VOCABULARY: Record<RecordStatus, StatusDescriptor> =
  {
    active: { label: "Active", tone: "success" },
    archived: { label: "Archived", tone: "neutral" },
  };

export const REVISION_STATUS_VOCABULARY: Record<
  RevisionStatus,
  StatusDescriptor
> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  superseded: { label: "Superseded", tone: "neutral" },
};

/** Calculated attention conditions — never stored statuses. */
export const ATTENTION_CONDITIONS = ["due_soon", "overdue"] as const;
export type AttentionCondition = (typeof ATTENTION_CONDITIONS)[number];

export const ATTENTION_VOCABULARY: Record<
  AttentionCondition,
  StatusDescriptor
> = {
  due_soon: { label: "Due soon", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
};

export interface RfiStatusBadgeProps {
  status: RfiStatus;
  className?: string;
}

/** Renders an RFI's authoritative workflow status (`src/domain/rfis/rfi.ts`). */
export function RfiStatusBadge({ status, className }: RfiStatusBadgeProps) {
  const descriptor = RFI_STATUS_VOCABULARY[status];
  return (
    <Badge tone={descriptor.tone} className={className}>
      {descriptor.label}
    </Badge>
  );
}

export interface RecordStatusBadgeProps {
  status: RecordStatus;
  className?: string;
}

/** Renders a Record's authoritative status (`src/domain/records/record.ts`). */
export function RecordStatusBadge({
  status,
  className,
}: RecordStatusBadgeProps) {
  const descriptor = RECORD_STATUS_VOCABULARY[status];
  return (
    <Badge tone={descriptor.tone} className={className}>
      {descriptor.label}
    </Badge>
  );
}

export interface RevisionStatusBadgeProps {
  status: RevisionStatus;
  className?: string;
}

/** Renders a Revision's authoritative status (`src/domain/revisions/revision.ts`). */
export function RevisionStatusBadge({
  status,
  className,
}: RevisionStatusBadgeProps) {
  const descriptor = REVISION_STATUS_VOCABULARY[status];
  return (
    <Badge tone={descriptor.tone} className={className}>
      {descriptor.label}
    </Badge>
  );
}

export interface AttentionBadgeProps {
  condition: AttentionCondition;
  className?: string;
}

/**
 * Renders a calculated attention condition (due soon / overdue). Never a
 * stored status — see the module doc above.
 */
export function AttentionBadge({ condition, className }: AttentionBadgeProps) {
  const descriptor = ATTENTION_VOCABULARY[condition];
  return (
    <Badge tone={descriptor.tone} className={className}>
      {descriptor.label}
    </Badge>
  );
}
