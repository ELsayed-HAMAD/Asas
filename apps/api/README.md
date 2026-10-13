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

Copy `.env.example` to `.env` first and set `DATABASE_URL` and `AUTH_SECRET`.

For email delivery, configure `RESEND_API_KEY` and a verified `MAIL_FROM` address. When `QUEUE_URL` is set, email is dispatched through the pg-boss `emails` queue with retries; otherwise it is delivered inline. Without a Resend key, email sends fail explicitly rather than being recorded as successful. Keep provider credentials in the deployment secret store, not in source control.

### Resend deployment and acceptance

1. Verify the sending domain in Resend and create an API key with email send access.
2. Set `RESEND_API_KEY` and `MAIL_FROM` in the API deployment's secret/environment settings. `MAIL_FROM` must use the verified domain (for example, `Asas <notifications@example.com>`). Do not commit either value. For local Compose, put them in `apps/api/.env`, which the API container loads.
3. For queued delivery, set `QUEUE_URL` to a PostgreSQL connection available to the API (typically the same Neon database as `DATABASE_URL`). Without it, messages are sent inline and provider latency/failures affect the originating request.
4. Restart/redeploy the API and check `/ready`: `emailDelivery: "configured"` confirms the key is present. It does not prove the key, sender, domain, or recipient are accepted by Resend.
5. In a staging workspace, trigger a password reset for a controlled test account and confirm receipt, sender, link destination, and provider delivery status. If using pg-boss, confirm the queued job completes and that a deliberate provider failure is retried. Do not test with a real customer's address.

Email delivery is intentionally not part of the database readiness gate. If email is disabled, `/ready` reports `emailDelivery: "disabled"` while the API can still serve non-email features.

### Stripe subscription billing

Stripe billing is disabled unless `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and at least one allow-listed `STRIPE_PRICE_IDS` value are configured. Use active recurring monthly Prices from the same Stripe account; comma-separate multiple Price IDs. Each Stripe Product must have positive numeric `seat_limit` and `storage_limit_gb` metadata. The plan list is read from Stripe, and checkout accepts only allow-listed IDs with valid quota metadata. Checkout and the billing portal redirect to Stripe-hosted pages.

Create a Stripe webhook endpoint at `/api/v1/billing/stripe/webhook` and subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.updated`, `payment_method.attached`, `payment_method.detached`, `invoice.paid`, and `invoice.payment_failed`. Set the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. Signature verification uses the original request bytes; subscription, saved card, and invoice state changes and the event de-duplication record commit together. Saved card data is limited to brand, last four digits, and expiration; Stripe remains responsible for sensitive card details. Configure the Customer Portal in Stripe before exposing its manage-billing link.

Use Stripe test-mode keys and prices in staging first, then verify checkout, cancellation/update through the portal, invoice history, duplicate webhook delivery, saved card updates/removal, and failed-payment state. Migrations `20261012020000_stripe_billing` and `20261012030000_stripe_payment_method_sync` are confirmed deployed by the user. No live Stripe credentials are stored in the repository.

### Bank statement reconciliation

The Finance > Bank Reconciliation screen accepts CSV files with `Date`, `Description`, `Currency`, and `Amount` columns; `Reference` is optional. Amounts are signed from the bank account's point of view (credits/inflows positive, debits/outflows negative). Dates accept `YYYY-MM-DD` or `MM/DD/YYYY`; amounts support up to four decimal places. Imports are limited to 500 rows and 2 MiB. The original file is not retained.

Suggestions only consider recorded, unreversed AP payments, AR collections, payroll payments, and expense reimbursements on the `CASH_CLEARING` account. A candidate must match the signed amount and currency exactly and fall within three calendar days. A user must confirm each match; matching does not create or edit ledger entries. Duplicate normalized imports are deduplicated per tenant. Import and match actions are audit logged, and matches can be undone.

Migration `20261012040000_bank_statement_reconciliation` adds statement import/line tables and tenant-composite constraints; the user confirmed it deployed successfully on 2026-10-12. Test the workflow in staging against that database before production use. Bank feed connections, NACHA/SEPA/ABA payment files, and automatic reconciliation are not included.

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

The API listens on `http://127.0.0.1:4000` by default. OpenAPI is available at `/docs`.

## Checks

```bash
pnpm --filter @asas/api run typecheck
pnpm --filter @asas/api run test
pnpm --filter @asas/api run build
```
