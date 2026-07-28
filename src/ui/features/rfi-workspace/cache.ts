/*
 * Cache invalidation for RFI lifecycle changes.
 *
 * Mark ready, return to draft, and official issue all change what the register
 * row, the dashboard counters, and the project overview should say, so every one
 * of those surfaces is invalidated from one place rather than each caller
 * remembering a different subset. Nothing is patched optimistically: the RFI
 * number, status, and issued evidence are only ever read back from the server.
 */

import type { QueryClient } from "@tanstack/react-query";
import {
  dashboardQueryKey,
  projectOverviewQueryKey,
} from "../../app/queryKeys";
import { projectRfisQueryKey } from "../rfis/useProjectRfis";
import { rfiWorkspaceQueryKey } from "./useRfiWorkspace";

export async function invalidateRfiLifecycleCaches(
  queryClient: QueryClient,
  projectId: string,
  rfiId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: rfiWorkspaceQueryKey(projectId, rfiId),
    }),
    queryClient.invalidateQueries({
      queryKey: projectRfisQueryKey(projectId),
    }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: projectOverviewQueryKey(projectId),
    }),
  ]);
}
