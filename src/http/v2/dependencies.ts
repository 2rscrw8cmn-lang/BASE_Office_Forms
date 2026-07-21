import { OrganizationService } from "../../application/identity/organization-service";
import { SessionResolutionService } from "../../application/identity/session-resolution-service";
import { ProjectContactService } from "../../application/projects/project-contact-service";
import { ProjectService } from "../../application/projects/project-service";
import { DashboardReadModelService } from "../../application/read-models/dashboard-service";
import { ProjectOverviewReadModelService } from "../../application/read-models/project-overview-service";
import { ProjectRecordsReadModelService } from "../../application/read-models/project-records-service";
import { RecordWorkspaceReadModelService } from "../../application/read-models/record-workspace-service";
import { RfiService } from "../../application/rfis/rfi-service";
import { RecordService } from "../../application/records/record-service";
import { RevisionService } from "../../application/revisions/revision-service";
import { FileService } from "../../application/files/file-service";
import { IssuanceService } from "../../application/issuances/issuance-service";
import { TemplateService } from "../../application/templates/template-service";
import {
  CloudflareAccessAuthenticationAdapter,
  CloudflareAccessJwtVerifier,
} from "../../auth/cloudflare-access-adapter";
import type { AuthenticationAdapter } from "../../auth/authentication-adapter";
import { D1MembershipsRepository } from "../../infrastructure/db/d1/memberships-repository";
import { D1OrganizationsRepository } from "../../infrastructure/db/d1/organizations-repository";
import { D1ProjectContactsRepository } from "../../infrastructure/db/d1/project-contacts-repository";
import { D1ProjectMembershipsRepository } from "../../infrastructure/db/d1/project-memberships-repository";
import { D1ProjectsRepository } from "../../infrastructure/db/d1/projects-repository";
import { D1DashboardReadRepository } from "../../infrastructure/db/d1/dashboard-read-repository";
import { D1ProjectOverviewReadRepository } from "../../infrastructure/db/d1/project-overview-read-repository";
import { D1ProjectRecordsReadRepository } from "../../infrastructure/db/d1/project-records-read-repository";
import { D1RecordWorkspaceReadRepository } from "../../infrastructure/db/d1/record-workspace-read-repository";
import { D1RfiNumberSequencesRepository } from "../../infrastructure/db/d1/rfi-number-sequences-repository";
import { D1RfiRecordsRepository } from "../../infrastructure/db/d1/rfi-records-repository";
import { D1RfiResponsesRepository } from "../../infrastructure/db/d1/rfi-responses-repository";
import { D1RecordsRepository } from "../../infrastructure/db/d1/records-repository";
import { D1RecordRevisionsRepository } from "../../infrastructure/db/d1/record-revisions-repository";
import { D1RecordRevisionSequencesRepository } from "../../infrastructure/db/d1/record-revision-sequences-repository";
import { D1RevisionFilesRepository } from "../../infrastructure/db/d1/revision-files-repository";
import { D1IssuancesRepository } from "../../infrastructure/db/d1/issuances-repository";
import { D1ProjectIssuanceSequencesRepository } from "../../infrastructure/db/d1/project-issuance-sequences-repository";
import { D1TemplatesRepository } from "../../infrastructure/db/d1/templates-repository";
import { D1UsersRepository } from "../../infrastructure/db/d1/users-repository";
import { R2FileStorage } from "../../infrastructure/storage/r2-file-storage";

export interface V2Environment {
  DB: D1Database;
  FILES: R2Bucket;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface V2RouteDependencies {
  authenticationAdapter: AuthenticationAdapter;
  organizations: OrganizationService;
  projects?: ProjectService;
  projectContacts?: ProjectContactService;
  rfis?: RfiService;
  records?: RecordService;
  revisions?: RevisionService;
  files?: FileService;
  issuances?: IssuanceService;
  templates?: TemplateService;
  dashboard?: DashboardReadModelService;
  projectOverview?: ProjectOverviewReadModelService;
  projectRecords?: ProjectRecordsReadModelService;
  recordWorkspace?: RecordWorkspaceReadModelService;
}

export function createV2RouteDependencies(
  environment: V2Environment,
): V2RouteDependencies {
  const users = new D1UsersRepository(environment.DB);
  const memberships = new D1MembershipsRepository(environment.DB);
  const projects = new ProjectService(
    new D1ProjectsRepository(environment.DB),
    new D1ProjectMembershipsRepository(environment.DB),
  );
  const rfiSequences = new D1RfiNumberSequencesRepository(environment.DB);
  const rfiResponses = new D1RfiResponsesRepository(environment.DB);
  const recordRevisionSequences = new D1RecordRevisionSequencesRepository(
    environment.DB,
  );
  const records = new D1RecordsRepository(environment.DB);
  const revisions = new D1RecordRevisionsRepository(
    environment.DB,
    recordRevisionSequences,
  );
  const files = new D1RevisionFilesRepository(environment.DB);
  const storage = new R2FileStorage(environment.FILES);
  const sessions = new SessionResolutionService(users, memberships);
  const accessConfiguration = {
    teamDomain: environment.CF_ACCESS_TEAM_DOMAIN,
    audience: environment.CF_ACCESS_AUD,
  };

  return {
    authenticationAdapter: new CloudflareAccessAuthenticationAdapter(
      sessions,
      new CloudflareAccessJwtVerifier(accessConfiguration),
      accessConfiguration,
    ),
    organizations: new OrganizationService(
      new D1OrganizationsRepository(environment.DB),
      memberships,
    ),
    projects,
    projectContacts: new ProjectContactService(
      projects,
      new D1ProjectContactsRepository(environment.DB),
    ),
    rfis: new RfiService(
      projects,
      new D1RfiRecordsRepository(environment.DB, rfiSequences, rfiResponses),
      rfiResponses,
    ),
    records: new RecordService(projects, records),
    revisions: new RevisionService(projects, records, revisions),
    files: new FileService(projects, records, revisions, files, storage),
    issuances: new IssuanceService(
      projects,
      records,
      revisions,
      files,
      new D1IssuancesRepository(
        environment.DB,
        new D1ProjectIssuanceSequencesRepository(environment.DB),
      ),
      users,
      storage,
    ),
    templates: new TemplateService(new D1TemplatesRepository(environment.DB)),
    dashboard: new DashboardReadModelService(
      projects,
      new D1DashboardReadRepository(environment.DB),
    ),
    projectOverview: new ProjectOverviewReadModelService(
      projects,
      new D1ProjectOverviewReadRepository(environment.DB),
    ),
    projectRecords: new ProjectRecordsReadModelService(
      projects,
      new D1ProjectRecordsReadRepository(environment.DB),
    ),
    recordWorkspace: new RecordWorkspaceReadModelService(
      projects,
      new D1RecordWorkspaceReadRepository(environment.DB),
    ),
  };
}
