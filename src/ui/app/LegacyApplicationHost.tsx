import { useEffect, useState } from "react";

interface LegacyShell {
  destroy(): void;
}

interface LegacyShellModule {
  createAppShell(options: {
    window: unknown;
    document: Document;
    fetch: typeof fetch;
  }): LegacyShell;
}

interface ReactBootstrapWindow extends Window {
  __BASE_REACT_APP_HOST__?: boolean;
}

export function LegacyApplicationHost() {
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let shell: LegacyShell | undefined;
    const hostWindow = window as ReactBootstrapWindow;
    hostWindow.__BASE_REACT_APP_HOST__ = true;

    import(/* @vite-ignore */ "/app-shell.js")
      .then((module: LegacyShellModule) => {
        if (cancelled) return;
        shell = module.createAppShell({
          window,
          document,
          fetch: window.fetch.bind(window),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setBootError(
            "The application shell could not start. Refresh and try again.",
          );
        }
      });

    return () => {
      cancelled = true;
      shell?.destroy();
      delete hostWindow.__BASE_REACT_APP_HOST__;
    };
  }, []);

  return (
    <div className="react-app-host">
      <div id="app" className="app-root" aria-busy="true">
        <main id="main-content" className="app-boot" tabIndex={-1}>
          <p className="eyebrow">BASE Office Forms</p>
          <h1>{bootError || "Loading workspace…"}</h1>
          {bootError ? (
            <p>Refresh the page to retry the application shell.</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
