# Asas API

Fastify 5 API for the Asas platform. It uses PostgreSQL through Prisma, Better Auth session cookies, shared Zod contracts, and the domain package for business calculations.

## Local setup

From the repository root:

```bash
pnpm install
pnpm --filter @asas/api run prisma:generate
pnpm --filter @asas/api run prisma:migrate
pnpm --filter @asas/api run dev
```

Copy `.env.example` to `.env` first and set `DATABASE_URL`, a random `AUTH_SECRET`, and independent random `ENCRYPTION_KEY` and `BANK_DATA_ENCRYPTION_KEY` values.

### Production environment checklist

The API refuses to boot in production unless the following are configured:

- `AUTH_SECRET` with at least 32 characters and not reused as an encryption key.
- `ENCRYPTION_KEY` with at least 32 characters, independent of `AUTH_SECRET`, for integration credentials.
- `BANK_DATA_ENCRYPTION_KEY` with at least 32 characters, independent of the other keys, for employee bank details.
- `BETTER_AUTH_URL` and every `FRONTEND_ORIGIN` entry using HTTPS. `FRONTEND_ORIGIN` has no production default and must be set explicitly.
- `TRUSTED_PROXY_CIDRS` listing the exact reverse-proxy IPs or CIDRs. Trust-all values (`*`, `0.0.0.0/0`, `::/0`, `true`) are rejected. Leaving it empty is accepted but logs a warning: every request then reports the platform's own socket address, which collapses rate limiting into one shared bucket and loses the real client IP in audit rows.
- `RLS_ENFORCEMENT=enforce`; disabling the application-level tenant guard is rejected in production.
- `OBJECT_STORAGE_DRIVER=s3` with `S3_BUCKET` and the required region or endpoint credentials.
- Stripe keys and webhook secret configured together, with an allow-list of recurring Price IDs when billing is enabled.

Generate each secret independently with a cryptographically secure random source, store it in the deployment secret manager, and never commit it. Rotating an encryption key requires a planned decrypt-and-re-encrypt migration.

### Platform owner console

The `/admin` web console is backed by `/api/v1/platform/*`. It is separate from workspace Settings and requires a platform role on the user account.

- `PLATFORM_OWNER_EMAILS` is a comma-separated bootstrap allow-list. The first verified session or platform-console request from an allow-listed account with no platform role promotes it to platform `OWNER`. Remove the address after promotion; otherwise a future account with that address can bootstrap again.
- `PLATFORM_REQUIRE_2FA=true` requires both an enrolled second factor and a session that completed a challenge. Leave it off until the owner has enrolled TOTP, then turn it on. Better Auth challenges credential sign-ins itself; OAuth callbacks and trusted-device sign-ins create sessions without a challenge, so the console returns `403` with `details.reason = 'VERIFY'` until the operator verifies a code at `POST /api/v1/platform/step-up`. `details.reason = 'ENROLL'` means the account has no second factor yet.
- Deploy migration `20261028120000_platform_admin` and `20261028130000_session_two_factor_verified` before starting the matching API version. They add `User.platformRole`, tenant suspension fields, `PlatformAuditLog`, `PlatformSetting`, and the `Session.twoFactorVerifiedAt` marker.
- Platform writes are recorded in `PlatformAuditLog`. The table is append-only in the application; no update or delete endpoint exists.
- Cross-tenant platform reads and writes run through `withPlatformAccess`, which enables the application cross-tenant scope and PostgreSQL `app.bypass_rls` for one transaction. Do not call it from workspace modules.
- Global switches are `maintenance_mode`, `signups_enabled`, and `exports_enabled`. Maintenance blocks workspace API traffic while leaving auth, health, and platform routes reachable.
- Workspace suspension sets `Tenant.status = 'SUSPENDED'`; the workspace guards return `403` with `details.code = 'WORKSPACE_SUSPENDED'`, and the web shell shows a suspended screen.
- Paid Stripe subscriptions cannot be comped from the console. Plan comps are limited to workspaces without a Stripe subscription; Stripe remains the source of truth for paid billing.

### Tenant isolation

Tenant-owned PostgreSQL tables have row-level security policies as defence-in-depth. The API also applies a Prisma client extension that reads a request-scoped tenant context after authentication and injects the active `tenantId` into reads, writes, counts, aggregates, and upserts on every model that has a `tenantId` column. An operation that explicitly references a different tenant is rejected before it reaches PostgreSQL.

