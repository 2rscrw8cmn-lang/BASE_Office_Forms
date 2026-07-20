import { createRemoteJWKSet, jwtVerify } from "jose";

import type {
  AuthenticationAdapter,
  AuthenticationResult,
} from "./authentication-adapter";
import type { SessionResolutionService } from "../application/identity/session-resolution-service";
import type { ExternalIdentity } from "../infrastructure/db/d1/users-repository";

interface AccessJwtPayload {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
}

export interface CloudflareAccessIdentityVerifier {
  verify(request: Request): Promise<ExternalIdentity | null>;
}

export interface CloudflareAccessConfiguration {
  teamDomain?: string;
  audience?: string;
}

export class CloudflareAccessJwtVerifier implements CloudflareAccessIdentityVerifier {
  constructor(private readonly configuration: CloudflareAccessConfiguration) {}

  async verify(request: Request): Promise<ExternalIdentity | null> {
    const token = request.headers.get("cf-access-jwt-assertion");
    const teamDomain = this.configuration.teamDomain;
    const audience = this.configuration.audience;
    if (!token || !teamDomain || !audience) {
      return null;
    }

    try {
      const issuer = new URL(teamDomain).origin;
      const keySet = createRemoteJWKSet(
        new URL(`${issuer}/cdn-cgi/access/certs`),
      );
      const { payload } = await jwtVerify(token, keySet, { issuer, audience });
      return accessIdentityFromPayload(payload);
    } catch {
      return null;
    }
  }
}

function accessIdentityFromPayload(
  payload: AccessJwtPayload,
): ExternalIdentity | null {
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return null;
  }
  const email = payload.email.trim().toLowerCase();
  if (!email) {
    return null;
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const givenName =
    typeof payload.given_name === "string" ? payload.given_name.trim() : "";
  const familyName =
    typeof payload.family_name === "string" ? payload.family_name.trim() : "";
  return {
    subject: payload.sub,
    email,
    displayName:
      name || [givenName, familyName].filter(Boolean).join(" ") || email,
  };
}

export class CloudflareAccessAuthenticationAdapter implements AuthenticationAdapter {
  constructor(
    private readonly sessions: SessionResolutionService,
    private readonly verifier: CloudflareAccessIdentityVerifier,
    private readonly configuration: CloudflareAccessConfiguration,
  ) {}

  async authenticate(request: Request): Promise<AuthenticationResult> {
    if (!this.configuration.teamDomain || !this.configuration.audience) {
      return { authenticated: false, reason: "AUTH_PROVIDER_UNAVAILABLE" };
    }
    if (!request.headers.get("cf-access-jwt-assertion")) {
      return { authenticated: false, reason: "MISSING_CREDENTIALS" };
    }
    const identity = await this.verifier.verify(request);
    if (!identity) {
      return { authenticated: false, reason: "INVALID_CREDENTIALS" };
    }
    const result = await this.sessions.resolve(identity);
    return result.resolved
      ? { authenticated: true, session: result.session }
      : { authenticated: false, reason: result.reason };
  }
}
