/*
 * Global navigation and account summary, reproducing the legacy shell's sidebar
 * and drawer structure so the established app-shell.css styling and responsive
 * thresholds apply unchanged. Dashboard, Projects, and Administration are SPA
 * destinations (AppLink); Studio and Document Library are plain links to the
 * pre-existing pages that live outside the SPA, so they carry no active state.
 */

import { AppLink } from "./AppLink";
import { ShellIcon, type ShellIconName } from "./ShellIcon";
import { readableRole } from "./routing";
import type { GlobalSection } from "./routing";
import type { SessionSnapshot } from "./types";

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ShellIconName;
  active: boolean;
}) {
  return (
    <AppLink
      className={`app-nav-link${active ? " is-active" : ""}`}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      <ShellIcon name={icon} />
      <span>{label}</span>
    </AppLink>
  );
}

function ExternalNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ShellIconName;
}) {
  return (
    <a className="app-nav-link" href={href}>
      <ShellIcon name={icon} />
      <span>{label}</span>
    </a>
  );
}

export function Navigation({
  variant,
  activeSection,
  showAdministration,
}: {
  variant: "desktop" | "mobile";
  activeSection: GlobalSection | undefined;
  showAdministration: boolean;
}) {
  return (
    <nav
      className={`app-navigation app-navigation-${variant}`}
      aria-label="Application navigation"
    >
      <div className="app-nav-primary">
        <NavLink
          href="/dashboard"
          label="Dashboard"
          icon="dashboard"
          active={activeSection === "dashboard"}
        />
        <NavLink
          href="/projects"
          label="Projects"
          icon="projects"
          active={activeSection === "projects"}
        />
        <ExternalNavLink href="/builder" label="Studio" icon="form" />
        <ExternalNavLink
          href="/library"
          label="Document Library"
          icon="library"
        />
      </div>
      {showAdministration ? (
        <div className="app-nav-group app-nav-admin">
          <p className="app-nav-label">Administrative</p>
          <NavLink
            href="/admin"
            label="Administration"
            icon="admin"
            active={activeSection === "admin"}
          />
        </div>
      ) : null}
    </nav>
  );
}

export function AccountSummary({ session }: { session: SessionSnapshot }) {
  if (session.status === "loading") {
    return (
      <div className="account-summary" aria-busy="true">
        <span className="account-mark" aria-hidden="true" />
        <div>
          <strong>Loading account</strong>
          <small>Please wait</small>
        </div>
      </div>
    );
  }
  if (session.status !== "ready") {
    return (
      <div className="account-summary">
        <span className="account-mark" aria-hidden="true">
          B
        </span>
        <div>
          <strong>BASE workspace</strong>
          <small>Session unavailable</small>
        </div>
      </div>
    );
  }
  const organization = session.data?.organization?.name || "BASE workspace";
  const role = readableRole(session.data?.membership?.role);
  return (
    <div className="account-summary">
      <span className="account-mark" aria-hidden="true">
        B
      </span>
      <div>
        <strong>{organization}</strong>
        <small>{role}</small>
      </div>
    </div>
  );
}
