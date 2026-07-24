/*
 * Shared route-level state surfaces, reproducing the legacy shell markup and
 * class names so app-shell.css styling, and the shell's heading-focus selector
 * (`#page-title, .project-context-header h1, .route-state h1`), keep working.
 */

import { AppLink } from "./AppLink";
import type { ResolvedRoute } from "./routing";
import type { SessionError } from "./types";

export function LoadingState({ label = "Loading page" }: { label?: string }) {
  return (
    <section
      className="route-state route-loading"
      aria-busy="true"
      aria-label={label}
    >
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-medium" />
    </section>
  );
}

export function SessionErrorState({
  error,
  onRetry,
}: {
  error: SessionError | null;
  onRetry: () => void;
}) {
  const message =
    error?.message ||
    "Your session could not be verified. No changes were made.";
  return (
    <section
      className="route-state route-error"
      aria-labelledby="route-error-title"
      role="alert"
    >
      <p className="app-eyebrow">Unable to continue</p>
      <h1 id="route-error-title" tabIndex={-1}>
        Session unavailable
      </h1>
      <p>{message}</p>
      {error?.code ? (
        <p className="error-code">
          Error code <code>{error.code}</code>
        </p>
      ) : null}
      {error?.requestId ? (
        <p className="request-id">
          Request ID <code>{error.requestId}</code>
        </p>
      ) : null}
      <div className="state-actions">
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}

export function ErrorState({
  title,
  description,
  requestId = "",
  onRetry,
}: {
  title: string;
  description: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <section
      className="route-state route-error"
      aria-labelledby="route-error-title"
    >
      <p className="app-eyebrow">Unable to continue</p>
      <h1 id="route-error-title" tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
      {requestId ? (
        <p className="request-id">
          Request ID <code>{requestId}</code>
        </p>
      ) : null}
      <div className="state-actions">
        {onRetry ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <AppLink href="/dashboard">Return to Dashboard</AppLink>
      </div>
    </section>
  );
}

export function NotFoundState({
  title = "Page not found",
  description = "The requested page is not available.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section
      className="route-state route-not-found"
      aria-labelledby="not-found-title"
    >
      <p className="app-eyebrow">BASE Office Forms</p>
      <h1 id="not-found-title" tabIndex={-1}>
        {title}
      </h1>
      <p>{description}</p>
      <div className="state-actions">
        <AppLink className="primary-button" href="/dashboard">
          Go to Dashboard
        </AppLink>
        <AppLink href="/projects">Browse Projects</AppLink>
      </div>
    </section>
  );
}

export function PlaceholderRoute({ route }: { route: ResolvedRoute }) {
  const withinProject = Boolean(route.params.projectId);
  const Heading = withinProject ? "h2" : "h1";
  return (
    <section className="route-placeholder" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="app-eyebrow">{route.eyebrow}</p>
          <Heading id="page-title" tabIndex={-1}>
            {route.title}
          </Heading>
          <p>{route.description}</p>
        </div>
      </div>
      <div className="placeholder-panel">
        <div className="placeholder-rule" aria-hidden="true" />
        <p className="placeholder-label">Planned route</p>
        <code>{route.pathname}</code>
        <p>{route.placeholderNote}</p>
      </div>
    </section>
  );
}
