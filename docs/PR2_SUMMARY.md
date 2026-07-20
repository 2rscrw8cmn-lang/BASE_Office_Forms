# PR 2 — Identity and Tenant Foundation

## Scope

This change adds the first tenant-aware platform layer without changing the legacy
shared-library API, renderer, `documents`, or `folders` behavior.

Implemented:

- additive D1 migration `0003_identity_and_organizations.sql` for organizations,
  users, organization memberships, and append-only membership activity events;
- tenant-scoped D1 repositories and identity/organization/membership services;
- provider-neutral `AppSession` resolution from a verified Cloudflare Access identity;
- Cloudflare Access JWT assertion validation using configured issuer, audience, and
  Access JWKS before any identity claim is trusted;
- organization request context derived solely from an active membership;
- role capability primitives (`members:read`, `members:manage`);
- `GET /api/v2/session`, `GET /api/v2/organizations/current`, and
  `GET /api/v2/members`;
- integration coverage for authentication, membership authorization, append-only
  membership activity, and attempts to forge organization context across tenants.

Not implemented:

- projects, contacts, records, RFIs, submittals, files, dashboards, invitations,
  external sharing, or AI.

## Deployment configuration

Configure the Pages environment with `CF_ACCESS_TEAM_DOMAIN` (including `https://`)
and `CF_ACCESS_AUD`. Protected v2 endpoints return a stable `503
AUTHENTICATION_UNAVAILABLE` error until both are present. Migrations are deployed
with the normal explicit D1 migration command; no request handler creates schema.

## Migration and recovery

`0003_identity_and_organizations.sql` is additive. It leaves the legacy library
tables untouched. Before a production migration, take the required D1 backup. A
production rollback is a forward-fix/restore decision: do not drop identity tables
once they contain operational membership and audit data.
