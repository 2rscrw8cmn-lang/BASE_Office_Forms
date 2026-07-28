/*
 * Native React Record workspace: `/projects/:projectId/records/:recordId`.
 *
 * Replaces `public/record-detail-view.js` with the shared Record Workspace
 * pattern -- breadcrumbs, identity header with one primary current action and
 * an overflow menu, a metadata strip, the current-work panel, its files, and
 * version history as secondary context.
 *
 * Identity discipline, unchanged from UI-6B:
 *  - the Record is the stable document identity; a Revision is a version of it;
 *    a File belongs to exactly one Revision. Record facts live in the metadata
 *    strip, revision facts live in the revision panels, and neither repeats the
 *    other (UX_PRODUCT_SPEC §7.5).
 *  - a draft never stands in for the authoritative current revision. When both
 *    exist, the draft is labelled "Current work" and the published version stays
 *    separately reachable.
 *  - archived records are read-only, and the reason is stated rather than
 *    silently removing every action.
 */

import { useRef, useState, type ReactNode } from "react";
import {
  Button,
  ButtonLink,
  DropdownMenu,
  EmptyState,
  ErrorState,
  IconButton,
  PermissionState,
  RecordStatusBadge,
  RevisionStatusBadge,
  WorkspaceNotice,
  WorkspacePage,
  WorkspaceSection,
  useReturnFocus,
  type MetadataItem,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { AppLink } from "../../app/AppLink";
import { isPlainLeftClick } from "../../components/util/isPlainLeftClick";
import {
  ArchiveRecordDialog,
  CreateRevisionDialog,
  EditRecordDialog,
} from "./RecordDialogs";
import { PublishRevisionDialog } from "./PublishRevisionDialog";
import { RevisionFiles } from "./RevisionFiles";
import { recordsRegisterHref, revisionHref as buildRevisionHref } from "./api";
import {
  disciplineLabel,
  fileCountLabel,
  formatDate,
  issuanceLabel,
  recordTypeLabel,
  revisionName,
} from "./format";
import { useRecordWorkspace } from "./useRecordWorkspace";
import type { RecordWorkspaceModel, WorkspaceRevision } from "./types";
import "./record-workspace.css";

type DialogKind = "edit" | "archive" | "create-revision" | null;

/** Upload wording follows the revision's place in the document's history. */
function uploadLabel(revision: WorkspaceRevision): string {
  return revision.revisionNumber === 1 ? "Upload original" : "Upload document";
}

export function RecordWorkspaceFeature({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId: string;
}) {
  const shell = useShell();
  const state = useRecordWorkspace(projectId, recordId);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [publishTarget, setPublishTarget] = useState<WorkspaceRevision | null>(
    null,
  );
  // Dialogs here open from an overflow menu item or one of several buttons, so
  // focus restoration is explicit rather than Radix-trigger based -- the same
  // approach UI-5/UI-6B use for their Drawers.
  const dialogFocus = useReturnFocus();
  const publishFocus = useReturnFocus();
  // The overflow trigger, not the menu item, is what focus returns to: the item
  // itself is unmounted with the menu before the dialog closes.
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);

  const openDialog = (kind: Exclude<DialogKind, null>) => {
    dialogFocus.capture(actionsTriggerRef.current);
    setDialog(kind);
  };

  const closeDialog = () => {
    setDialog(null);
    dialogFocus.restore();
  };

  const registerHref = recordsRegisterHref(projectId);
  const revisionHref = (revisionId: string) =>
    buildRevisionHref(projectId, recordId, revisionId);

  if (state.status === "loading") {
    return (
      <WorkspacePage
        className="record-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Loading…" },
        ]}
        status="loading"
        loadingLabel="Loading document"
        title=""
      />
    );
  }

  if (state.status === "missing") {
    return (
      <WorkspacePage
        className="record-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Document not found" },
        ]}
        status="missing"
        title=""
        missing={
          <PermissionState
            title="Document not found"
            description="This document is unavailable or you do not have access to it."
          />
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <WorkspacePage
        className="record-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Document" },
        ]}
        status="error"
        title=""
        error={
          <ErrorState
            title="Unable to load this document"
            description="No changes were made. Check your connection and try again."
            requestId={state.requestId}
            onRetry={state.retry}
          />
        }
      />
    );
  }

  const data: RecordWorkspaceModel = state.data;
  const { record, capabilities } = data;
  const archived = record.status === "archived";
  const drafts = data.revisions.filter(
    (revision) => revision.status === "draft",
  );
  const singleDraft = drafts.length === 1 ? drafts[0] : null;
  const current = data.currentRevision;
  const history = data.revisions.filter(
    (revision) => revision.status !== "draft" && !revision.isCurrent,
  );

  /*
   * One primary current action, chosen by what the document actually needs
   * next: finish the draft, look at the current version, or start the first
   * revision. Everything else is secondary and lives in the overflow menu.
   */
  let primaryAction: ReactNode = null;
  if (singleDraft) {
    primaryAction = (
      <ButtonLink
        variant="primary"
        href={revisionHref(singleDraft.id)}
        data-primary-action
        onClick={(event) => {
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          shell.navigate(revisionHref(singleDraft.id));
        }}
      >
        {singleDraft.files.length === 0 && singleDraft.capabilities.uploadFile
          ? uploadLabel(singleDraft)
          : "Open draft revision"}
      </ButtonLink>
    );
  } else if (current) {
    primaryAction = (
      <ButtonLink
        variant="primary"
        href={revisionHref(current.id)}
        data-primary-action
        onClick={(event) => {
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          shell.navigate(revisionHref(current.id));
        }}
      >
        View current version
      </ButtonLink>
    );
  } else if (capabilities.createRevision) {
    primaryAction = (
      <Button
        variant="primary"
        iconStart="plus"
        data-primary-action
        data-create-revision
        onClick={(event) => {
          dialogFocus.capture(event.currentTarget);
          setDialog("create-revision");
        }}
      >
        Create original
      </Button>
    );
  }

  const overflowItems = [
    ...(capabilities.createRevision &&
    (singleDraft !== null || current !== null)
      ? [
          {
            id: "create-revision",
            label: "Create draft revision",
            icon: "plus" as const,
            onSelect: () => {
              openDialog("create-revision");
            },
          },
        ]
      : []),
    ...(capabilities.updateRecord
      ? [
          {
            id: "edit",
            label: "Edit document details",
            icon: "pencil" as const,
            onSelect: () => {
              openDialog("edit");
            },
          },
        ]
      : []),
    ...(capabilities.archiveRecord
      ? [
          {
            id: "archive",
            label: "Archive document",
            icon: "trash" as const,
            destructive: true,
            separatorBefore: true,
            onSelect: () => {
              openDialog("archive");
            },
          },
        ]
      : []),
  ];

  // Record-level facts only. Revision facts (version, change summary, issuance)
  // belong to the revision panels, never to this strip.
  const metadata: MetadataItem[] = [
    { label: "Discipline", value: disciplineLabel(record.discipline) },
    { label: "Files", value: fileCountLabel(data.totalFileCount) },
    ...(record.source ? [{ label: "Source", value: record.source }] : []),
    { label: "Created", value: formatDate(record.createdAt), mono: true },
    { label: "Updated", value: formatDate(record.updatedAt), mono: true },
  ];

  function revisionPanel(revision: WorkspaceRevision, draft: boolean) {
    const canPublish =
      revision.capabilities.publishRevision && revision.files.length > 0;
    return (
      <WorkspaceSection
        headingLevel={3}
        className="record-workspace-revision"
        title={
          <span className="record-workspace-revision__title">
            <span>{revisionName(revision)}</span>
            <RevisionStatusBadge status={revision.status} />
            {revision.isCurrent ? (
              <span className="record-workspace-current-note">
                Current version
              </span>
            ) : null}
          </span>
        }
        description={revision.changeSummary || "No change summary provided."}
        actions={
          <>
            <ButtonLink
              size="compact"
              variant="secondary"
              href={revisionHref(revision.id)}
              data-open-revision={revision.id}
              onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                shell.navigate(revisionHref(revision.id));
              }}
            >
              {draft && revision.files.length === 0
                ? uploadLabel(revision)
                : "Open revision"}
            </ButtonLink>
            {canPublish ? (
              <Button
                size="compact"
                variant="official"
                data-publish-revision={revision.id}
                onClick={(event) => {
                  publishFocus.capture(event.currentTarget);
                  setPublishTarget(revision);
                }}
              >
                Publish revision
              </Button>
            ) : null}
          </>
        }
      >
        <dl className="record-workspace-revision-facts">
          <div>
            <dt>Created</dt>
            <dd>{formatDate(revision.createdAt)}</dd>
          </div>
          <div>
            <dt>Files</dt>
            <dd>{fileCountLabel(revision.fileCount)}</dd>
          </div>
          <div>
            <dt>Issuance</dt>
            <dd>{issuanceLabel(revision.issuanceCount)}</dd>
          </div>
        </dl>
        <RevisionFiles
          projectId={projectId}
          recordId={recordId}
          revisionId={revision.id}
          files={revision.files}
          emptyTitle={
            draft ? "No document file yet" : "No file on this version"
          }
          emptyDescription={
            draft
              ? "Add the document file to this draft before it is published."
              : "No file was attached to this version."
          }
          emptyAction={
            draft && revision.capabilities.uploadFile ? (
              <ButtonLink
                variant="secondary"
                iconStart="upload"
                href={revisionHref(revision.id)}
                data-upload-cta={revision.id}
                onClick={(event) => {
                  if (!isPlainLeftClick(event)) return;
                  event.preventDefault();
                  shell.navigate(revisionHref(revision.id));
                }}
              >
                {uploadLabel(revision)}
              </ButtonLink>
            ) : null
          }
        />
      </WorkspaceSection>
    );
  }

  /*
   * The authoritative current version, shown as its own panel whenever a draft
   * is also in progress. Without it a draft would be the only version on
   * screen, which is exactly the impersonation the Record/Revision identity
   * rule forbids (UX_PRODUCT_SPEC §7.5).
   */
  const currentVersionPanel =
    current && drafts.length > 0 ? (
      <div className="record-workspace-work" data-work="current">
        <p className="record-workspace-work__label">Current version</p>
        {revisionPanel(current, false)}
      </div>
    ) : null;

  let currentWork: ReactNode;
  if (singleDraft) {
    currentWork = (
      <>
        <div className="record-workspace-work" data-work="draft">
          <p className="record-workspace-work__label">Current work</p>
          {revisionPanel(singleDraft, true)}
        </div>
        {currentVersionPanel}
      </>
    );
  } else if (drafts.length > 1) {
    currentWork = (
      <div className="record-workspace-work" data-work="multiple-drafts">
        <p className="record-workspace-work__label">Current work</p>
        <WorkspaceSection
          headingLevel={3}
          title={`${String(drafts.length)} drafts in progress`}
          description="Choose a draft to continue its files or publishing workflow."
        >
          <ul className="record-workspace-draft-list">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <AppLink
                  href={revisionHref(draft.id)}
                  data-open-revision={draft.id}
                >
                  {revisionName(draft)}
                </AppLink>
                <RevisionStatusBadge status={draft.status} />
                <p>{draft.changeSummary || "No change summary provided."}</p>
                <span>{fileCountLabel(draft.fileCount)}</span>
              </li>
            ))}
          </ul>
        </WorkspaceSection>
        {currentVersionPanel}
      </div>
    );
  } else if (current) {
    currentWork = (
      <div className="record-workspace-work" data-work="current">
        <p className="record-workspace-work__label">Current version</p>
        {revisionPanel(current, false)}
      </div>
    );
  } else {
    currentWork = (
      <div className="record-workspace-work" data-work="none">
        <p className="record-workspace-work__label">Current work</p>
        <EmptyState
          variant="first-use"
          icon="file-text"
          title="No original yet"
          description={
            archived
              ? "This document was archived before an original was created."
              : "Create the original to add the working document and begin its history."
          }
          action={
            capabilities.createRevision ? (
              <Button
                variant="secondary"
                iconStart="plus"
                data-create-revision
                onClick={(event) => {
                  dialogFocus.capture(event.currentTarget);
                  setDialog("create-revision");
                }}
              >
                Create original
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const secondary =
    history.length > 0 ? (
      <WorkspaceSection
        secondary
        headingLevel={3}
        title="Version history"
        description={`${String(history.length)} previous version${
          history.length === 1 ? "" : "s"
        }`}
      >
        <ul className="record-workspace-history">
          {history.map((revision) => (
            <li key={revision.id}>
              <div className="record-workspace-history__identity">
                <AppLink
                  href={revisionHref(revision.id)}
                  data-open-revision={revision.id}
                >
                  {revisionName(revision)}
                </AppLink>
                <RevisionStatusBadge status={revision.status} />
              </div>
              <p className="record-workspace-history__summary">
                {revision.changeSummary || "No change summary provided."}
              </p>
              <p className="record-workspace-history__meta">
                {fileCountLabel(revision.fileCount)} ·{" "}
                {issuanceLabel(revision.issuanceCount)} · Created{" "}
                {formatDate(revision.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </WorkspaceSection>
    ) : null;

  return (
    <>
      <WorkspacePage
        className="record-workspace"
        status="ready"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: record.title },
        ]}
        eyebrow={`${record.recordNumber || "Unnumbered document"} · ${recordTypeLabel(
          record.recordType,
        )}`}
        title={record.title}
        statusSlot={<RecordStatusBadge status={record.status} />}
        supporting={record.description ?? undefined}
        primaryAction={primaryAction}
        overflowActions={
          overflowItems.length > 0 ? (
            <DropdownMenu
              trigger={
                <IconButton
                  ref={actionsTriggerRef}
                  icon="more"
                  label="Document actions"
                  data-record-actions
                />
              }
              items={overflowItems}
            />
          ) : null
        }
        notice={
          archived ? (
            <WorkspaceNotice
              title="Archived document"
              description={`This document is read-only and cannot receive new revisions${
                record.archivedAt
                  ? ` · Archived ${formatDate(record.archivedAt)}`
                  : ""
              }.`}
            />
          ) : null
        }
        metadata={metadata}
        secondary={secondary}
      >
        {state.refreshing ? (
          <p className="base-sr-only" aria-live="polite">
            Refreshing document.
          </p>
        ) : null}
        {currentWork}
      </WorkspacePage>

      {capabilities.updateRecord ? (
        <EditRecordDialog
          projectId={projectId}
          record={record}
          open={dialog === "edit"}
          onOpenChange={(open) => {
            if (open) setDialog("edit");
            else closeDialog();
          }}
        />
      ) : null}
      {capabilities.archiveRecord ? (
        <ArchiveRecordDialog
          projectId={projectId}
          record={record}
          open={dialog === "archive"}
          onOpenChange={(open) => {
            if (open) setDialog("archive");
            else closeDialog();
          }}
        />
      ) : null}
      {capabilities.createRevision ? (
        <CreateRevisionDialog
          projectId={projectId}
          record={record}
          open={dialog === "create-revision"}
          onOpenChange={(open) => {
            if (open) setDialog("create-revision");
            else closeDialog();
          }}
        />
      ) : null}
      <PublishRevisionDialog
        projectId={projectId}
        recordId={recordId}
        revision={publishTarget}
        open={publishTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPublishTarget(null);
            publishFocus.restore();
          }
        }}
      />
    </>
  );
}