Operations that genuinely span tenants, such as maintenance sweeps and platform billing reconciliation, must use the explicit `withCrossTenantAccess` helper and require a test proving the scope is intentional. Raw SQL bypasses the Prisma extension; it must include a tenant predicate or run inside `withTenantContext`. `pnpm --filter @asas/api run lint` includes the tenant-filter tripwire for raw query call sites.

Application code must still scope its own queries. The guard is a safety net, not a replacement for authorization or correct data modeling. The `RLS_ENFORCEMENT=off` setting exists only for local diagnostics and is rejected in production.

For email delivery, configure either SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`) or `RESEND_API_KEY`, plus a sender address on a verified domain in `MAIL_FROM`. Brevo's free SMTP relay is the recommended $0 option; a Resend key takes precedence when both are set. When `QUEUE_URL` is set, email is dispatched through the pg-boss `emails` queue with retries; otherwise it is delivered inline. With neither provider configured, endpoints that send mail return `503` and `/ready` reports `emailDelivery: "disabled"` rather than recording a message as sent. Keep provider credentials in the deployment secret store, not in source control.

### Integration credential encryption

Third-party API keys and webhook tokens stored through the integrations module are encrypted with AES-256-GCM, bound to their tenant with additional authenticated data, and decrypted only inside authorized server-side handlers. Production requires a dedicated `ENCRYPTION_KEY` of at least 32 characters that is different from `AUTH_SECRET`; there is no hard-coded fallback. Keep the key stable in the deployment secret manager and plan a decrypt-and-re-encrypt migration before rotation.

### Employee bank-data encryption

Employee routing/account numbers, IBANs, and BICs are encrypted with AES-256-GCM before writes, bound to their tenant and field, and decrypted only in the existing ADMIN-gated employee and payroll responses. Set a dedicated `BANK_DATA_ENCRYPTION_KEY` of at least 32 characters in every production API environment and keep it stable in the deployment secret manager. The API refuses production startup without it. Do not rotate or replace the key without a planned decrypt-and-reencrypt migration; a lost key makes encrypted bank details unrecoverable.

After every API instance has been upgraded to write encrypted values, backfill legacy plaintext rows from the repository root with `pnpm --filter @asas/api data:encrypt-employee-bank-details`. The operation is idempotent, processes records in batches, and uses compare-and-set writes so a concurrent employee edit is reported instead of overwritten; rerun after resolving the reported row. Legacy reads remain compatible during this rollout. New employee imports and sample-data setup also encrypt bank fields. Full workspace JSON archives omit bank identifiers and state that exclusion in the archive metadata and Settings UI.

### Email deployment and acceptance

1. Create a free Brevo account and verify a sender domain or sender address. Brevo's free plan allows 300 messages per day, which is enough for transactional sign-up, verification, and reset mail.
2. Set `SMTP_HOST="smtp-relay.brevo.com"`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, and `SMTP_PASS` (the SMTP key from Brevo -> SMTP & API -> SMTP) in the API deployment's secret/environment settings. Alternatively, verify the domain in Resend, create a sending key, and set `RESEND_API_KEY` instead; a Resend key takes precedence over SMTP.
3. Set `MAIL_FROM` to an address on the verified domain (for example, `Asas <notifications@example.com>`). Do not commit provider credentials or the sender address. For local Compose, put them in `apps/api/.env`, which the API container loads.
4. For queued delivery, set `QUEUE_URL` to a PostgreSQL connection available to the API (typically the same Neon database as `DATABASE_URL`). Without it, messages are sent inline and provider latency/failures affect the originating request.
5. Restart/redeploy the API and check `/ready`: `emailDelivery: "configured"` confirms a transport is present. It does not prove the credentials, sender, domain, or recipient are accepted by the provider.
6. In a staging workspace, trigger a password reset for a controlled test account and confirm receipt, sender, link destination, and provider delivery status. If using pg-boss, confirm the queued job completes and that a deliberate provider failure is retried. Do not test with a real customer's address.

Email delivery is intentionally not part of the database readiness gate. If email is disabled, `/ready` reports `emailDelivery: "disabled"` while the API can still serve non-email features.

### Stripe subscription billing

Stripe billing is disabled unless `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and at least one allow-listed `STRIPE_PRICE_IDS` value are configured. Use active recurring monthly Prices from the same Stripe account; comma-separate multiple Price IDs. Each Stripe Product must have positive numeric `seat_limit` and `storage_limit_gb` metadata. The plan list is read from Stripe, and checkout accepts only allow-listed IDs with valid quota metadata. Checkout and the billing portal redirect to Stripe-hosted pages.

