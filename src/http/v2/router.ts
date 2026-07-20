import type { AuthenticationResult } from "../../auth/authentication-adapter";
import { ProjectContactNotFoundError } from "../../application/projects/project-contact-service";
import { ProjectNotFoundError } from "../../application/projects/project-service";
import {
  RecordArchivedError,
  RecordAuthorizationError,
  RecordNotFoundError,
} from "../../domain/records/errors";
import {
  RfiNotFoundError,
  RfiIllegalTransitionError,
  RfiAuthorizationError,
} from "../../domain/rfis/errors";
import {
  RevisionNotFoundError,
  RevisionIllegalTransitionError,
  RevisionAuthorizationError,
} from "../../domain/revisions/errors";
import {
  FileNotFoundError,
  FileAuthorizationError,
  FileObjectMissingError,
  FileStorageWriteError,
  FileUploadCompensationError,
} from "../../domain/files/errors";
import {
  buildContentDisposition,
  FileValidationError,
} from "../../domain/files/validation";
import { AuthorizationError } from "../../domain/identity/authorization";
import { ProjectAuthorizationError } from "../../domain/projects/authorization";
import type { Project, ProjectContact } from "../../domain/projects/project";
import type { Rfi, RfiResponse } from "../../domain/rfis/rfi";
import type { Record } from "../../domain/records/record";
import type { Revision } from "../../domain/revisions/revision";
import type { RevisionFile } from "../../domain/files/file";
import type { FileDownload } from "../../application/files/file-service";
import {
  apiError,
  apiSuccess,
  createApiRequestContext,
  type ApiRequestContext,
} from "../api-response";
import type { V2RouteDependencies } from "./dependencies";
import {
  parseJsonRequest,
  parseProjectContactCreate,
  parseProjectContactUpdate,
  parseProjectCreate,
  parseProjectUpdate,
  RequestValidationError,
} from "./project-schemas";
import {
  parseRfiCreate,
  parseRfiResponse,
  parseRfiUpdate,
} from "./rfi-schemas";
import {
  parseIncludeArchived,
  parseRecordCreate,
  parseRecordUpdate,
} from "./record-schemas";
import { parseRevisionCreate } from "./revision-schemas";
import { parseFileUpload } from "./file-schemas";
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
    return request.method === "HEAD"
      ? new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      : response;
  }

  if (pathname === `${V2_BASE_PATH}/session`)
    return handleSession(request, context, dependencies);
  if (pathname === `${V2_BASE_PATH}/organizations/current`)
    return handleCurrentOrganization(request, context, dependencies);
  if (pathname === `${V2_BASE_PATH}/members`)
    return handleMembers(request, context, dependencies);

  if (pathname === `${V2_BASE_PATH}/projects` && dependencies) {
    return handleProjects(request, context, dependencies);
  }
  const recordRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/records(?:\/([^/]+)(?:\/(archive))?)?$/,
  );
  if (recordRoute && dependencies) {
    return handleRecordRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(recordRoute[1]),
      recordRoute[2] ? decodeURIComponent(recordRoute[2]) : undefined,
      recordRoute[3],
    );
  }
  const revisionRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/records\/([^/]+)\/revisions(?:\/([^/]+)(?:\/(publish))?)?$/,
  );
  if (revisionRoute && dependencies) {
    return handleRevisionRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(revisionRoute[1]),
      decodeURIComponent(revisionRoute[2]),
      revisionRoute[3] ? decodeURIComponent(revisionRoute[3]) : undefined,
      revisionRoute[4],
    );
  }
  const fileRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/records\/([^/]+)\/revisions\/([^/]+)\/files(?:\/([^/]+)(?:\/(content))?)?$/,
  );
  if (fileRoute && dependencies) {
    return handleFileRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(fileRoute[1]),
      decodeURIComponent(fileRoute[2]),
      decodeURIComponent(fileRoute[3]),
      fileRoute[4] ? decodeURIComponent(fileRoute[4]) : undefined,
      fileRoute[5],
    );
  }
  const rfiRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/rfis(?:\/([^/]+)(?:\/(issue|respond|close|reopen))?)?$/,
  );
  if (rfiRoute && dependencies) {
    return handleRfiRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(rfiRoute[1]),
      rfiRoute[2] ? decodeURIComponent(rfiRoute[2]) : undefined,
      rfiRoute[3],
    );
  }
  const projectRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)(?:\/contacts(?:\/([^/]+))?)?$/,
  );
  if (projectRoute && dependencies) {
    return handleProjectRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(projectRoute[1]),
      projectRoute[2] ? decodeURIComponent(projectRoute[2]) : undefined,
      pathname.includes("/contacts"),
    );
  }

  return apiError(
    context,
    404,
    "API_ROUTE_NOT_FOUND",
    "The requested API route was not found.",
  );
}

