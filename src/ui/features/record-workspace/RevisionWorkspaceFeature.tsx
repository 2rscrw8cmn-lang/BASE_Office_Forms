/*
 * Native React Revision workspace:
 * `/projects/:projectId/records/:recordId/revisions/:revisionId`.
 *
 * Replaces `public/revision-detail-view.js` with the shared Record Workspace
 * pattern. The exact revision context is never ambiguous: the identity header
 * names this version, states its status, says whether it is the document's
 * current version, and the breadcrumb keeps the owning document one click away.
 *
 * Immutability is presented, not merely enforced: published and superseded
 * versions state that they are read-only, archived documents state that too,
 * and the upload control and publish action only appear when the server's
 * per-revision capabilities allow them. Publishing is an explicit confirmed
 * transition, never an ordinary save.
 */

import { useState } from "react";
import {
  Button,
  ErrorState,
  PermissionState,
  RevisionStatusBadge,
  WorkspaceNotice,
  WorkspacePage,
  WorkspaceSection,
  useReturnFocus,
  type MetadataItem,
} from "../../components";
import { PublishRevisionDialog } from "./PublishRevisionDialog";
import { RevisionFiles } from "./RevisionFiles";
import { RevisionUploadPanel } from "./RevisionUploadPanel";
import { recordHref, recordsRegisterHref } from "./api";
import {
  fileCountLabel,
  formatDate,
  issuanceLabel,
  recordTypeLabel,
  revisionName,
} from "./format";
import { useRevisionWorkspace } from "./useRecordWorkspace";
import "./record-workspace.css";

export function RevisionWorkspaceFeature({
  projectId,
  recordId,
  revisionId,
}: {
  projectId: string;
  recordId: string;
  revisionId: string;
}) {
  const state = useRevisionWorkspace(projectId, recordId, revisionId);
  const [publishOpen, setPublishOpen] = useState(false);
  // Explicit focus return: the confirmation is opened programmatically, not
  // through a Radix Trigger.
  const publishFocus = useReturnFocus();

  const registerHref = recordsRegisterHref(projectId);
  const documentHref = recordHref(projectId, recordId);

  if (state.status === "loading") {
    return (
      <WorkspacePage
        className="revision-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Loading…" },
        ]}
        status="loading"
        loadingLabel="Loading revision"
        title=""
      />
    );
  }

  if (state.status === "missing") {
    return (
      <WorkspacePage
        className="revision-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Revision not found" },
        ]}
        status="missing"
        title=""
        missing={
          <PermissionState
            title="Revision not found"
            description="This revision is unavailable or you do not have access to it."
          />
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <WorkspacePage
        className="revision-workspace"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: "Revision" },
        ]}
        status="error"
        title=""
        error={
          <ErrorState
            title="Unable to load this revision"
            description="No changes were made. Check your connection and try again."
            requestId={state.requestId}
            onRetry={state.retry}
          />
        }
      />
    );
  }

  const { record, revision, currentRevisionId } = state.data;
  const isDraft = revision.status === "draft";
  const archived = record.status === "archived";
  const isCurrent = revision.isCurrent || currentRevisionId === revision.id;
  const canUpload = revision.capabilities.uploadFile;
  const canPublish =
    revision.capabilities.publishRevision && revision.files.length > 0;

  const metadata: MetadataItem[] = [
    { label: "Created", value: formatDate(revision.createdAt), mono: true },
    { label: "Files", value: fileCountLabel(revision.fileCount) },
    { label: "Issuance", value: issuanceLabel(revision.issuanceCount) },
  ];

  /*
   * Exactly one lifecycle notice, and it names the real reason. An archived
   * document takes precedence over the revision's own read-only status because
   * it is the stronger constraint.
   */
  let notice = null;
  if (archived) {
    notice = (
      <WorkspaceNotice
        title="Archived document"
        description={`This version remains available but is read-only${
          record.archivedAt
            ? ` · Archived ${formatDate(record.archivedAt)}`
            : ""
        }.`}
      />
    );
  } else if (!isDraft) {
    notice = (
      <WorkspaceNotice
        title={
          revision.status === "published"
            ? "Published version"
            : "Superseded version"
        }
        description="Published and superseded versions are immutable and cannot be changed from this workspace."
      />
    );
  }

  return (
    <>
      <WorkspacePage
        className="revision-workspace"
        status="ready"
        breadcrumbs={[
          { label: "Documents", href: registerHref },
          { label: record.title, href: documentHref },
          { label: revisionName(revision) },
        ]}
        eyebrow={`${record.recordNumber || "Unnumbered document"} · ${recordTypeLabel(
          record.recordType,
        )}`}
        title={revisionName(revision)}
        statusSlot={
          <>
            <RevisionStatusBadge status={revision.status} />
            {isCurrent ? (
              <span className="record-workspace-current-note">
                Current version
              </span>
            ) : null}
          </>
        }
        supporting={record.title}
        primaryAction={
          canPublish ? (
            <Button
              variant="official"
              data-primary-action
              data-publish-revision={revision.id}
              onClick={(event) => {
                publishFocus.capture(event.currentTarget);
                setPublishOpen(true);
              }}
            >
              Publish revision
            </Button>
          ) : null
        }
        notice={notice}
        metadata={metadata}
      >
        {state.refreshing ? (
          <p className="base-sr-only" aria-live="polite">
            Refreshing revision.
          </p>
        ) : null}

        <WorkspaceSection headingLevel={3} title="Change summary">
          <p className="revision-workspace-summary">
            {revision.changeSummary || "No change summary provided."}
          </p>
        </WorkspaceSection>

        <WorkspaceSection
          headingLevel={3}
          title="Version files"
          description={fileCountLabel(revision.fileCount)}
        >
          <RevisionFiles
            projectId={projectId}
            recordId={recordId}
            revisionId={revision.id}
            files={revision.files}
            emptyTitle="No files attached"
            emptyDescription={
              isDraft && !archived
                ? "Upload the working document before publishing this revision."
                : "No file was attached to this revision."
            }
          />
          {canUpload ? (
            <RevisionUploadPanel
              projectId={projectId}
              recordId={recordId}
              revisionId={revision.id}
              hasFiles={revision.files.length > 0}
            />
          ) : null}
        </WorkspaceSection>

        {revision.capabilities.publishRevision &&
        revision.files.length === 0 ? (
          <p className="revision-workspace-publish-hint">
            A draft revision needs at least one file before it can be published.
          </p>
        ) : null}
      </WorkspacePage>

      <PublishRevisionDialog
        projectId={projectId}
        recordId={recordId}
        revision={revision}
        open={publishOpen}
        onOpenChange={(open) => {
          setPublishOpen(open);
          if (!open) publishFocus.restore();
        }}
      />
    </>
  );
}
