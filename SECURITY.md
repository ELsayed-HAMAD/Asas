# Security Policy

## Supported versions

Asas is pre-1.0. Security fixes are applied to the latest `main` branch only;
older commits, tags, and forks are not supported. Deployments must track a
reviewed commit on `main` and apply database migrations before starting the
matching API version.

## Reporting a vulnerability

Do **not** open a public issue, discussion, or pull request for a suspected
vulnerability, and do not include exploit details in public channels.

Report privately through GitHub's private vulnerability reporting:

<https://github.com/ELsayed-HAMAD/Asas/security/advisories/new>

If that form is unavailable, contact the repository owner through their GitHub
profile and ask for a private reporting channel. Do not send secrets or
personal data in the first message.

Please include:

- The affected component and version or commit.
- A clear description of the impact and the conditions required to exploit it.
- Reproduction steps or a minimal proof of concept using synthetic data.
- Any suggested remediation, if known.
- Whether the issue has been disclosed elsewhere.

Never test against production data, other tenants' workspaces, real employee
records, or third-party accounts you do not own. Use a local or isolated
staging environment and synthetic records.

## What to expect

- We aim to acknowledge a report within 3 business days.
- We aim to complete initial triage within 7 business days.
- Valid critical issues are prioritized for the next available fix.
- We will coordinate disclosure with the reporter after a fix is available.
- We do not operate a bug bounty program and cannot guarantee payment.

## Scope

In scope:

- Authentication, session handling, authorization, and tenant isolation.
- Credential and employee bank-data encryption.
- API request validation, file uploads, exports, and signed URLs.
- Billing webhooks and subscription entitlement enforcement.
- Security headers, proxy trust, rate limiting, and audit logging.
- CI/CD, dependency, container, and repository configuration.

Out of scope:

- Reports generated only by an automated scanner without a demonstrated impact.
- Denial-of-service reports that require unrealistic resources.
- Social engineering, phishing, or physical attacks.
- Vulnerabilities in third-party services, providers, or the reporter's own
  environment.
- The development-only credentials in `docker-compose.yml`; they are not
  production secrets and must never be reused outside local development.
- Missing hardening headers on non-production development servers.

## Safe harbor

We will not pursue legal action for good-faith research that follows this
policy, avoids privacy violations and service disruption, and gives us a
reasonable opportunity to fix the issue before disclosure. This safe harbor
does not authorize accessing data you do not own or exceeding the permissions
granted to your account.

## If you find a secret

Do not use, copy, or share the secret. Report it immediately through the
private channel above. If the secret belongs to a third-party provider, also
follow that provider's incident-reporting process. The maintainers will rotate
the credential, remove it from history, and review audit logs for misuse.
