import { OrganizationService } from "../../application/identity/organization-service";
import { SessionResolutionService } from "../../application/identity/session-resolution-service";
import { ProjectContactService } from "../../application/projects/project-contact-service";
import { ProjectService } from "../../application/projects/project-service";
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
import { D1UsersRepository } from "../../infrastructure/db/d1/users-repository";

export interface V2Environment {
  DB: D1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface V2RouteDependencies {
  authenticationAdapter: AuthenticationAdapter;
  organizations: OrganizationService;
  projects?: ProjectService;
  projectContacts?: ProjectContactService;
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
  };
}
