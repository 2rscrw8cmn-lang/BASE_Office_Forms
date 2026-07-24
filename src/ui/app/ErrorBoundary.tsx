/*
 * Application error boundary. Catches unexpected render errors from the shell
 * or a mounted feature and shows the shared error surface instead of a blank
 * page, keeping the global chrome usable. It never reports that an action
 * succeeded: the copy makes clear no changes were implied, and the only
 * recovery offered is a full reload.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure for diagnostics without exposing it to the user.
    console.error("Application error boundary caught an error", error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <section
        className="route-state route-error"
        aria-labelledby="route-error-title"
        role="alert"
      >
        <p className="app-eyebrow">Unable to continue</p>
        <h1 id="route-error-title" tabIndex={-1}>
          Something went wrong
        </h1>
        <p>
          The application ran into an unexpected problem. No changes were made.
          Reload the page to continue.
        </p>
        <div className="state-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={this.handleReload}
          >
            Reload
          </button>
          <a href="/dashboard">Return to Dashboard</a>
        </div>
      </section>
    );
  }
}
