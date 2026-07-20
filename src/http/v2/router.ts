import type { AuthenticationResult } from "../../auth/authentication-adapter";
import { AuthorizationError } from "../../domain/identity/authorization";
import {
  apiError,
  apiSuccess,
  createApiRequestContext,
  type ApiRequestContext,
} from "../api-response";
import type { V2RouteDependencies } from "./dependencies";
import {
  createOrganizationRequestContext,
  type OrganizationRequestContext,
} from "./organization-request-context";

const V2_BASE_PATH = "/api/v2";

export async function routeV2Request(
  request: Request,
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const context = createApiRequestContext();
  const { pathname } = new URL(request.url);

  if (pathname === `${V2_BASE_PATH}/health`) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return apiError(
        context,
        405,
        "METHOD_NOT_ALLOWED",
        "This route only supports GET and HEAD.",
      );
    }

    const response = apiSuccess(context, { status: "ok", apiVersion: "v2" });
    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }
    return response;
  }

  if (pathname === `${V2_BASE_PATH}/session`) {
    return handleSession(request, context, dependencies);
  }

  if (pathname === `${V2_BASE_PATH}/organizations/current`) {
    return handleCurrentOrganization(request, context, dependencies);
  }

  if (pathname === `${V2_BASE_PATH}/members`) {
    return handleMembers(request, context, dependencies);
  }

  return apiError(
    context,
    404,
    "API_ROUTE_NOT_FOUND",
    "The requested API route was not found.",
  );
}

async function handleSession(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
): Promise<Response> {
  const session = await authenticateGetRequest(request, context, dependencies);
  if (session instanceof Response) {
    return session;
  }
  if (!dependencies) {
    return apiError(
      context,
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is not configured.",
    );
  }
  const organization = await dependencies.organizations.getCurrentOrganization(
    session.session,
  );
  if (!organization) {
    return apiError(
      context,
      404,
      "ORGANIZATION_NOT_FOUND",
      "The current organization was not found.",
    );
  }
  return apiSuccess(context, {
    user: { id: session.session.userId },
    organization: serializeOrganization(organization),
    membership: { role: session.session.membershipRole },
    projectPermissions: session.session.projectPermissions,
  });
}

async function handleCurrentOrganization(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
): Promise<Response> {
  const session = await authenticateGetRequest(request, context, dependencies);
  if (session instanceof Response) {
    return session;
  }
  if (!dependencies) {
    return apiError(
      context,
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is not configured.",
    );
  }
  const organization = await dependencies.organizations.getCurrentOrganization(
    session.session,
  );
  if (!organization) {
    return apiError(
      context,
      404,
      "ORGANIZATION_NOT_FOUND",
      "The current organization was not found.",
    );
  }
  return apiSuccess(context, serializeOrganization(organization));
}

async function handleMembers(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
): Promise<Response> {
  const session = await authenticateGetRequest(request, context, dependencies);
  if (session instanceof Response) {
    return session;
  }
  if (!dependencies) {
    return apiError(
      context,
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is not configured.",
    );
  }
  try {
    const members =
      await dependencies.organizations.listCurrentOrganizationMembers(
        session.session,
      );
    return apiSuccess(
      context,
      members.map((member) => ({
        id: member.id,
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
        role: member.role,
        status: member.status,
        createdAt: member.createdAt,
      })),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return apiError(
        context,
        403,
        "AUTHORIZATION_DENIED",
        "You are not allowed to access this resource.",
      );
    }
    throw error;
  }
}

async function authenticateGetRequest(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
): Promise<OrganizationRequestContext | Response> {
  if (request.method !== "GET") {
    return apiError(
      context,
      405,
      "METHOD_NOT_ALLOWED",
      "This route only supports GET.",
    );
  }
  if (!dependencies) {
    return apiError(
      context,
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is not configured.",
    );
  }

  const authentication =
    await dependencies.authenticationAdapter.authenticate(request);
  if (!authentication.authenticated) {
    return authenticationFailure(context, authentication);
  }
  return createOrganizationRequestContext(context, authentication.session);
}

function authenticationFailure(
  context: ApiRequestContext,
  authentication: Exclude<AuthenticationResult, { authenticated: true }>,
): Response {
  switch (authentication.reason) {
    case "AUTH_PROVIDER_UNAVAILABLE":
      return apiError(
        context,
        503,
        "AUTHENTICATION_UNAVAILABLE",
        "Authentication is not configured.",
      );
    case "USER_DISABLED":
      return apiError(
        context,
        403,
        "USER_DISABLED",
        "Your user account is disabled.",
      );
    case "MEMBERSHIP_REQUIRED":
      return apiError(
        context,
        403,
        "MEMBERSHIP_REQUIRED",
        "An active organization membership is required.",
      );
    case "MEMBERSHIP_INACTIVE":
      return apiError(
        context,
        403,
        "MEMBERSHIP_INACTIVE",
        "Your organization membership is inactive.",
      );
    case "ORGANIZATION_SELECTION_REQUIRED":
      return apiError(
        context,
        409,
        "ORGANIZATION_SELECTION_REQUIRED",
        "Select an organization before continuing.",
      );
    case "MISSING_CREDENTIALS":
    case "INVALID_CREDENTIALS":
      return apiError(
        context,
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
      );
  }
}

function serializeOrganization(organization: {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}
