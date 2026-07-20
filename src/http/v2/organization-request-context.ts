import type { AppSession } from "../../auth/authentication-adapter";
import type { ApiRequestContext } from "../api-response";

/** Request-scoped tenant context derived exclusively from an authenticated membership. */
export interface OrganizationRequestContext extends ApiRequestContext {
  session: AppSession;
  organizationId: string;
}

export function createOrganizationRequestContext(
  requestContext: ApiRequestContext,
  session: AppSession,
): OrganizationRequestContext {
  return {
    ...requestContext,
    session,
    organizationId: session.organizationId,
  };
}
