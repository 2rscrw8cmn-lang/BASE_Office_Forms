/*
 * Application-level query keys for read models that more than one feature must
 * be able to invalidate.
 *
 * The Work Dashboard and Project Overview are still compatibility-mounted
 * (`public/dashboard-view.js`, `public/project-overview-view.js`) and are
 * remounted — and therefore refetched — by `LegacyFeatureMount` whenever the
 * route is entered, so they cannot show a stale ready-to-issue or active-RFI
 * count today. These keys are the single place their React read models will be
 * registered in UI-8; lifecycle actions invalidate them now so the migration
 * inherits correct invalidation instead of having to rediscover every writer.
 */

export function dashboardQueryKey() {
  return ["dashboard"] as const;
}

export function projectOverviewQueryKey(projectId: string) {
  return ["project-overview", projectId] as const;
}
