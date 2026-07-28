/*
 * The RFI response.
 *
 * Response content is a separate collection from the question and is never
 * merged into it: this panel is its own workspace section, below the RFI
 * content, and the question stays exactly as it was asked.
 *
 * The editor appears only when the server says `capabilities.recordResponse`
 * (which requires the RFI to be in a state that can receive one); everything
 * else renders the recorded response read-only, including the cost and schedule
 * impacts that came back with it.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Field,
  Icon,
  MetadataStrip,
  SaveIndicator,
  TextArea,
  TextInput,
  type SaveState,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { recordRfiResponse, RfiWorkspaceApiError } from "./api";
import { formatDate } from "./format";
import { rfiWorkspaceQueryKey } from "./useRfiWorkspace";
import type { RfiWorkspaceModel } from "./types";

/** Statuses in which a response is expected to exist or to be recordable. */
const ISSUED_STATUSES = new Set([
  "open",
  "response_received",
  "returned_for_clarification",
  "closed",
]);

export function shouldShowResponse(data: RfiWorkspaceModel): boolean {
  return (
    data.capabilities.recordResponse ||
    data.responses.length > 0 ||
    ISSUED_STATUSES.has(data.rfi.status)
  );
}

export function RfiResponsePanel({
  projectId,
  data,
}: {
  projectId: string;
  data: RfiWorkspaceModel;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const [response, setResponse] = useState("");
  const [respondedBy, setRespondedBy] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [failure, setFailure] = useState<{
    message: string;
    requestId: string;
  } | null>(null);

  const latest = data.responses.at(-1) ?? null;

  const recorded = latest ? (
    <div className="rfi-workspace-response" data-recorded-response>
      <p className="rfi-workspace-response__text">{latest.response}</p>
      <MetadataStrip
        items={[
          {
            label: "Responder",
            value: latest.respondedBy || "Not recorded",
          },
          {
            label: "Returned",
            value: formatDate(latest.createdAt) || "—",
            mono: true,
          },
          {
            label: "Cost impact",
            value: data.rfi.costImpact || "Not recorded",
          },
          {
            label: "Schedule impact",
            value: data.rfi.scheduleImpact || "Not recorded",
          },
        ]}
      />
    </div>
  ) : (
    <p className="rfi-workspace-empty-value" data-no-response>
      No response has been recorded.
    </p>
  );

  if (!data.capabilities.recordResponse) {
    return recorded;
  }

  return (
    <>
      {latest ? recorded : null}
      <form
        className="rfi-workspace-form"
        noValidate
        aria-busy={saveState === "saving" || undefined}
        data-response-form
        onSubmit={(event) => {
          event.preventDefault();
          if (saveState === "saving") return;
          const text = response.trim();
          if (!text) {
            setError("A response is required.");
            shell.announce("A response is required.");
            return;
          }
          setError(undefined);
          setFailure(null);
          setSaveState("saving");
          void (async () => {
            try {
              await recordRfiResponse(projectId, data.rfi.id, {
                response: text,
                respondedBy: respondedBy.trim() || null,
              });
              await queryClient.invalidateQueries({
                queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
              });
              setSaveState("saved");
              setResponse("");
              setRespondedBy("");
              shell.announce("Response recorded.");
            } catch (caught) {
              const status =
                caught instanceof RfiWorkspaceApiError ? caught.status : 0;
              if (status === 409) {
                await queryClient.invalidateQueries({
                  queryKey: rfiWorkspaceQueryKey(projectId, data.rfi.id),
                });
                setSaveState("conflict");
                shell.announce(
                  "This RFI changed elsewhere. The latest values were loaded; review and retry.",
                );
                return;
              }
              setSaveState("failed");
              setFailure({
                message:
                  caught instanceof RfiWorkspaceApiError
                    ? caught.message
                    : "The response could not be recorded.",
                requestId:
                  caught instanceof RfiWorkspaceApiError
                    ? caught.requestId
                    : "",
              });
              shell.announce("The response could not be recorded.");
            }
          })();
        }}
      >
        <fieldset
          className="rfi-workspace-fieldset"
          disabled={saveState === "saving"}
        >
          <legend className="base-sr-only">Record a response</legend>
          <Field label="Response" required error={error}>
            <TextArea
              rows={4}
              value={response}
              data-response-text
              onChange={(event) => {
                setResponse(event.target.value);
                setError(undefined);
                setSaveState("idle");
              }}
            />
          </Field>
          <Field label="Responder" help="Optional.">
            <TextInput
              value={respondedBy}
              autoComplete="off"
              data-response-by
              onChange={(event) => {
                setRespondedBy(event.target.value);
              }}
            />
          </Field>
        </fieldset>

        <div className="rfi-workspace-form__actions">
          <Button
            type="submit"
            variant="primary"
            loading={saveState === "saving"}
            data-submit-response
          >
            Submit response
          </Button>
          <SaveIndicator state={saveState} />
        </div>

        {failure ? (
          <div className="rfi-workspace-error" role="alert">
            <Icon name="circle-alert" size={16} />
            <div>
              <p>{failure.message}</p>
              <p>No response was recorded.</p>
              {failure.requestId ? (
                <p className="rfi-workspace-request-id">
                  Request ID <code>{failure.requestId}</code>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}
