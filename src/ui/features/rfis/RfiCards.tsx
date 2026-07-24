/*
 * Mobile RFI cards -- a dedicated card pattern, never a horizontally squeezed
 * copy of the desktop table. Each card carries the same authorized data as the
 * desktop row and navigates to the canonical RFI workspace route.
 */

import { AppLink } from "../../app/AppLink";
import { AttentionBadge, Badge, RfiStatusBadge } from "../../components";
import { formatDate } from "./format";
import { rfiWorkspaceHref } from "./RfiTable";
import type { RfiListItem } from "./types";

function truncate(value: string | null | undefined, max = 140): string {
  const text = (value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function displayResponsible(rfi: RfiListItem): string {
  if (rfi.responsiblePartyLegacyText) {
    return `${rfi.responsiblePartyLegacyText} (unresolved)`;
  }
  return rfi.responsibleParty || "—";
}

function CardStatus({ rfi }: { rfi: RfiListItem }) {
  if (rfi.issuanceReconciliationState === "legacy_incomplete") {
    return <Badge tone="warning">Needs issue repair</Badge>;
  }
  return (
    <>
      <RfiStatusBadge status={rfi.status} />
      {rfi.isOverdue ? <AttentionBadge condition="overdue" /> : null}
      {!rfi.isOverdue && rfi.dueSoon ? (
        <AttentionBadge condition="due_soon" />
      ) : null}
    </>
  );
}

export function RfiCards({
  projectId,
  rfis,
}: {
  projectId: string;
  rfis: RfiListItem[];
}) {
  return (
    <ul className="rfi-register-cards" aria-label="Project RFIs">
      {rfis.map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        const numberText =
          rfi.issuanceReconciliationState === "legacy_incomplete" &&
          rfi.rfiNumber
            ? `Reserved ${rfi.rfiNumber}`
            : rfi.rfiNumber || "Unnumbered Draft";
        return (
          <li key={rfi.id} className="rfi-register-card">
            <AppLink className="rfi-register-card-main" href={href}>
              <span className="rfi-register-card-top">
                <span
                  className={`rfi-register-card-number${rfi.rfiNumber ? "" : " is-draft"}`}
                >
                  {numberText}
                </span>
                <CardStatus rfi={rfi} />
              </span>
              <span className="rfi-register-card-subject">
                {rfi.subject || "Untitled RFI"}
              </span>
              <span className="rfi-register-card-question">
                {truncate(rfi.question, 120)}
              </span>
            </AppLink>
            <dl className="rfi-register-card-facts">
              <div>
                <dt>Party</dt>
                <dd>{displayResponsible(rfi)}</dd>
              </div>
              <div>
                <dt>Response due</dt>
                <dd>{formatDate(rfi.requestedResponseDate) || "—"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(rfi.updatedAt) || "—"}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
