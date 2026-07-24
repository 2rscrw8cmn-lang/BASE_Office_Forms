import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  PROJECT_STATUS_VOCABULARY,
  RegisterPage,
  RegisterToolbar,
  Select,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ProjectsCards } from "./ProjectsCards";
import { ProjectsTable, projectOverviewHref } from "./ProjectsTable";
import {
  applyProjectFilters,
  filtersFromSearchParams,
  hasProjectFilters,
  normalizeStatusFilter,
  statusOptions,
  type ProjectFilters,
} from "./urlState";
import { useProjects } from "./useProjects";
import "./projects.css";

export function ProjectsRegisterFeature() {
  const location = useLocation();
  const navigate = useNavigate();
  const shell = useShell();
  const state = useProjects();
  const projects = state.status === "ready" ? state.data.projects : [];
  const availableStatuses = useMemo(() => statusOptions(projects), [projects]);
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const requestedFilters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );
  const filters = useMemo(
    () => normalizeStatusFilter(requestedFilters, availableStatuses),
    [requestedFilters, availableStatuses],
  );

  useEffect(() => {
    if (state.status !== "ready") return;
    const requestedStatus = searchParams.get("status");
    if (requestedStatus && filters.status === "all") {
      const normalized = new URLSearchParams(location.search);
      normalized.delete("status");
      void navigate(
        {
          pathname: location.pathname,
          search: normalized.toString() ? `?${normalized.toString()}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [
    filters.status,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    searchParams,
    state.status,
  ]);

  const updateFilters = (patch: Partial<ProjectFilters>, push: boolean) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams(location.search);
    if (next.q) params.set("q", next.q);
    else params.delete("q");
    if (next.status !== "all") params.set("status", next.status);
    else params.delete("status");
    void navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
        hash: location.hash,
      },
      { replace: !push },
    );
  };

  const clearFilters = () => {
    updateFilters({ q: "", status: "all" }, true);
    shell.announce("Project filters cleared.");
  };

  const header = {
    title: "Projects",
    headingId: "page-title",
    headingTabIndex: -1,
    primaryAction:
      state.status === "ready" && state.data.capabilities.createProject ? (
        <CreateProjectDialog
          onCreated={(project) => {
            shell.navigate(projectOverviewHref(project.id));
          }}
        />
      ) : undefined,
  };

  if (state.status === "loading") {
    return (
      <RegisterPage
        className="projects-register-page"
        header={header}
        status="loading"
        loadingLabel="Loading projects"
      />
    );
  }

  if (state.status === "error") {
    return (
      <RegisterPage
        className="projects-register-page"
        header={header}
        status="error"
        error={
          <ErrorState
            title="Unable to load projects"
            description="The projects could not be loaded. No changes were made."
            requestId={state.requestId}
            onRetry={state.retry}
          />
        }
      />
    );
  }

  const filtered = applyProjectFilters(projects, filters);
  const hasFilters = hasProjectFilters(filters);
  const activeFilterCount = filters.status === "all" ? 0 : 1;
  let chips: ReactNode;
  if (hasFilters) {
    chips = (
      <>
        {filters.status !== "all" ? (
          <FilterChip
            label="Status"
            value={PROJECT_STATUS_VOCABULARY[filters.status].label}
            onRemove={() => {
              updateFilters({ status: "all" }, true);
            }}
          />
        ) : null}
        <Button
          variant="ghost"
          size="compact"
          data-clear-filters
          onClick={clearFilters}
        >
          Clear
        </Button>
      </>
    );
  }

  const toolbar =
    projects.length > 0 ? (
      <RegisterToolbar
        searchValue={filters.q}
        onSearchChange={(q) => {
          updateFilters({ q }, false);
        }}
        searchLabel="Search projects"
        searchPlaceholder="Search project name or number…"
        mobileFilterDisclosure={{
          activeCount: activeFilterCount,
          label: "filters",
        }}
        filters={
          <Field label="Status" hideLabel controlId="projects-status-filter">
            <Select
              size="compact"
              value={filters.status}
              onChange={(event) => {
                updateFilters(
                  { status: event.target.value as ProjectFilters["status"] },
                  true,
                );
              }}
            >
              <option value="all">All statuses</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_VOCABULARY[status].label}
                </option>
              ))}
            </Select>
          </Field>
        }
        chips={chips}
        resultCount={
          hasFilters
            ? `${String(filtered.length)} of ${String(projects.length)} projects`
            : `${String(projects.length)} project${projects.length === 1 ? "" : "s"}`
        }
      />
    ) : undefined;

  if (projects.length === 0) {
    return (
      <RegisterPage
        className="projects-register-page"
        header={header}
        status="empty-first-use"
        emptyFirstUse={
          <EmptyState
            variant="first-use"
            icon="building"
            title="No projects are available to you yet."
            description="Projects you are authorized to access will appear here."
          />
        }
      />
    );
  }

  return (
    <RegisterPage
      className="projects-register-page"
      header={header}
      toolbar={toolbar}
      status={filtered.length > 0 ? "populated" : "empty-filtered"}
      emptyFiltered={
        <EmptyState
          variant="filtered"
          title="No projects match the current search or status filter."
          action={
            <Button
              variant="secondary"
              data-clear-filters
              onClick={clearFilters}
            >
              Clear
            </Button>
          }
        />
      }
    >
      {state.refreshing ? (
        <p className="base-sr-only" aria-live="polite">
          Refreshing projects.
        </p>
      ) : null}
      <ProjectsTable
        projects={filtered}
        onNavigate={(href) => {
          shell.navigate(href);
        }}
      />
      <ProjectsCards projects={filtered} />
    </RegisterPage>
  );
}