Create a Stripe webhook endpoint at `/api/v1/billing/stripe/webhook` and subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.updated`, `payment_method.attached`, `payment_method.detached`, `invoice.paid`, and `invoice.payment_failed`. Set the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. Signature verification uses the original request bytes; subscription, saved card, and invoice state changes and the event de-duplication record commit together. Saved card data is limited to brand, last four digits, and expiration; Stripe remains responsible for sensitive card details. Configure the Customer Portal in Stripe before exposing its manage-billing link.

Use Stripe test-mode keys and prices in staging first, then verify checkout, cancellation/update through the portal, invoice history, duplicate webhook delivery, saved card updates/removal, and failed-payment state. Apply migrations `20261012020000_stripe_billing` and `20261012030000_stripe_payment_method_sync` before starting the matching API version, and verify the full flow in an isolated staging environment. No live Stripe credentials are stored in the repository.

### Bank statement reconciliation

The Finance > Bank Reconciliation screen accepts CSV files with `Date`, `Description`, `Currency`, and `Amount` columns; `Reference` is optional. Amounts are signed from the bank account's point of view (credits/inflows positive, debits/outflows negative). Dates accept `YYYY-MM-DD` or `MM/DD/YYYY`; amounts support up to four decimal places. Imports are limited to 500 rows and 2 MiB. The original file is not retained.

Suggestions only consider recorded, unreversed AP payments, AR collections, payroll payments, and expense reimbursements on the `CASH_CLEARING` account. A candidate must match the signed amount and currency exactly and fall within three calendar days. A user must confirm each match; matching does not create or edit ledger entries. Duplicate normalized imports are deduplicated per tenant. Import and match actions are audit logged, and matches can be undone.

Migration `20261012040000_bank_statement_reconciliation` adds statement import/line tables and tenant-composite constraints. Apply it with the rest of the pending migrations, then test the workflow in staging against PostgreSQL 17 before production use. Bank feed connections, NACHA/SEPA/ABA payment files, and automatic reconciliation are not included.

### S3-compatible object storage

Local disk remains the development default. Production startup requires `OBJECT_STORAGE_DRIVER=s3`, `S3_BUCKET`, and `S3_REGION` to prevent files being written to ephemeral container storage. AWS deployments can use the runtime IAM role and leave `S3_ENDPOINT`/static credentials empty. For Cloudflare R2, set `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, and the bucket-scoped `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`. Keep the bucket private; scope object read/write/copy/delete to the app's prefixes and `s3:ListBucket` to those prefixes with the bucket policy's `s3:prefix` condition. The billing storage meter reads `resumes/<tenant>/`, `exports/<tenant>/`, and `staging/resumes/<tenant>/`.

Candidate CVs upload directly to a short-lived, content-type-signed staging URL. The authenticated API checks the staged object's size and PDF signature before copying it to its tenant-scoped final key. Configure bucket CORS for the exact frontend origins with `PUT` and the `Content-Type` request header. Add a lifecycle rule to expire the `staging/` prefix after one day so abandoned uploads are removed. The API enforces the 5 MiB final-file limit after upload; the temporary staging key is cleaned by lifecycle if a client abandons or uploads an invalid object.

Exports and CV previews remain behind authenticated API routes; they are stored under tenant-scoped object keys and the API never makes the bucket public. `/ready` reports `objectStorage: "s3"` when the S3 driver is active; this confirms configuration, not provider reachability.

#### Copy existing local files before switching

Keep the old API process and local files available while copying. Configure the S3 variables in `apps/api/.env`, then run the migration from the repository root:

```bash
pnpm --filter @asas/api storage:migrate-local-to-s3
pnpm --filter @asas/api storage:migrate-local-to-s3 -- --apply
```

The first command is a read-only dry run; the second copies CVs and completed exports and verifies each uploaded object's size. It never deletes local files. Investigate any nonzero `*MissingLocally` count before switching `OBJECT_STORAGE_DRIVER=s3` and deploying the new API. No database migration is required.

The API listens on `http://127.0.0.1:4000` by default. The OpenAPI UI is mounted at `/docs` outside production, and in production only when `ENABLE_API_DOCS=true`.

## Checks

```bash
pnpm --filter @asas/api run typecheck
pnpm --filter @asas/api run test
pnpm --filter @asas/api run build
```
