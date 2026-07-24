/*
 * Dedicated mobile RFI cards. The desktop table stays out of the phone layout;
 * drafts open the same shared Drawer and issued/locked records navigate to the
 * canonical workspace.
 */

import { AppLink } from "../../app/AppLink";
import { useShell } from "../../app/ShellContext";
import {
  Badge,
  DropdownMenu,
  Icon,
  IconButton,
  RfiStatusBadge,
} from "../../components";
import {
  formatDate,
  formatRelativeUpdated,
  formatShortDate,
  rfiDueUrgencyText,
} from "./format";
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
  return rfi.responsibleParty || "Unassigned";
}

function CardStatus({ rfi }: { rfi: RfiListItem }) {
  return rfi.issuanceReconciliationState === "legacy_incomplete" ? (
    <Badge tone="warning">Needs issue repair</Badge>
  ) : (
    <RfiStatusBadge status={rfi.status} />
  );
}

function CardPrimary({
  rfi,
  href,
  open,
  onOpenEditor,
}: {
  rfi: RfiListItem;
  href: string;
  open: boolean;
  onOpenEditor: (id: string, trigger?: HTMLElement) => void;
}) {
  const content = (
    <>
      <span className="rfi-register-card-subject">
        {rfi.subject || "Untitled RFI"}
      </span>
      <span className="rfi-register-card-question">
        {truncate(rfi.question, 130)}
      </span>
      <span className="rfi-register-card-status">
        <CardStatus rfi={rfi} />
      </span>
    </>
  );

  return rfi.capabilities.updateDraft ? (
    <button
      type="button"
      className="rfi-register-card-main"
      data-card-edit
      data-editor-trigger
      data-id={rfi.id}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={`rfi-editor-${rfi.id}`}
      onClick={(event) => {
        onOpenEditor(rfi.id, event.currentTarget);
      }}
    >
      {content}
    </button>
  ) : (
    <AppLink className="rfi-register-card-main" href={href}>
      {content}
    </AppLink>
  );
}

export function RfiCards({
  projectId,
  rfis,
  editorOpenId,
  onOpenEditor,
}: {
  projectId: string;
  rfis: RfiListItem[];
  editorOpenId: string | null;
  onOpenEditor: (id: string, trigger?: HTMLElement) => void;
}) {
  const shell = useShell();

  return (
    <ul className="rfi-register-cards" aria-label="Project RFIs">
      {rfis.map((rfi) => {
        const href = rfiWorkspaceHref(projectId, rfi.id);
        const subject = rfi.subject || "Untitled RFI";
        const dueText = rfi.requestedResponseDate
          ? formatShortDate(rfi.requestedResponseDate)
          : "No due date";
        const urgency = rfi.requestedResponseDate
          ? rfiDueUrgencyText(rfi.requestedResponseDate, rfi.isOverdue)
          : "";
        return (
          <li
            key={rfi.id}
            className={`rfi-register-card${editorOpenId === rfi.id ? " is-selected" : ""}`}
          >
            <div className="rfi-register-card-top">
              <span className="rfi-register-card-identity">
                {rfi.rfiNumber ? (
                  <span className="rfi-register-card-number">
                    {rfi.issuanceReconciliationState === "legacy_incomplete"
                      ? `Reserved ${rfi.rfiNumber}`
                      : rfi.rfiNumber}
                  </span>
                ) : (
                  <Badge tone="neutral">Draft</Badge>
                )}
              </span>
              <span
                className="rfi-register-card-updated"
                title={formatDate(rfi.updatedAt)}
              >
                {formatRelativeUpdated(rfi.updatedAt) || "—"}
              </span>
              <DropdownMenu
                trigger={
                  <IconButton
                    icon="more"
                    label={`Actions for ${subject}`}
                    size="compact"
                    data-rfi-card-actions={rfi.id}
                  />
                }
                items={[
                  rfi.capabilities.updateDraft
                    ? {
                        id: "edit",
                        label: "Edit draft",
                        icon: "pencil",
                        onSelect: () => {
                          onOpenEditor(rfi.id);
                        },
                      }
                    : {
                        id: "open",
                        label: "Open RFI",
                        icon: "file-text",
                        onSelect: () => {
                          shell.navigate(href);
                        },
                      },
                ]}
              />
            </div>

            <CardPrimary
              rfi={rfi}
              href={href}
              open={editorOpenId === rfi.id}
              onOpenEditor={onOpenEditor}
            />

            <div className="rfi-register-card-facts">
              <span>
                <Icon name="user" size={16} />
                <span>
                  <span className="base-sr-only">Assigned to: </span>
                  {displayResponsible(rfi)}
                </span>
              </span>
              <span className={rfi.isOverdue ? " is-overdue" : undefined}>
                <Icon name="clock" size={16} />
                <span>
                  <span className="base-sr-only">Due: </span>
                  {urgency || dueText}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
