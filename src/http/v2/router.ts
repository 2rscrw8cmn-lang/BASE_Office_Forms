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
  RfiConflictError,
  RfiAlreadyIssuedError,
  RfiIssueCompensationError,
  RfiIssueIdempotencyConflictError,
  RfiIssuePersistenceError,
  RfiResponsePersistenceError,
  RfiIssueRenderError,
  RfiIssueRequestError,
  RfiIssueStorageError,
  RfiIssueValidationError,
  RfiReadyValidationError,
  RfiResponsibleContactError,
} from "../../domain/rfis/errors";
import { RfiAttachmentRejectedError } from "../../infrastructure/db/d1/rfi-attachments-repository";
import {
  RevisionNotFoundError,
  RevisionIllegalTransitionError,
  RevisionAuthorizationError,
} from "../../domain/revisions/errors";
import {
  FileNotFoundError,
  FileAuthorizationError,
  FileObjectIntegrityError,
  FileObjectMissingError,
  FileStorageWriteError,
  FileUploadCompensationError,
} from "../../domain/files/errors";
import {
  buildContentDisposition,
  FileValidationError,
} from "../../domain/files/validation";
import { AuthorizationError } from "../../domain/identity/authorization";
import {
  canCreateProjects,
  ProjectAuthorizationError,
} from "../../domain/projects/authorization";
import {
  TemplateAuthorizationError,
  TemplateNotFoundError,
} from "../../domain/templates/errors";
import { RendererDefinitionValidationError } from "../../rendering/renderer-definition";
import type { Project, ProjectContact } from "../../domain/projects/project";
import type { Rfi, RfiResponse } from "../../domain/rfis/rfi";
import type { RfiListItem } from "../../application/read-models/project-rfis-service";
import type { RfiAttachmentDownload } from "../../application/rfis/rfi-attachment-service";
import type { Record } from "../../domain/records/record";
import type { RecordListSummaryItem } from "../../application/read-models/project-records-service";
import type { Revision } from "../../domain/revisions/revision";
import type { RevisionFile } from "../../domain/files/file";
import type { TemplateWithPublishedVersion } from "../../domain/templates/template";
import type { FileDownload } from "../../application/files/file-service";
import type { Issuance } from "../../domain/issuances/issuance";
import type { IssuanceSummary } from "../../domain/issuances/issuance";
import {
  IssuanceAuthorizationError,
  IssuanceEligibilityError,
  IssuanceFileObjectIntegrityError,
  IssuanceFileObjectMissingError,
  IssuanceNotFoundError,
  IssuancePersistenceError,
  IssuanceStorageVerificationError,
} from "../../domain/issuances/errors";
import { IssuanceValidationError } from "../../domain/issuances/validation";
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
  parseRfiAttachmentUpload,
  parseRfiCreate,
  parseRfiIssue,
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
import { parseIssuanceCreate } from "./issuance-schemas";
import { parseTemplatePublish } from "./template-schemas";
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
  if (pathname === `${V2_BASE_PATH}/dashboard`)
    return handleDashboard(request, context, dependencies);

  const projectOverviewRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/overview$/,
  );
  if (projectOverviewRoute && dependencies) {
    return handleProjectOverview(
      request,
      context,
      dependencies,
      decodeURIComponent(projectOverviewRoute[1]),
    );
  }

  if (pathname === `${V2_BASE_PATH}/projects` && dependencies) {
    return handleProjects(request, context, dependencies);
  }
  const projectIssuanceRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/issuances(?:\/([^/]+))?$/,
  );
  if (projectIssuanceRoute && dependencies) {
    return handleProjectIssuanceRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(projectIssuanceRoute[1]),
      projectIssuanceRoute[2]
        ? decodeURIComponent(projectIssuanceRoute[2])
        : undefined,
    );
  }
  const revisionIssuanceRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/records\/([^/]+)\/revisions\/([^/]+)\/issuances$/,
  );
  if (revisionIssuanceRoute && dependencies) {
    return handleRevisionIssuanceRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(revisionIssuanceRoute[1]),
      decodeURIComponent(revisionIssuanceRoute[2]),
      decodeURIComponent(revisionIssuanceRoute[3]),
    );
  }
  const templateRoute = pathname.match(/^\/api\/v2\/templates(?:\/([^/]+))?$/);
  if (templateRoute && dependencies) {
    return handleTemplateRoute(
      request,
      context,
      dependencies,
      templateRoute[1] ? decodeURIComponent(templateRoute[1]) : undefined,
    );
  }
  const recordRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/records(?:\/([^/]+)(?:\/(archive|workspace))?)?$/,
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
    /^\/api\/v2\/projects\/([^/]+)\/records\/([^/]+)\/revisions(?:\/([^/]+)(?:\/(publish|workspace))?)?$/,
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
  const rfiAttachmentRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/rfis\/([^/]+)\/attachments(?:\/([^/]+)\/(content))?$/,
  );
  if (rfiAttachmentRoute && dependencies) {
    return handleRfiAttachmentRoute(
      request,
      context,
      dependencies,
      decodeURIComponent(rfiAttachmentRoute[1]),
      decodeURIComponent(rfiAttachmentRoute[2]),
      rfiAttachmentRoute[3]
        ? decodeURIComponent(rfiAttachmentRoute[3])
        : undefined,
      rfiAttachmentRoute[4],
    );
  }
  const rfiRoute = pathname.match(
    /^\/api\/v2\/projects\/([^/]+)\/rfis(?:\/([^/]+)(?:\/(workspace|issue|respond|close|reopen|ready|return-to-draft|void|return))?)?$/,
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
    ? action === "workspace"
      ? ["GET"]
      : ["POST"]
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
        const projectRecords = dependencies.projectRecords;
        if (!projectRecords) return unavailable(context);
        const includeArchived = parseIncludeArchived(
          new URL(request.url).searchParams.get("includeArchived"),
        );
        const model = await projectRecords.load(
          authenticated.session,
          projectId,
          includeArchived,
        );
        return apiSuccess(context, {
          records: model.records.map(serializeRecordSummary),
          capabilities: model.capabilities,
        });
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
    if (action === "workspace") {
      const workspace = dependencies.recordWorkspace;
      if (!workspace) return unavailable(context);
      return apiSuccess(
        context,
        await workspace.load(authenticated.session, projectId, recordId),
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
          toRecordMetadataInput(current),
        ),
        correlationId: context.requestId,
      },
    );
    return apiSuccess(context, serializeRecord(record));
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleProjectIssuanceRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  issuanceId: string | undefined,
): Promise<Response> {
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    ["GET"],
  );
  if (authenticated instanceof Response) return authenticated;
  const issuances = dependencies.issuances;
  if (!issuances) return unavailable(context);
  try {
    if (!issuanceId) {
      return apiSuccess(
        context,
        (await issuances.list(authenticated.session, projectId)).map(
          serializeIssuanceSummary,
        ),
      );
    }
    return apiSuccess(
      context,
      serializeIssuance(
        await issuances.get(authenticated.session, projectId, issuanceId),
      ),
    );
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleRevisionIssuanceRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  recordId: string,
  revisionId: string,
): Promise<Response> {
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    ["POST"],
  );
  if (authenticated instanceof Response) return authenticated;
  const issuances = dependencies.issuances;
  if (!issuances) return unavailable(context);
  try {
    const input = parseIssuanceCreate(await parseJsonRequest(request));
    const issuance = await issuances.issue(
      authenticated.session,
      projectId,
      recordId,
      revisionId,
      { ...input, correlationId: context.requestId },
    );
    return apiSuccess(context, serializeIssuance(issuance), 201);
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
    ? action === "workspace"
      ? ["GET"]
      : ["POST"]
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
  if (action === "workspace") {
    if (!revisionId) return projectError(context, new RevisionNotFoundError());
    const workspace = dependencies.revisionWorkspace;
    if (!workspace) return unavailable(context);
    try {
      return apiSuccess(
        context,
        await workspace.load(
          authenticated.session,
          projectId,
          recordId,
          revisionId,
        ),
      );
    } catch (error) {
      return projectError(context, error);
    }
  }
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

const RFI_TRANSITION_ACTIONS = new Set([
  "issue",
  "close",
  "reopen",
  "ready",
  "return-to-draft",
  "void",
  "return",
]);

async function handleRfiRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  rfiId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = action
    ? action === "workspace"
      ? ["GET"]
      : ["POST"]
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
  if (action === "workspace") {
    const workspace = dependencies.rfiWorkspace;
    if (!workspace) return unavailable(context);
    try {
      return apiSuccess(
        context,
        await workspace.load(authenticated.session, projectId, rfiId as string),
      );
    } catch (error) {
      return projectError(context, error);
    }
  }
  const rfis = dependencies.rfis;
  if (!rfis) return unavailable(context);
  try {
    if (!rfiId) {
      if (request.method === "GET") {
        const projectRfis = dependencies.projectRfis;
        if (!projectRfis) return unavailable(context);
        const model = await projectRfis.load(authenticated.session, projectId);
        return apiSuccess(context, {
          project: model.project,
          rfis: model.rfis.map(serializeRfiListItem),
          responsibleContacts: model.responsibleContacts,
          capabilities: model.capabilities,
        });
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
      const { input, lockVersion } = parseRfiUpdate(
        await parseJsonRequest(request),
        toRfiWriteInput(current),
      );
      const rfi = await rfis.updateDraft(
        authenticated.session,
        projectId,
        rfiId,
        lockVersion,
        { ...input, correlationId: context.requestId },
      );
      return apiSuccess(context, serializeRfi(rfi));
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
    if (action === "issue") {
      const idempotencyKey = request.headers.get("idempotency-key")?.trim();
      if (!idempotencyKey) {
        return apiError(
          context,
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "An Idempotency-Key header is required.",
        );
      }
      const result = await rfis.issue(
        authenticated.session,
        projectId,
        rfiId,
        idempotencyKey,
        parseRfiIssue(await parseJsonRequest(request)),
        context.requestId,
      );
      return apiSuccess(context, result);
    }
    if (action && RFI_TRANSITION_ACTIONS.has(action)) {
      const session = authenticated.session;
      const requestId = context.requestId;
      const rfi =
        action === "close"
          ? await rfis.close(session, projectId, rfiId, requestId)
          : action === "reopen"
            ? await rfis.reopen(session, projectId, rfiId, requestId)
            : action === "ready"
              ? await rfis.markReady(session, projectId, rfiId, requestId)
              : action === "return-to-draft"
                ? await rfis.returnToDraft(session, projectId, rfiId, requestId)
                : action === "void"
                  ? await rfis.void(session, projectId, rfiId, requestId)
                  : await rfis.returnForClarification(
                      session,
                      projectId,
                      rfiId,
                      requestId,
                    );
      return apiSuccess(context, serializeRfi(rfi));
    }
    return apiError(
      context,
      404,
      "API_ROUTE_NOT_FOUND",
      "The requested API route was not found.",
    );
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleRfiAttachmentRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
  rfiId: string,
  attachmentId: string | undefined,
  action: string | undefined,
): Promise<Response> {
  const allowedMethods = attachmentId ? ["GET"] : ["GET", "POST"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const attachments = dependencies.rfiAttachments;
  if (!attachments) return unavailable(context);
  try {
    if (attachmentId && action === "content") {
      return rfiAttachmentContentResponse(
        context,
        await attachments.download(
          authenticated.session,
          projectId,
          rfiId,
          attachmentId,
        ),
      );
    }
    if (!attachmentId) {
      if (request.method === "GET") {
        return apiSuccess(
          context,
          (await attachments.list(authenticated.session, projectId, rfiId)).map(
            serializeRfiAttachment,
          ),
        );
      }
      const upload = await parseRfiAttachmentUpload(request);
      const attachment = await attachments.upload(
        authenticated.session,
        projectId,
        rfiId,
        { ...upload, correlationId: context.requestId },
      );
      return apiSuccess(context, serializeRfiAttachment(attachment), 201);
    }
    return apiError(
      context,
      404,
      "API_ROUTE_NOT_FOUND",
      "The requested API route was not found.",
    );
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleTemplateRoute(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  key: string | undefined,
): Promise<Response> {
  const allowedMethods = key ? ["GET", "PUT"] : ["GET"];
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    allowedMethods,
  );
  if (authenticated instanceof Response) return authenticated;
  const templates = dependencies.templates;
  if (!templates) return unavailable(context);
  try {
    if (!key) {
      return apiSuccess(
        context,
        (await templates.list(authenticated.session)).map(serializeTemplate),
      );
    }
    if (request.method === "GET") {
      return apiSuccess(
        context,
        serializeTemplate(await templates.get(authenticated.session, key)),
      );
    }
    const input = parseTemplatePublish(await parseJsonRequest(request), key);
    const template = await templates.publish(authenticated.session, {
      key,
      ...input,
      correlationId: context.requestId,
    });
    return apiSuccess(context, serializeTemplate(template));
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
        200,
        {
          capabilities: {
            createProject: canCreateProjects(authenticated.session),
          },
        },
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

async function handleDashboard(
  request: Request,
  context: ApiRequestContext,
  dependencies?: V2RouteDependencies,
): Promise<Response> {
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    ["GET"],
  );
  if (authenticated instanceof Response) return authenticated;
  const dashboard = dependencies?.dashboard;
  if (!dashboard) return unavailable(context);
  try {
    return apiSuccess(context, await dashboard.load(authenticated.session));
  } catch (error) {
    return projectError(context, error);
  }
}

async function handleProjectOverview(
  request: Request,
  context: ApiRequestContext,
  dependencies: V2RouteDependencies,
  projectId: string,
): Promise<Response> {
  const authenticated = await authenticateRequest(
    request,
    context,
    dependencies,
    ["GET"],
  );
  if (authenticated instanceof Response) return authenticated;
  const overview = dependencies.projectOverview;
  if (!overview) return unavailable(context);
  try {
    const model = await overview.load(authenticated.session, projectId);
    return apiSuccess(context, {
      project: serializeProject(model.project),
      counts: model.counts,
      attention: model.attention,
      recentActivity: model.recentActivity,
    });
  } catch (error) {
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
  if (error instanceof TemplateNotFoundError)
    return apiError(
      context,
      404,
      "TEMPLATE_NOT_FOUND",
      "The requested template was not found.",
    );
  if (error instanceof TemplateAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof RendererDefinitionValidationError)
    return apiError(context, 400, "VALIDATION_FAILED", error.message);
  if (error instanceof RfiAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof RfiIllegalTransitionError)
    return apiError(context, 409, "RFI_ILLEGAL_TRANSITION", error.message);
  if (error instanceof RfiConflictError)
    return apiError(context, 409, "RFI_VERSION_CONFLICT", error.message);
  if (error instanceof RfiIssueIdempotencyConflictError)
    return apiError(context, 409, "IDEMPOTENCY_KEY_REUSED", error.message);
  if (error instanceof RfiIssueRequestError)
    return apiError(context, 400, "VALIDATION_FAILED", error.message);
  if (error instanceof RfiAlreadyIssuedError)
    return apiError(context, 409, "RFI_ALREADY_ISSUED", error.message);
  if (error instanceof RfiIssueValidationError)
    return apiError(context, 422, "RFI_ISSUE_VALIDATION_FAILED", error.message);
  if (error instanceof RfiReadyValidationError)
    return apiError(context, 422, "RFI_READY_VALIDATION_FAILED", error.message);
  if (error instanceof RfiIssueRenderError)
    return apiError(context, 503, "RFI_ARTIFACT_RENDER_FAILED", error.message);
  if (error instanceof RfiIssueStorageError)
    return apiError(context, 503, "RFI_STORAGE_UNAVAILABLE", error.message);
  if (error instanceof RfiIssueCompensationError)
    return apiError(
      context,
      500,
      "RFI_ARTIFACT_RECONCILIATION_REQUIRED",
      error.message,
    );
  if (error instanceof RfiIssuePersistenceError)
    return apiError(context, 503, "RFI_ISSUE_COMMIT_FAILED", error.message);
  if (error instanceof RfiResponsePersistenceError)
    return apiError(context, 503, "RFI_RESPONSE_COMMIT_FAILED", error.message);
  if (error instanceof RfiResponsibleContactError)
    return apiError(
      context,
      400,
      "RFI_RESPONSIBLE_CONTACT_INVALID",
      error.message,
    );
  if (error instanceof RfiAttachmentRejectedError)
    return apiError(context, 409, "RFI_ATTACHMENT_REJECTED", error.message);
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
  if (error instanceof FileObjectIntegrityError)
    return apiError(context, 500, "FILE_OBJECT_INTEGRITY", error.message);
  if (error instanceof IssuanceNotFoundError)
    return apiError(
      context,
      404,
      "ISSUANCE_NOT_FOUND",
      "The requested issuance was not found.",
    );
  if (error instanceof IssuanceAuthorizationError)
    return apiError(
      context,
      403,
      "AUTHORIZATION_DENIED",
      "You are not allowed to access this resource.",
    );
  if (error instanceof IssuanceValidationError)
    return apiError(context, 400, "VALIDATION_FAILED", error.message);
  if (error instanceof IssuanceEligibilityError)
    return apiError(context, 409, "ISSUANCE_INELIGIBLE", error.message);
  if (error instanceof IssuanceFileObjectMissingError)
    return apiError(
      context,
      500,
      "ISSUANCE_FILE_OBJECT_MISSING",
      error.message,
    );
  if (error instanceof IssuanceFileObjectIntegrityError)
    return apiError(
      context,
      500,
      "ISSUANCE_FILE_OBJECT_INTEGRITY",
      error.message,
    );
  if (error instanceof IssuanceStorageVerificationError)
    return apiError(
      context,
      502,
      "ISSUANCE_STORAGE_UNAVAILABLE",
      error.message,
    );
  if (error instanceof IssuancePersistenceError)
    return apiError(context, 500, "ISSUANCE_PERSISTENCE_FAILED", error.message);
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
  // Schema drift diagnostic: a query referencing a column/table that does not
  // exist means the bound D1 database is missing pending migrations (e.g. a
  // preview deployment shipping new read models against an un-migrated database).
  // Surface a clear, actionable 503 instead of an opaque failure.
  if (
    error instanceof Error &&
    /no such (column|table)|has no column named/i.test(error.message)
  )
    return apiError(
      context,
      503,
      "DATABASE_SCHEMA_OUTDATED",
      "The database is missing pending migrations for this deployment. Apply D1 migrations (npm run db:migrate:remote) and retry.",
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
    templateVersionId: rfi.templateVersionId,
    rfiNumber: rfi.rfiNumber,
    legacyReference: rfi.legacyReference,
    status: rfi.status,
    subject: rfi.subject,
    question: rfi.question,
    contractorSuggestion: rfi.contractorSuggestion,
    drawingReferences: rfi.drawingReferences,
    specificationReferences: rfi.specificationReferences,
    responsiblePartyId: rfi.responsiblePartyId,
    responsibleParty: rfi.responsibleParty,
    responsiblePartyLegacyText: rfi.responsiblePartyLegacyText,
    submittedBy: rfi.submittedBy,
    requestedResponseDate: rfi.requestedResponseDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
    issuedAt: rfi.issuedAt,
    responseReceivedAt: rfi.responseReceivedAt,
    closedAt: rfi.closedAt,
    lockVersion: rfi.lockVersion,
    draftRevisionId: rfi.draftRevisionId,
    issuanceReconciliationState: rfi.issuanceReconciliationState,
    createdAt: rfi.createdAt,
    updatedAt: rfi.updatedAt,
  };
}
// Register row shape — the read-model item already carries server-computed
// overdue/due-soon flags, per-row capabilities, and lockVersion for inline edit.
function serializeRfiListItem(item: RfiListItem) {
  return {
    id: item.id,
    rfiNumber: item.rfiNumber,
    legacyReference: item.legacyReference,
    status: item.status,
    subject: item.subject,
    question: item.question,
    contractorSuggestion: item.contractorSuggestion,
    drawingReferences: item.drawingReferences,
    specificationReferences: item.specificationReferences,
    responsiblePartyId: item.responsiblePartyId,
    responsibleParty: item.responsibleParty,
    responsiblePartyLegacyText: item.responsiblePartyLegacyText,
    submittedBy: item.submittedBy,
    requestedResponseDate: item.requestedResponseDate,
    issuedAt: item.issuedAt,
    responseReceivedAt: item.responseReceivedAt,
    latestResponse: item.latestResponse,
    attachmentCount: item.attachmentCount,
    isOverdue: item.isOverdue,
    dueSoon: item.dueSoon,
    lockVersion: item.lockVersion,
    draftRevisionId: item.draftRevisionId,
    issuanceReconciliationState: item.issuanceReconciliationState,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    capabilities: { updateDraft: item.capabilities.updateDraft },
  };
}
function serializeRfiAttachment(attachment: {
  id: string;
  rfiId: string;
  revisionId: string;
  role: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
}) {
  return {
    id: attachment.id,
    rfiId: attachment.rfiId,
    revisionId: attachment.revisionId,
    role: attachment.role,
    originalFilename: attachment.originalFilename,
    mediaType: attachment.mediaType,
    byteSize: attachment.byteSize,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt,
  };
}
function rfiAttachmentContentResponse(
  context: ApiRequestContext,
  download: RfiAttachmentDownload,
): Response {
  const headers = new Headers({
    "Content-Type": download.attachment.mediaType,
    "Content-Disposition": buildContentDisposition(
      download.attachment.originalFilename,
    ),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": context.requestId,
  });
  headers.set("Content-Length", String(download.size));
  if (download.httpEtag) headers.set("ETag", download.httpEtag);
  return new Response(download.body, { status: 200, headers });
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
// List-summary shape for the Records register. Deliberately narrower than the
// full record: no storage keys, activity blobs, or raw authorization internals.
// `currentRevision` is the record's authoritative current revision (or null),
// `fileCount` is the total files across all of the record's revisions, and
// `updatedAt` is the record row's own last-modified time (record metadata),
// distinct from `createdAt`.
function serializeRecordSummary(summary: RecordListSummaryItem) {
  return {
    id: summary.id,
    projectId: summary.projectId,
    recordNumber: summary.recordNumber,
    title: summary.title,
    recordType: summary.recordType,
    discipline: summary.discipline,
    status: summary.status,
    currentRevision: summary.currentRevision
      ? {
          id: summary.currentRevision.id,
          revisionNumber: summary.currentRevision.revisionNumber,
          revisionLabel: summary.currentRevision.revisionLabel,
          status: summary.currentRevision.status,
          title: summary.currentRevision.title,
        }
      : null,
    hasDraftRevision: summary.hasDraftRevision,
    draftRevisionId: summary.draftRevisionId,
    fileCount: summary.fileCount,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    capabilities: {
      update: summary.capabilities.update,
      archive: summary.capabilities.archive,
    },
  };
}
function serializeTemplate(template: TemplateWithPublishedVersion) {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    kind: template.kind,
    createdBy: template.createdBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    publishedVersion: {
      id: template.publishedVersion.id,
      versionNumber: template.publishedVersion.versionNumber,
      definition: template.publishedVersion.definition,
      publishedAt: template.publishedVersion.publishedAt,
      publishedBy: template.publishedVersion.publishedBy,
    },
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
function serializeIssuanceSummary(issuance: IssuanceSummary) {
  return {
    id: issuance.id,
    issueNumber: issuance.issueNumber,
    recordId: issuance.recordId,
    revisionId: issuance.revisionId,
    purpose: issuance.purpose,
    issuedBy: issuance.issuedBy,
    issuedAt: issuance.issuedAt,
    fileCount: issuance.fileCount,
  };
}
function serializeIssuance(issuance: Issuance) {
  return {
    id: issuance.id,
    organizationId: issuance.organizationId,
    projectId: issuance.projectId,
    recordId: issuance.recordId,
    revisionId: issuance.revisionId,
    issueNumber: issuance.issueNumber,
    issueSequence: issuance.issueSequence,
    purpose: issuance.purpose,
    notes: issuance.notes,
    issuedBy: issuance.issuedBy,
    issuedAt: issuance.issuedAt,
    files: issuance.files.map((file) => ({
      fileId: file.fileId,
      originalFilename: file.originalFilename,
      mediaType: file.mediaType,
      byteSize: file.byteSize,
      sha256: file.sha256,
      displayOrder: file.displayOrder,
    })),
  };
}
function fileContentResponse(
  context: ApiRequestContext,
  download: FileDownload,
): Response {
  const headers = new Headers({
    // Content-Type comes from the authoritative persisted metadata, never
    // from R2's stored HTTP metadata, so a tampered or drifted object cannot
    // change the type the caller is told to expect.
    "Content-Type": download.file.mediaType,
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
function serializeRfiDetail(
  rfi: Rfi & {
    responses: RfiResponse[];
    attachments: {
      id: string;
      rfiId: string;
      revisionId: string;
      role: string;
      originalFilename: string;
      mediaType: string;
      byteSize: number;
      uploadedBy: string;
      uploadedAt: string;
    }[];
  },
) {
  return {
    ...serializeRfi(rfi),
    responses: rfi.responses.map(serializeRfiResponse),
    attachments: rfi.attachments.map(serializeRfiAttachment),
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
    subject: rfi.subject,
    question: rfi.question,
    contractorSuggestion: rfi.contractorSuggestion,
    drawingReferences: rfi.drawingReferences,
    specificationReferences: rfi.specificationReferences,
    responsiblePartyId: rfi.responsiblePartyId,
    submittedBy: rfi.submittedBy,
    requestedResponseDate: rfi.requestedResponseDate,
    costImpact: rfi.costImpact,
    scheduleImpact: rfi.scheduleImpact,
  };
}
function toRecordMetadataInput(record: Record) {
  return {
    recordType: record.recordType,
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
