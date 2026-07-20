export type MembershipRole =
  | "org_admin"
  | "document_control_admin"
  | "project_manager"
  | "contributor"
  | "viewer";

export interface ProjectPermissionSet {
  projectId: string;
  capabilities: readonly string[];
}

export interface AppSession {
  userId: string;
  organizationId: string;
  membershipRole: MembershipRole;
  projectPermissions: readonly ProjectPermissionSet[];
}

export type AuthenticationResult =
  | { authenticated: true; session: AppSession }
  | {
      authenticated: false;
      reason:
        | "MISSING_CREDENTIALS"
        | "INVALID_CREDENTIALS"
        | "AUTH_PROVIDER_UNAVAILABLE"
        | "USER_DISABLED"
        | "MEMBERSHIP_REQUIRED"
        | "MEMBERSHIP_INACTIVE"
        | "ORGANIZATION_SELECTION_REQUIRED";
    };

/**
 * Provider-neutral authentication boundary for platform routes.
 * Implementations may inspect provider headers; domain services receive AppSession only.
 */
export interface AuthenticationAdapter {
  authenticate(request: Request): Promise<AuthenticationResult>;
}
