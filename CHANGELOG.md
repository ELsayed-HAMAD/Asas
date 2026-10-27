# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository security policy, contribution guidance, code of conduct,
  changelog, issue and pull request templates, and code ownership.
- Automated secret scanning in CI and weekly dependency update configuration.
- Application-level Prisma tenant guard with request-scoped tenant context and
  cross-tenant rejection tests.
- PostgreSQL RLS migration test coverage.

### Changed

- Production now requires independent `AUTH_SECRET`, `ENCRYPTION_KEY`, and
  `BANK_DATA_ENCRYPTION_KEY` values, an explicit reverse-proxy trust boundary,
  and tenant-guard enforcement.
- Credential and bank-data encryption no longer falls back to hard-coded keys
  or reuses the authentication secret in production.
- Web and API traffic is same-origin behind nginx, enabling a strict
  `connect-src 'self'` content security policy.
- nginx adds CSP, HSTS, frame denial, Permissions-Policy, COOP, and CORP
  headers, and proxies API and SSE traffic without buffering.
- CI uses read-only workflow permissions, pinned actions, immutable checkout
  credentials, a high-severity dependency audit threshold, and secret scanning.
- Dependencies and transitive overrides were updated to remove high and
  critical advisories and resolve peer dependency conflicts.
- README and API documentation now describe the current security model and no
  longer claim unverified production deployments.

### Removed

- Internal documents, local audit output, historical environment files, and
  personal fixture data from the repository history.
- Broad documentation ignore rules that could hide legitimate security and
  contribution files.

## [0.1.0] - 2026-10-26

### Added

- Initial public baseline of the Asas multi-tenant operations platform:
  HR and payroll, finance, CRM, projects, inventory, notifications, exports,
  billing, and workspace administration.
- React web application, Fastify API, shared Zod contracts, and TypeScript
  domain package.
- PostgreSQL schema, migrations, and row-level security policies.
- Unit, integration, browser, and migration test suites.
