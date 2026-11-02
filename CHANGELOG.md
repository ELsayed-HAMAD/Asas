# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-02

### Changed
- Dark mode rebuilt on a neutral Carbon/Primer-style palette: one flat platform background, opaque chrome, and glass content surfaces for cards, tables and inputs.
- Legacy light-mode utility classes bridged onto the dark tokens across 23 modules, and the settings shell aligned with the rest of the app.
- Dashboard and payroll blocks keep identical geometry between empty and populated states, with no visible scrollbars.
- Metrics render `0` or a dash instead of placeholder words.

### Added
- Sample pack now seeds deal stage history, closed deals, quotas, forecast snapshots, twelve months of balanced settlements, current-week timesheets with dated days, leave policies and sprint issue dates.
- Sample data can be rebuilt in place for an unchanged workspace while edited data still returns 409.
- Repository description, topics and Discussions.

### Fixed
- Employee list no longer fails when stored bank ciphertext cannot be decrypted.
- Payroll run selector reads as empty when the workspace has no runs instead of opening a blank menu.

## [0.1.0] - 2026-10-27

### Added

- Initial baseline of the Asas multi-tenant operations platform: HR and payroll,
  finance, CRM, projects, inventory, notifications, exports, billing, and
  workspace administration.
- React web application, Fastify API, shared Zod contracts, and TypeScript
  domain package.
- PostgreSQL schema, migrations, and row-level security policies.
- Unit, integration, browser, and migration test suites.
- Repository security policy, contribution guidance, code of conduct, code
  ownership, issue and pull request templates, and changelog.
- Automated secret scanning and a production dependency audit in CI.
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
- Dependabot is limited to weekly grouped patch and minor updates plus security
  fixes; major upgrades stay manual. The CI production audit and manual
  `pnpm audit` remain the dependency update signal.

### Removed

- Internal documents, local audit output, historical environment files, and
  personal fixture data from the repository history.
- Broad documentation ignore rules that could hide legitimate security and
  contribution files.