async function handleRecordRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  recordId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = action
    ? ["POST"]
    : recordId
      ? ["GET", "PATCH"]
      : ["GET", "POST"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const records = dependencies.records;
  if (!records) return unavailable(context);
  try {
    if (!recordId) {
      if (request.method === "GET") {
        const includeArchived = parseIncludeArchived(
          new URL(request.url).searchParams.get("includeArchived"),
        );
        return apiSuccess(
          context,
          (
            await records.list(
              authenticated.session,
              projectId,
              includeArchived,
            )
          ).map(serializeRecord),
        );
      }
      const record = await records.create(authenticated.session, projectId, {
        ...parseRecordCreate(await parseJsonRequest(request)),
        correlationId: context.requestId,
      });
      return apiSuccess(context, serializeRecord(record), 201);
    }
    if (action === "archive") {
      return apiSuccess(
        context,
        serializeRecord(
          await records.archive(
            authenticated.session,
            projectId,
            recordId,
            context.requestId,
          ),
        ),
      );
    }
    if (request.method === "GET") {
      return apiSuccess(
        context,
        serializeRecord(
          await records.get(authenticated.session, projectId, recordId),
        ),
      );
    }
    const current = await records.get(
      authenticated.session,
      projectId,
      recordId,
    );
    const record = await records.update(
      authenticated.session,
      projectId,
      recordId,
      {
        ...parseRecordUpdate(
          await parseJsonRequest(request),
          toRecordWriteInput(current),
        ),
        correlationId: context.requestId,
      },
    );
    return apiSuccess(context, serializeRecord(record));
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleRevisionRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  recordId: string,
  revisionId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = action
    ? ["POST"]
    : revisionId
      ? ["GET"]
      : ["GET", "POST"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const revisions = dependencies.revisions;
  const records = dependencies.records;
  if (!revisions || !records) return unavailable(context);
  try {
    if (!revisionId) {
      if (request.method === "GET") {
        return apiSuccess(
          context,
          (
            await revisions.list(authenticated.session, projectId, recordId)
          ).map(serializeRevision),
        );
      }
      const current = await records.get(
        authenticated.session,
        projectId,
        recordId,
      );
      const revision = await revisions.createDraft(
        authenticated.session,
        projectId,
        recordId,
        {
          ...parseRevisionCreate(
            await parseJsonRequest(request),
            toRevisionParentDefaults(current),
          ),
          correlationId: context.requestId,
        },
      );
      return apiSuccess(context, serializeRevision(revision), 201);
    }
    if (action === "publish") {
      return apiSuccess(
        context,
        serializeRevision(
          await revisions.publish(
            authenticated.session,
            projectId,
            recordId,
            revisionId,
            context.requestId,
          ),
        ),
      );
    }
    return apiSuccess(
      context,
      serializeRevision(
        await revisions.get(
          authenticated.session,
          projectId,
          recordId,
          revisionId,
        ),
      ),
    );
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleFileRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  recordId: string,
  revisionId: string,
  fileId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = action || fileId ? ["GET"] : ["GET", "POST"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const files = dependencies.files;
  if (!files) return unavailable(context);
  try {
    if (!fileId) {
      if (request.method === "GET") {
        return apiSuccess(
          context,
          (
            await files.list(
              authenticated.session,
              projectId,
              recordId,
              revisionId,
            )
          ).map(serializeFile),
        );
      }
      const upload = await parseFileUpload(request);
      const file = await files.upload(
        authenticated.session,
        projectId,
        recordId,
        revisionId,
        { ...upload, correlationId: context.requestId },
      );
      return apiSuccess(context, serializeFile(file), 201);
    }
    if (action === "content") {
      return fileContentResponse(
        context,
        await files.download(
          authenticated.session,
          projectId,
          recordId,
          revisionId,
          fileId,
        ),
      );
    }
    return apiSuccess(
      context,
      serializeFile(
        await files.get(
          authenticated.session,
          projectId,
          recordId,
          revisionId,
          fileId,
        ),
      ),
    );
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleRfiRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  rfiId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = action
    ? ["POST"]
    : rfiId
      ? ["GET", "PATCH"]
      : ["GET", "POST"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const rfis = dependencies.rfis;
  if (!rfis) return unavailable(context);
  try {
    if (!rfiId) {
      if (request.method === "GET") {
        return apiSuccess(
          context,
          (await rfis.list(authenticated.session, projectId)).map(serializeRfi),
        );
      }
      const rfi = await rfis.createDraft(authenticated.session, projectId, {
        ...parseRfiCreate(await parseJsonRequest(request)),
        correlationId: context.requestId,
      });
      return apiSuccess(context, serializeRfi(rfi), 201);
    }
    if (!action) {
      if (request.method === "GET") {
        return apiSuccess(
          context,
          serializeRfiDetail(
            await rfis.get(authenticated.session, projectId, rfiId),
          ),
        );
      }
      const current = await rfis.get(authenticated.session, projectId, rfiId);
      const rfi = await rfis.updateDraft(
        authenticated.session,
        projectId,
        rfiId,
        {
          ...parseRfiUpdate(
            await parseJsonRequest(request),
            toRfiWriteInput(current),
          ),
          correlationId: context.requestId,
        },
      );
      return apiSuccess(context, serializeRfi(rfi));
    }
    if (action === "issue") {
      return apiSuccess(
        context,
        serializeRfi(
          await rfis.issue(
            authenticated.session,
            projectId,
            rfiId,
            context.requestId,
          ),
        ),
      );
    }
    if (action === "respond") {
      const result = await rfis.respond(
        authenticated.session,
        projectId,
        rfiId,
        {
          ...parseRfiResponse(await parseJsonRequest(request)),
          correlationId: context.requestId,
        },
      );
      return apiSuccess(context, {
        ...serializeRfi(result.rfi),
        response: serializeRfiResponse(result.response),
      });
    }
    const rfi =
      action === "close"
        ? await rfis.close(
            authenticated.session,
            projectId,
            rfiId,
            context.requestId,
          )
        : await rfis.reopen(
            authenticated.session,
            projectId,
            rfiId,
            context.requestId,
          );
    return apiSuccess(context, serializeRfi(rfi));
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleProjects(
  request: Request,
  context: ApiRequestContext,
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    ["GET", "POST"],
  );
  if (authenticated instanceof Response) return authenticated;
  const projects = dependencies?.projects;
  if (!projects) return unavailable(context);
  try {
    if (request.method === "GET")
      return apiSuccess(
        context,
        (await projects.list(authenticated.session)).map(serializeProject),
      );
    const input = parseProjectCreate(await parseJsonRequest(request));
    const project = await projects.create(authenticated.session, {
      ...input,
      correlationId: context.requestId,
    });
    return apiSuccess(context, serializeProject(project), 201);
  } catch (error) {
    if (error instanceof ProjectAuthorizationError) {
      return apiError(
        context,
        403,
        "AUTHORIZATION_DENIED",
        "You are not allowed to access this resource.",
      );
    }
    return projectError(context, error);
  }
}

async function handleProjectRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
  projectId: string,
  contactId: string | undefined,
  isContactsRoute: boolean,
): Promise<Response> {
  const allowedMethods = isContactsRoute
    ? contactId
      ? ["PATCH"]
      : ["GET", "POST"]
    : ["GET", "PATCH"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const projects = dependencies?.projects;
  const contacts = dependencies?.projectContacts;
  if (!projects) return unavailable(context);
  if (isContactsRoute && !contacts) return unavailable(context);
  try {
    if (!isContactsRoute) {
      if (request.method === "GET")
        return apiSuccess(
          context,
          serializeProject(
            await projects.get(authenticated.session, projectId),
          ),
        );
      const current = await projects.get(authenticated.session, projectId);
      const project = await projects.update(authenticated.session, projectId, {
        ...parseProjectUpdate(
          await parseJsonRequest(request),
          toProjectWriteInput(current),
        ),
        correlationId: context.requestId,
      });
      return apiSuccess(context, serializeProject(project));
    }
    const projectContacts = contacts;
    if (!projectContacts) return unavailable(context);
    if (request.method === "GET")
      return apiSuccess(
        context,
        (await projectContacts.list(authenticated.session, projectId)).map(
          serializeContact,
        ),
      );
    if (request.method === "POST") {
      const contact = await projectContacts.create(
        authenticated.session,
        projectId,
        {
          ...parseProjectContactCreate(await parseJsonRequest(request)),
          correlationId: context.requestId,
        },
      );
      return apiSuccess(context, serializeContact(contact), 201);
    }
    if (!contactId)
      return apiError(
        context,
        404,
        "API_ROUTE_NOT_FOUND",
        "The requested API route was not found.",
      );
    const current = await projectContacts.list(
      authenticated.session,
      projectId,
    );
    const existing = current.find((contact) => contact.id === contactId);
    if (!existing) throw new ProjectContactNotFoundError();
    const contact = await projectContacts.update(
      authenticated.session,
      projectId,
      contactId,
      {
        ...parseProjectContactUpdate(
          await parseJsonRequest(request),
          toContactWriteInput(existing),
        ),
        correlationId: context.requestId,
      },
    );
    return apiSuccess(context, serializeContact(contact));
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleSession(
  request: Request,
  context: ApiRequestContext,
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const session = await authenticateRequest(request, context, dependencies, [
    "GET",
  ]);
  if (session instanceof Response) return session;
  if (!dependencies) return unavailable(context);
  const organization = await dependencies.organizations.getCurrentOrganization(
    session.session,
  );
  if (!organization)
    return apiError(
      context,
      404,
      "ORGANIZATION_NOT_FOUND",
      "The current organization was not found.",
    );
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
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const session = await authenticateRequest(request, context, dependencies, [
    "GET",
  ]);
  if (session instanceof Response) return session;
  if (!dependencies) return unavailable(context);
  const organization = await dependencies.organizations.getCurrentOrganization(
    session.session,
  );
  if (!organization)
    return apiError(
      context,
      404,
      "ORGANIZATION_NOT_FOUND",
      "The current organization was not found.",
    );
  return apiSuccess(context, serializeOrganization(organization));
}

async function handleMembers(
  request: Request,
  context: ApiRequestContext,
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const session = await authenticateRequest(request, context, dependencies, [
    "GET",
  ]);
  if (session instanceof Response) return session;
  if (!dependencies) return unavailable(context);
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
    if (error instanceof AuthorizationError)
      return apiError(
        context,
        403,
        "AUTHORIZATION_DENIED",
        "You are not allowed to access this resource.",
      );
    throw error;
  }
}

async function authenticateRequest(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies | undefined,
  methods: readonly string[],
): Promise<OrganizationRequestContext | Response> {
  if (!methods.includes(request.method))
    return apiError(
      context,
      405,
      "METHOD_NOT_ALLOWED",
      `This route only supports ${methods.join(" and ")}.`,
    );
  if (!dependencies) return unavailable(context);
  const authentication =
    await dependencies.authenticationAdapter.authenticate(request);
  if (!authentication.authenticated)
    return authenticationFailure(context, authentication);
  return createOrganizationRequestContext(context, authentication.session);
}

function unavailable(context: ApiRequestContext): Response {
  return apiError(
    context,
    503,
    "AUTHENTICATION_UNAVAILABLE",
    "Authentication is not configured.",
  );
}

function authenticationFailure(
  context: ApiRequestContext,
  authentication: Exclude<AuthenticationResult, { authenticated: true }>,
): Response {
  switch (authentication.reason) {
    case "AUTH_PROVIDER_UNAVAILABLE":
      return unavailable(context);
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

function projectError(context: ApiRequestContext, error: unknown): Response {
  if (error instanceof RequestValidationError)
    return apiError(context, 400, "VALIDATION_FAILED", error.message);
  if (
    error instanceof ProjectNotFoundError ||
    error instanceof ProjectAuthorizationError
  )
    return apiError(
      context,
      404,
      "PROJECT_NOT_FOUND",
      "The requested project was not found.",
    );
  if (error instanceof ProjectContactNotFoundError)
    return apiError(
      context,
      404,
      "PROJECT_CONTACT_NOT_FOUND",
      "The requested project contact was not found.",
    );
  if (error instanceof RfiNotFoundError)
    return apiError(
      context,
      404,
      "RFI_NOT_FOUND",
      "The requested RFI was not found.",
    );
  if (error instanceof RecordNotFoundError)
    return apiError(
      context,
      404,
      "RECORD_NOT_FOUND",
      "The requested record was not found.",
    );
  if (error instanceof RecordAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof RfiAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof RfiIllegalTransitionError)
    return apiError(context, 409, "RFI_ILLEGAL_TRANSITION", error.message);
  if (error instanceof RevisionNotFoundError)
    return apiError(
      context,
      404,
      "REVISION_NOT_FOUND",
      "The requested revision was not found.",
    );
  if (error instanceof RevisionAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof RevisionIllegalTransitionError)
    return apiError(context, 409, "REVISION_ILLEGAL_TRANSITION", error.message);
  if (error instanceof FileNotFoundError)
    return apiError(
      context,
      404,
      "FILE_NOT_FOUND",
      "The requested file was not found.",
    );
  if (error instanceof FileAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof FileValidationError)
    return apiError(context, 400, "VALIDATION_FAILED", error.message);
  if (error instanceof FileStorageWriteError)
    return apiError(
      context,
      502,
      "FILE_STORAGE_UNAVAILABLE",
      "The file could not be stored.",
    );
  if (error instanceof FileUploadCompensationError)
    return apiError(context, 500, "FILE_UPLOAD_FAILED", error.message);
  if (error instanceof FileObjectMissingError)
    return apiError(context, 500, "FILE_OBJECT_MISSING", error.message);
  if (
    error instanceof Error &&
    error.message.includes(
      "UNIQUE constraint failed: record_revisions.record_id",
    )
  )
    return apiError(
      context,
      409,
      "REVISION_ALREADY_PUBLISHED",
      "Another revision was published for this record concurrently.",
    );
  if (error instanceof RecordArchivedError)
    return apiError(context, 409, "RECORD_ARCHIVED", error.message);
  if (
    error instanceof Error &&
    error.message.includes("projects.organization_id, projects.project_number")
  )
    return apiError(
      context,
      409,
      "PROJECT_NUMBER_CONFLICT",
      "A project with this number already exists.",
    );
  if (
    error instanceof Error &&
    error.message.includes(
      "records.organization_id, records.project_id, records.record_number",
    )
  )
    return apiError(
      context,
      409,
      "RECORD_NUMBER_CONFLICT",
      "A record with this number already exists in this project.",
    );
  throw error;
}

function serializeProject(project: Project) {
  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    description: project.description,
    address: project.address,
    timezone: project.timezone,
    startDate: project.startDate,
    targetCompletionDate: project.targetCompletionDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
  };
}
function serializeContact(contact: ProjectContact) {
  return {
    id: contact.id,
    projectId: contact.projectId,
    companyName: contact.companyName,
    contactName: contact.contactName,
    contactType: contact.contactType,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    notes: contact.notes,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    archivedAt: contact.archivedAt,
  };
}
function serializeRfi(rfi: Rfi) {
  return {
    id: rfi.id,
    projectId: rfi.projectId,
    rfiNumber: rfi.rfiNumber,
    status: rfi.status,
    title: rfi.title,
    question: rfi.question,
    suggestedResolution: rfi.suggestedResolution,
    submittedBy: rfi.submittedBy,
    assignedTo: rfi.assignedTo,
    dueDate: rfi.dueDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
    issuedAt: rfi.issuedAt,
    answeredAt: rfi.answeredAt,
    closedAt: rfi.closedAt,
    createdAt: rfi.createdAt,
    updatedAt: rfi.updatedAt,
  };
}
function serializeRecord(record: Record) {
  return {
    id: record.id,
    projectId: record.projectId,
    recordType: record.recordType,
    recordNumber: record.recordNumber,
    title: record.title,
    description: record.description,
    status: record.status,
    discipline: record.discipline,
    source: record.source,
    createdBy: record.createdBy,
    currentRevisionId: record.currentRevisionId,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
function serializeRevision(revision: Revision) {
  return {
    id: revision.id,
    projectId: revision.projectId,
    recordId: revision.recordId,
    revisionNumber: revision.revisionNumber,
    revisionLabel: revision.revisionLabel,
    title: revision.title,
    description: revision.description,
    discipline: revision.discipline,
    source: revision.source,
    changeSummary: revision.changeSummary,
    status: revision.status,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
  };
}
function serializeFile(file: RevisionFile) {
  return {
    id: file.id,
    organizationId: file.organizationId,
    projectId: file.projectId,
    recordId: file.recordId,
    revisionId: file.revisionId,
    originalFilename: file.originalFilename,
    mediaType: file.mediaType,
    byteSize: file.byteSize,
    sha256: file.sha256,
    uploadedBy: file.uploadedBy,
    uploadedAt: file.uploadedAt,
  };
}
function fileContentResponse(
  context: ApiRequestContext,
  download: FileDownload,
): Response {
  const headers = new Headers({
    "Content-Type": download.contentType ?? download.file.mediaType,
    "Content-Disposition": buildContentDisposition(
      download.file.originalFilename,
    ),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": context.requestId,
  });
  headers.set("Content-Length", String(download.size));
  if (download.httpEtag) headers.set("ETag", download.httpEtag);
  return new Response(download.body, { status: 200, headers });
}
function toRevisionParentDefaults(record: Record) {
  return {
    title: record.title,
    description: record.description,
    discipline: record.discipline,
    source: record.source,
  };
}
function serializeRfiResponse(response: RfiResponse) {
  return {
    id: response.id,
    rfiId: response.rfiId,
    response: response.response,
    respondedBy: response.respondedBy,
    createdAt: response.createdAt,
  };
}
function serializeRfiDetail(rfi: Rfi & { responses: RfiResponse[] }) {
  return {
    ...serializeRfi(rfi),
    responses: rfi.responses.map(serializeRfiResponse),
  };
}
function toProjectWriteInput(project: Project) {
  return {
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    description: project.description,
    address: project.address,
    timezone: project.timezone,
    startDate: project.startDate,
    targetCompletionDate: project.targetCompletionDate,
  };
}
function toContactWriteInput(contact: ProjectContact) {
  return {
    companyName: contact.companyName,
    contactName: contact.contactName,
    contactType: contact.contactType,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    notes: contact.notes,
  };
}
function toRfiWriteInput(rfi: Rfi) {
  return {
    title: rfi.title,
    question: rfi.question,
    suggestedResolution: rfi.suggestedResolution,
    submittedBy: rfi.submittedBy,
    assignedTo: rfi.assignedTo,
    dueDate: rfi.dueDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
  };
}
function toRecordWriteInput(record: Record) {
  return {
    recordType: record.recordType,
    recordNumber: record.recordNumber,
    title: record.title,
    description: record.description,
    discipline: record.discipline,
    source: record.source,
  };
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
