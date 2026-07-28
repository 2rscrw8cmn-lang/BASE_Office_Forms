/*
 * Native React RFI workspace: `/projects/:projectId/rfis/:rfiId`.
 *
 * Replaces `public/rfi-workspace-view.js` with the shared Record Workspace
 * pattern, so an RFI, a document, and a revision now read as the same product
 * while keeping their real domain differences:
 *
 *  - an RFI is a structured record, not an uploaded file, so its "current work"
 *    panel is its authoritative content rather than a file list;
 *  - the response is a separate section from the question and never merged into
 *    it;
 *  - attachments carry an explicit role and their exact draft revision;
 *  - the template-bound document view is read-only and rendered on demand.
 *
 * The full issuance dialog remains outside UI-7. This workspace does expose
 * the accepted Slice 2A read model: immutable original-issue evidence after
 * reload, plus the server-authorized Return to draft correction path before
 * issue. A legacy RFI that consumed a number without a complete issuance says
 * exactly that.
 */

import { useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityFeed,
  AlertDialog,
  AttentionBadge,
  Badge,
  Button,
  ButtonLink,
  Collapsible,
  DropdownMenu,
  ErrorState,
  IconButton,
  PermissionState,
  RfiStatusBadge,
  WorkspaceNotice,
  WorkspacePage,
  WorkspaceSection,
  useReturnFocus,
  type MetadataItem,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { RfiAttachmentsPanel, attachmentList } from "./RfiAttachmentsPanel";
import { RfiContentPanel } from "./RfiContentPanel";
import { RfiResponsePanel, shouldShowResponse } from "./RfiResponsePanel";
import {
  RfiTemplatePreview,
  templatePreviewAvailable,
} from "./RfiTemplatePreview";
import {
  attachmentContentHref,
  rfiRegisterHref,
  runRfiTransition,
  RfiWorkspaceApiError,
} from "./api";
import {
  actorLabel,
  describeActivity,
  formatDate,
  rfiActivityDetail,
  rfiNumberLabel,
} from "./format";
import { projectRfisQueryKey } from "../rfis/useProjectRfis";
import { rfiWorkspaceQueryKey, useRfiWorkspace } from "./useRfiWorkspace";
import type {
  RfiOfficialIssueSummary,
  RfiTransition,
  RfiWorkspaceModel,
} from "./types";
import "./rfi-workspace.css";

interface PendingTransition {
  transition: RfiTransition;
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
}

const TRANSITIONS: Record<
  RfiTransition,
  Omit<PendingTransition, "transition">
> = {
  close: {
    title: "Close this RFI?",
    description:
      "Closing records that the question has been resolved. It can be reopened later if the answer changes.",
    confirmLabel: "Close RFI",
    destructive: false,
  },
  reopen: {
    title: "Reopen this RFI?",
    description:
      "Reopening returns the RFI to an open state so further response can be recorded.",
    confirmLabel: "Reopen RFI",
    destructive: false,
  },
  "return-to-draft": {
    title: "Return this RFI to draft?",
    description:
      "This intentionally unlocks an unnumbered ready RFI so its content or routing can be corrected. It does not undo or recover an official issue.",
    confirmLabel: "Return to draft",
    destructive: false,
  },
  void: {
    title: "Void this RFI?",
    description:
      "Voiding permanently withdraws the RFI. Any number it already consumed stays consumed, and this cannot be undone here.",
    confirmLabel: "Void RFI",
    destructive: true,
  },
};

function OriginalIssueEvidence({
  projectId,
  rfiId,
  issue,
}: {
  projectId: string;
  rfiId: string;
  issue: RfiOfficialIssueSummary;
}) {
  return (
    <WorkspaceSection
      headingLevel={3}
      title="Original issue"
      description="Immutable evidence from the original official issue. Current status and available actions are shown above."
      className="rfi-workspace-original-issue"
    >
      <dl className="rfi-workspace-facts">
        <div className="rfi-workspace-fact">
          <dt>Official number</dt>
          <dd>{issue.officialDisplayNumber}</dd>
        </div>
        <div className="rfi-workspace-fact">
          <dt>Issued revision</dt>
          <dd>{issue.issuedRevision.userFacingVersion}</dd>
        </div>
        <div className="rfi-workspace-fact">
          <dt>Issuance</dt>
          <dd>{issue.issuance.issueNumber}</dd>
        </div>
        <div className="rfi-workspace-fact">
          <dt>Issued</dt>
          <dd>{formatDate(issue.issuedAt) || "—"}</dd>
        </div>
        <div className="rfi-workspace-fact">
          <dt>Response due</dt>
          <dd>{issue.responseDueDate || "—"}</dd>
        </div>
        <div className="rfi-workspace-fact is-wide">
          <dt>Official PDF</dt>
          <dd>
            <ButtonLink
              size="compact"
              variant="secondary"
              iconStart="download"
              href={attachmentContentHref(
                projectId,
                rfiId,
                issue.officialArtifact.fileId,
              )}
              target="_blank"
              rel="noopener"
              data-official-pdf-download={issue.officialArtifact.fileId}
            >
              Download {issue.officialArtifact.originalFilename}
            </ButtonLink>
          </dd>
        </div>
      </dl>
    </WorkspaceSection>
  );
}

export function RfiWorkspaceFeature({
  projectId,
  rfiId,
}: {
  projectId: string;
  rfiId: string;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const state = useRfiWorkspace(projectId, rfiId);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [working, setWorking] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  // Confirmations open from the primary action or from an overflow item, so
  // focus return is explicit; the overflow trigger (not the unmounted menu
  // item) is what focus goes back to.
  const confirmFocus = useReturnFocus();
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);

  const registerHref = rfiRegisterHref(projectId);

  if (state.status === "loading") {
    return (
      <WorkspacePage
        className="rfi-workspace"
        breadcrumbs={[
          { label: "RFIs", href: registerHref },
          { label: "Loading…" },
        ]}
        status="loading"
        loadingLabel="Loading RFI"
        title=""
      />
    );
  }

  if (state.status === "missing") {
    return (
      <WorkspacePage
        className="rfi-workspace"
        breadcrumbs={[
          { label: "RFIs", href: registerHref },
          { label: "RFI not found" },
        ]}
        status="missing"
        title=""
        missing={
          <PermissionState
            title="RFI not found"
            description="This RFI is unavailable or you do not have access to it."
          />
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <WorkspacePage
        className="rfi-workspace"
        breadcrumbs={[{ label: "RFIs", href: registerHref }, { label: "RFI" }]}
        status="error"
        title=""
        error={
          <ErrorState
            title="Unable to load this RFI"
            description="No changes were made. Check your connection and try again."
            requestId={state.requestId}
            onRetry={state.retry}
          />
        }
      />
    );
  }

  const data: RfiWorkspaceModel = state.data;
  const { rfi, capabilities } = data;
  const legacyIncomplete =
    rfi.issuanceReconciliationState === "legacy_incomplete";
  const editableDraft = capabilities.updateDraft;

  const runTransition = (item: PendingTransition) => {
    if (working) return;
    setWorking(true);
    setTransitionError(null);
    void (async () => {
      try {
        await runRfiTransition(projectId, rfi.id, item.transition);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: rfiWorkspaceQueryKey(projectId, rfi.id),
          }),
          queryClient.invalidateQueries({
            queryKey: projectRfisQueryKey(projectId),
          }),
        ]);
        shell.announce(`${item.confirmLabel} completed.`);
        setWorking(false);
        setPending(null);
        confirmFocus.restore();
      } catch (error) {
        setWorking(false);
        if (error instanceof RfiWorkspaceApiError && error.status === 409) {
          await queryClient.invalidateQueries({
            queryKey: rfiWorkspaceQueryKey(projectId, rfi.id),
          });
          setTransitionError(
            "This RFI changed elsewhere. The latest state was loaded; review it and try again.",
          );
          shell.announce("This RFI changed elsewhere.");
          return;
        }
        setTransitionError(
          error instanceof RfiWorkspaceApiError
            ? `${error.message}${error.requestId ? ` Request ID ${error.requestId}.` : ""}`
            : "The action could not be completed.",
        );
        shell.announce("The action could not be completed.");
      }
    })();
  };

  /** One primary current action, and only from a server capability. */
  let primaryAction: ReactNode = null;
  if (capabilities.returnToDraft) {
    primaryAction = (
      <Button
        variant="official"
        data-primary-action
        data-transition="return-to-draft"
        onClick={(event) => {
          confirmFocus.capture(event.currentTarget);
          setTransitionError(null);
          setPending({
            transition: "return-to-draft",
            ...TRANSITIONS["return-to-draft"],
          });
        }}
      >
        Return to draft
      </Button>
    );
  } else if (capabilities.close) {
    primaryAction = (
      <Button
        variant="official"
        data-primary-action
        data-transition="close"
        onClick={(event) => {
          confirmFocus.capture(event.currentTarget);
          setTransitionError(null);
          setPending({ transition: "close", ...TRANSITIONS.close });
        }}
      >
        Close RFI
      </Button>
    );
  } else if (capabilities.reopen) {
    primaryAction = (
      <Button
        variant="official"
        data-primary-action
        data-transition="reopen"
        onClick={(event) => {
          confirmFocus.capture(event.currentTarget);
          setTransitionError(null);
          setPending({ transition: "reopen", ...TRANSITIONS.reopen });
        }}
      >
        Reopen RFI
      </Button>
    );
  }

  const overflowItems = [
    ...(capabilities.reopen && capabilities.close
      ? [
          {
            id: "reopen",
            label: "Reopen RFI",
            onSelect: () => {
              confirmFocus.capture(actionsTriggerRef.current);
              setTransitionError(null);
              setPending({ transition: "reopen", ...TRANSITIONS.reopen });
            },
          },
        ]
      : []),
    ...(capabilities.void
      ? [
          {
            id: "void",
            label: "Void RFI",
            icon: "trash" as const,
            destructive: true,
            separatorBefore: true,
            onSelect: () => {
              confirmFocus.capture(actionsTriggerRef.current);
              setTransitionError(null);
              setPending({ transition: "void", ...TRANSITIONS.void });
            },
          },
        ]
      : []),
  ];

  /*
   * Record-level facts. Assigned to and Response due move into the content
   * editor while this user may edit the draft, so each fact keeps exactly one
   * authoritative location on screen (APP_UI_FOUNDATION §5.2).
   */
  const metadata: MetadataItem[] = [
    ...(editableDraft
      ? []
      : [
          {
            label: "Assigned to",
            value: rfi.responsibleParty ? (
              rfi.responsibleParty
            ) : rfi.responsiblePartyLegacyText ? (
              <>
                {rfi.responsiblePartyLegacyText}{" "}
                <em className="rfi-workspace-legacy">Unresolved</em>
              </>
            ) : (
              "Unassigned"
            ),
          },
          {
            label: "Response due",
            value: formatDate(rfi.requestedResponseDate) || "—",
            mono: true,
          },
        ]),
    ...(rfi.issuedAt && !legacyIncomplete
      ? [{ label: "Issued", value: formatDate(rfi.issuedAt), mono: true }]
      : []),
    { label: "Current version", value: data.currentVersion.label },
    { label: "Files", value: String(attachmentList(data).length) },
    { label: "Updated", value: formatDate(rfi.updatedAt) || "—", mono: true },
  ];

  const activity = data.activity;

  return (
    <>
      <WorkspacePage
        className="rfi-workspace"
        layout="rail"
        status="ready"
        breadcrumbs={[
          { label: "RFIs", href: registerHref },
          { label: rfiNumberLabel(rfi.rfiNumber) },
        ]}
        eyebrow={
          legacyIncomplete && rfi.rfiNumber
            ? `Reserved ${rfi.rfiNumber}`
            : rfiNumberLabel(rfi.rfiNumber)
        }
        title={rfi.subject}
        statusSlot={
          <>
            {legacyIncomplete ? (
              // Not a stored status and not a calculated due condition: a
              // reconciliation state, labelled in plain words.
              <Badge tone="warning">Needs issue repair</Badge>
            ) : (
              <RfiStatusBadge status={rfi.status} />
            )}
            {!legacyIncomplete && (rfi.isOverdue || rfi.dueSoon) ? (
              <AttentionBadge
                condition={rfi.isOverdue ? "overdue" : "due_soon"}
              />
            ) : null}
          </>
        }
        supporting={
          rfi.legacyReference
            ? `Legacy reference ${rfi.legacyReference}`
            : undefined
        }
        primaryAction={primaryAction}
        overflowActions={
          overflowItems.length > 0 ? (
            <DropdownMenu
              trigger={
                <IconButton
                  ref={actionsTriggerRef}
                  icon="more"
                  label="RFI actions"
                  data-rfi-actions
                />
              }
              items={overflowItems}
            />
          ) : null
        }
        notice={
          legacyIncomplete ? (
            <WorkspaceNotice
              tone="warning"
              title="Legacy issue requires reconciliation"
              description="The consumed number and timestamp were preserved, but this RFI is not presented as officially issued because no immutable issued revision or official artifact exists."
            />
          ) : null
        }
        metadata={metadata}
        secondary={
          <>
            {templatePreviewAvailable(data) ? (
              <WorkspaceSection
                secondary
                headingLevel={3}
                title="Document view"
                description="A read-only rendering of this RFI through its bound template."
              >
                <Collapsible
                  title="Show document view"
                  className="rfi-workspace-preview-toggle"
                >
                  <RfiTemplatePreview data={data} />
                </Collapsible>
              </WorkspaceSection>
            ) : (
              // No expandable control here: it could only ever open onto an
              // "unavailable" message, which is a dead end, not a feature.
              <p
                className="rfi-workspace-empty-value rfi-workspace-preview-note"
                data-preview-unavailable
              >
                The controlled renderer is not loaded in the application
                workspace, so the template-bound document view is unavailable
                here. The RFI content above is the authoritative record.
              </p>
            )}
            <WorkspaceSection
              secondary
              headingLevel={3}
              title="Activity"
              description={`${String(activity.length)} event${
                activity.length === 1 ? "" : "s"
              }`}
            >
              <ActivityFeed
                emptyLabel="No activity recorded yet."
                items={activity.map((event, index) => ({
                  id: `${event.action}-${event.createdAt}-${String(index)}`,
                  summary: (
                    <>
                      {describeActivity(event.action)}
                      {rfiActivityDetail(event) ? (
                        <span className="rfi-workspace-activity-detail">
                          {" "}
                          — {rfiActivityDetail(event)}
                        </span>
                      ) : null}
                    </>
                  ),
                  actor: actorLabel(event),
                  timestamp: formatDate(event.createdAt) || "",
                }))}
              />
            </WorkspaceSection>
          </>
        }
      >
        {state.refreshing ? (
          <p className="base-sr-only" aria-live="polite">
            Refreshing RFI.
          </p>
        ) : null}

        {transitionError ? (
          <div className="rfi-workspace-error" role="alert">
            <p>{transitionError}</p>
          </div>
        ) : null}

        <WorkspaceSection
          headingLevel={3}
          title="RFI content"
          description={
            editableDraft
              ? "The authoritative question and references. Saved changes apply to this draft."
              : "The authoritative question and references, as issued."
          }
        >
          <RfiContentPanel projectId={projectId} data={data} />
        </WorkspaceSection>

        <WorkspaceSection
          headingLevel={3}
          title="Files"
          description={`${String(attachmentList(data).length)} attached to ${data.currentVersion.label}`}
        >
          <RfiAttachmentsPanel projectId={projectId} data={data} />
        </WorkspaceSection>

        {data.officialIssue ? (
          <OriginalIssueEvidence
            projectId={projectId}
            rfiId={rfi.id}
            issue={data.officialIssue}
          />
        ) : null}

        {shouldShowResponse(data) ? (
          <WorkspaceSection
            headingLevel={3}
            title="Response"
            description={
              data.responses.length > 0
                ? `Returned ${formatDate(data.responses.at(-1)?.createdAt) || "—"}`
                : "Awaiting response"
            }
          >
            <RfiResponsePanel projectId={projectId} data={data} />
          </WorkspaceSection>
        ) : null}
      </WorkspacePage>

      {pending ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !working) {
              setPending(null);
              confirmFocus.restore();
            }
          }}
          className="rfi-workspace-alert"
          title={pending.title}
          description={
            <>
              {pending.description}
              {transitionError ? (
                <span role="alert" className="rfi-workspace-alert__error">
                  {" "}
                  {transitionError}
                </span>
              ) : null}
            </>
          }
          confirmLabel={pending.confirmLabel}
          destructive={pending.destructive}
          loading={working}
          onConfirm={() => {
            runTransition(pending);
          }}
        />
      ) : null}
    </>
  );
}
