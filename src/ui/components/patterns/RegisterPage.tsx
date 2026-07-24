import type { ReactNode } from "react";
import { cx } from "../util/cx";
import { PageHeader, type PageHeaderProps } from "./PageHeader";
import { Spinner } from "../primitives/Spinner";

export type RegisterStatus =
  "loading" | "populated" | "empty-first-use" | "empty-filtered" | "error";

export interface RegisterPageProps {
  header: PageHeaderProps;
  toolbar?: ReactNode;
  status: RegisterStatus;
  /** Register surface when populated. */
  children?: ReactNode;
  /** Slot for the matching state component per status. */
  emptyFirstUse?: ReactNode;
  emptyFiltered?: ReactNode;
  error?: ReactNode;
  loadingLabel?: string;
  className?: string;
}

/**
 * The register page pattern: a page header, a register toolbar, and a register
 * surface that renders exactly one of the required interaction states. A feature
 * builds a standard register by supplying data and the per-status slots — it
 * does not reinvent the header/toolbar/state scaffolding or add global CSS.
 */
export function RegisterPage({
  header,
  toolbar,
  status,
  children,
  emptyFirstUse,
  emptyFiltered,
  error,
  loadingLabel = "Loading…",
  className,
}: RegisterPageProps) {
  return (
    <div className={cx("base-register-page", className)}>
      <PageHeader {...header} />
      {toolbar}
      <div className="base-register-page__surface" data-status={status}>
        {status === "loading" ? (
          <div className="base-register-page__loading">
            <Spinner label={loadingLabel} />
          </div>
        ) : null}
        {status === "populated" ? children : null}
        {status === "empty-first-use" ? emptyFirstUse : null}
        {status === "empty-filtered" ? emptyFiltered : null}
        {status === "error" ? error : null}
      </div>
    </div>
  );
}
