/*
 * The React application shell. It owns global composition — navigation, the
 * mobile drawer, session/organization and project context, project tabs, page
 * containers, focus management, and route announcements — and mounts
 * not-yet-migrated feature screens through the compatibility bridge.
 *
 * Parity with the legacy shell is deliberate: the DOM structure and class names
 * match public/app-shell.js so the established app-shell.css styling,
 * responsive thresholds, and heading-focus contract are preserved, while the
 * composition, routing, and data flow now run through React, React Router, and
 * TanStack Query. Canonical URLs, query/hash preservation, browser
 * back/forward, safe 403/404 handling, descendant project-tab selection, the
 * drawer focus trap and restoration, and server-derived authorization all
 * behave as before.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { AppLink } from "./AppLink";
import { Navigation, AccountSummary } from "./Navigation";
import { ProjectHeader, ProjectTabs } from "./ProjectChrome";
import { ShellIcon } from "./ShellIcon";
import { ShellProvider, type ShellBridge } from "./ShellContext";
import { LegacyFeatureMount } from "./LegacyFeatureMount";
import { RfiRegisterFeature } from "../features/rfis/RfiRegisterFeature";
import { ProjectsRegisterFeature } from "../features/projects/ProjectsRegisterFeature";
import { RecordsRegisterFeature } from "../features/records/RecordsRegisterFeature";
import { RecordWorkspaceFeature } from "../features/record-workspace/RecordWorkspaceFeature";
import { RevisionWorkspaceFeature } from "../features/record-workspace/RevisionWorkspaceFeature";
import { RfiWorkspaceFeature } from "../features/rfi-workspace/RfiWorkspaceFeature";
import {
  LoadingState,
  SessionErrorState,
  ErrorState,
  NotFoundState,
  PlaceholderRoute,
} from "./RouteStates";
import { useSession } from "./useSession";
import { useProject } from "./useProject";
import {
  canViewAdministration,
  featureDescriptor,
  resolveRoute,
  type ResolvedRoute,
} from "./routing";
import type { SessionSnapshot, ShellRuntime } from "./types";

const LOGO = "/assets/base-logo.svg?v=20260718";

export function AppLayout({ runtime }: { runtime: ShellRuntime }) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const session = useSession();

  const resolution = resolveRoute(location.pathname);
  const redirectTo =
    resolution && "redirectTo" in resolution ? resolution.redirectTo : null;
  const route: ResolvedRoute =
    resolution && !("redirectTo" in resolution)
      ? resolution
      : {
          id: "not-found",
          title: "Page not found",
          eyebrow: "BASE Office Forms",
          description: "The requested page is not available.",
          pathname: location.pathname,
          params: {},
          surface: "not-found",
        };

  const projectId = redirectTo ? undefined : route.params.projectId;
  const sessionReady = session.status === "ready";
  // Project-context revalidation is keyed on the route's normalized pathname
  // only (not search/hash): a "meaningful" navigation between routes always
  // re-confirms authorization (matching the legacy shell's unconditional
  // per-navigate project reload), while a query/hash-only change on the same
  // route is not, by itself, a reason to distrust the already-confirmed
  // project. See useProject.ts.
  const project = useProject(projectId, sessionReady, route.pathname);
  // Same-route URL-history parity for compatibility-mounted feature
  // controllers: includes search/hash so LegacyFeatureMount can tell a legacy
  // controller (e.g. records-view.js, rfis-view.js) to reread URL-derived
  // filter/sort state without recreating it. See LegacyFeatureMount.tsx.
  const locationKey = `${route.pathname}${location.search}${location.hash}`;

  // Refs the bridge and focus manager read without re-subscribing.
  const mainRef = useRef<HTMLElement>(null);
  const announcerRef = useRef<HTMLParagraphElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const focusPendingRef = useRef(false);
  const firstRenderRef = useRef(true);
  const routeTitleRef = useRef(route.title);
  routeTitleRef.current = route.title;
  const sessionRef = useRef<SessionSnapshot>(session);
  sessionRef.current = {
    status: session.status,
    data: session.data,
    error: session.error,
  };

  const [drawerOpen, setDrawerOpen] = useState(false);

  const announce = useCallback((message: string) => {
    if (announcerRef.current) announcerRef.current.textContent = message;
  }, []);

  const getSession = useCallback(() => sessionRef.current, []);

  const attemptFocus = useCallback(() => {
    if (!focusPendingRef.current) return;
    const main = mainRef.current;
    if (!main) return;
    const heading = main.querySelector<HTMLElement>(
      "#page-title, .project-context-header h1, .route-state h1",
    );
    if (!heading) return;
    heading.focus({ preventScroll: true });
    announce(`${routeTitleRef.current} loaded`);
    main
      .querySelector<HTMLElement>(".project-tabs [aria-current='page']")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
    focusPendingRef.current = false;
  }, [announce]);

  const requestHeadingFocus = useCallback(() => {
    attemptFocus();
  }, [attemptFocus]);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setDrawerOpen((open) => {
      if (open && restoreFocus) menuButtonRef.current?.focus();
      return false;
    });
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const navigate = useCallback(
    (href: string, options?: { replace?: boolean; focus?: boolean }) => {
      const target = new URL(href, window.location.href);
      if (target.origin !== window.location.origin) {
        window.location.assign(target.href);
        return;
      }
      closeDrawer(false);
      void routerNavigate(`${target.pathname}${target.search}${target.hash}`, {
        replace: options?.replace,
      });
    },
    [closeDrawer, routerNavigate],
  );

  const bridge = useMemo<ShellBridge>(
    () => ({ runtime, navigate, announce, getSession, requestHeadingFocus }),
    [runtime, navigate, announce, getSession, requestHeadingFocus],
  );

  // Route-change focus: match the legacy shell, which moves focus to the page
  // heading on navigation and popstate but not on the initial load or during a
  // redirect. The heading may be rendered asynchronously by a feature mount, in
  // which case the mount calls requestHeadingFocus once its heading exists.
  useLayoutEffect(() => {
    if (redirectTo) return;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    focusPendingRef.current = true;
    attemptFocus();
  }, [location.key, redirectTo, attemptFocus]);

  // Document title tracks the active route, like the legacy shell.
  useEffect(() => {
    document.title = `${route.title} | BASE Office Forms`;
  }, [route.title]);

  // Mobile drawer: body scroll lock, focus into the drawer, and a focus trap.
  useEffect(() => {
    if (!drawerOpen) {
      document.body.classList.remove("mobile-nav-open");
      return;
    }
    document.body.classList.add("mobile-nav-open");
    closeButtonRef.current?.focus();

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer(true);
        return;
      }
      if (event.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const items = [
        ...drawer.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ),
      ].filter((item) => !item.hidden);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.body.classList.remove("mobile-nav-open");
    };
  }, [drawerOpen, closeDrawer]);

  // Leaving the mobile breakpoint drops the drawer without restoring focus to
  // the now-hidden trigger, matching the legacy viewport behavior.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 620px)");
    const onChange = () => {
      if (!query.matches) closeDrawer(false);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, [closeDrawer]);

  if (redirectTo) {
    return (
      <Navigate
        to={{
          pathname: redirectTo,
          search: location.search,
          hash: location.hash,
        }}
        replace
      />
    );
  }

  const showAdministration = canViewAdministration(
    session.data?.membership?.role,
  );

  function sessionGate(label: string): ReactNode | null {
    if (session.status === "loading") return <LoadingState label={label} />;
    if (session.status === "error")
      return (
        <SessionErrorState error={session.error} onRetry={session.retry} />
      );
    return null;
  }

  function renderRouteContent(): ReactNode {
    if (route.requiresAdministration) {
      const gate = sessionGate("Checking administration access");
      if (gate) return gate;
      if (!showAdministration) return <NotFoundState />;
    }
    if (route.surface === "not-found") {
      return (
        <NotFoundState title={route.title} description={route.description} />
      );
    }
    if (route.id === "dashboard") {
      const gate = sessionGate("Loading dashboard");
      if (gate) return gate;
      return (
        <LegacyFeatureMount
          key="dashboard"
          descriptor={{ key: "dashboard", kind: "dashboard" }}
          locationKey={locationKey}
        />
      );
    }
    if (route.id === "projects") {
      const gate = sessionGate("Loading projects");
      if (gate) return gate;
      return <ProjectsRegisterFeature />;
    }
    if (projectId) {
      const gate = sessionGate("Loading project");
      if (gate) return gate;
      if (project.status === "missing") {
        return (
          <NotFoundState
            title="Project not found"
            description="The project is unavailable or you do not have access to it."
          />
        );
      }
      if (project.status === "error") {
        return (
          <ErrorState
            title="Project context unavailable"
            description="No changes were made. Check your connection and try again."
            requestId={project.requestId}
            onRetry={project.retry}
          />
        );
      }
      const descriptor = featureDescriptor(route);
      // The feature controller mounts (and issues its own request) only once
      // the project context has resolved, so a project the user cannot access
      // never triggers a feature request. While the project loads, the header
      // shows a factual loading context and the content shows a loading state.
      let content: ReactNode;
      if (project.status !== "ready") {
        content = <LoadingState label="Loading project" />;
      } else if (route.id === "project-rfis") {
        // The RFI register is the first native React feature route (UI-5).
        content = <RfiRegisterFeature key={projectId} projectId={projectId} />;
      } else if (route.id === "project-records") {
        // The Document Register is native from UI-6B.
        content = (
          <RecordsRegisterFeature key={projectId} projectId={projectId} />
        );
      } else if (route.id === "record-detail" && route.params.recordId) {
        // UI-7: the three detail workspaces are native. Each is keyed by its
        // full identity so navigating between records, revisions, or RFIs
        // never reuses the previous one's component state.
        content = (
          <RecordWorkspaceFeature
            key={`${projectId}:${route.params.recordId}`}
            projectId={projectId}
            recordId={route.params.recordId}
          />
        );
      } else if (
        route.id === "revision-detail" &&
        route.params.recordId &&
        route.params.revisionId
      ) {
        content = (
          <RevisionWorkspaceFeature
            key={`${projectId}:${route.params.recordId}:${route.params.revisionId}`}
            projectId={projectId}
            recordId={route.params.recordId}
            revisionId={route.params.revisionId}
          />
        );
      } else if (route.id === "rfi-workspace" && route.params.rfiId) {
        content = (
          <RfiWorkspaceFeature
            key={`${projectId}:${route.params.rfiId}`}
            projectId={projectId}
            rfiId={route.params.rfiId}
          />
        );
      } else if (descriptor) {
        content = (
          <LegacyFeatureMount
            key={descriptor.key}
            descriptor={descriptor}
            locationKey={locationKey}
          />
        );
      } else {
        content = <PlaceholderRoute route={route} />;
      }
      return (
        <>
          <ProjectHeader projectId={projectId} project={project} />
          <ProjectTabs projectId={projectId} route={route} />
          <div className="project-route-content">{content}</div>
        </>
      );
    }
    return <PlaceholderRoute route={route} />;
  }

  return (
    <ShellProvider value={bridge}>
      <div className="app-root">
        <aside className="app-sidebar" inert={drawerOpen}>
          <AppLink
            className="sidebar-brand"
            href="/dashboard"
            aria-label="BASE Office Forms dashboard"
          >
            <img src={LOGO} alt="BASE" />
            <span>Office Forms</span>
          </AppLink>
          <Navigation
            variant="desktop"
            activeSection={route.globalSection}
            showAdministration={showAdministration}
          />
          <AccountSummary session={session} />
        </aside>

        <header className="mobile-app-header">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="mobile-navigation"
            aria-expanded={drawerOpen}
            onClick={openDrawer}
            ref={menuButtonRef}
          >
            <ShellIcon name="menu" />
          </button>
          <AppLink
            className="mobile-brand"
            href="/dashboard"
            aria-label="BASE Office Forms dashboard"
          >
            <img src={LOGO} alt="BASE" />
          </AppLink>
          <span className="mobile-context">{route.title}</span>
        </header>
        <div className="mobile-nav-layer" hidden={!drawerOpen}>
          <button
            className="mobile-nav-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => {
              closeDrawer(true);
            }}
          />
          <aside
            id="mobile-navigation"
            className="mobile-nav-drawer"
            aria-label="Mobile navigation"
            aria-hidden={!drawerOpen}
            ref={drawerRef}
          >
            <div className="mobile-nav-head">
              <div>
                <p className="app-eyebrow">BASE Office Forms</p>
                <strong>Workspace navigation</strong>
              </div>
              <button
                className="mobile-nav-close"
                type="button"
                aria-label="Close navigation"
                onClick={() => {
                  closeDrawer(true);
                }}
                ref={closeButtonRef}
              >
                <ShellIcon name="close" />
              </button>
            </div>
            <Navigation
              variant="mobile"
              activeSection={route.globalSection}
              showAdministration={showAdministration}
            />
            <AccountSummary session={session} />
          </aside>
        </div>

        <main
          id="main-content"
          className="app-main"
          tabIndex={-1}
          inert={drawerOpen}
          ref={mainRef}
        >
          {renderRouteContent()}
        </main>
        <p
          className="sr-only"
          id="route-announcer"
          aria-live="polite"
          aria-atomic="true"
          ref={announcerRef}
        />
      </div>
    </ShellProvider>
  );
}
