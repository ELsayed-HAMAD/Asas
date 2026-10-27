## Summary

Describe the change and the problem it solves.

## Related issue

Link the issue or write `None`.

## Changes

- 

## Security impact

Describe any effect on authentication, authorization, tenant isolation,
cryptography, uploads, billing, headers, or dependency supply chain. Write
`None` only after confirming there is no security-relevant behavior change.

## Testing

List the commands and scenarios you ran. Include migration or PostgreSQL
coverage when applicable.

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e` (for browser-facing changes)
- [ ] `pnpm build`
- [ ] `pnpm audit --prod --audit-level high`

## Checklist

- [ ] I did not commit `.env` files, credentials, tokens, private keys, real
      employee or customer data, database dumps, or generated storage exports.
- [ ] New or changed tenant-owned queries are scoped to the authenticated
      tenant, and cross-tenant access is explicit and tested.
- [ ] New or changed protected routes enforce authorization on the server.
- [ ] New environment variables fail closed in production and are documented
      in `.env.example`.
- [ ] Database migrations are forward-only, tested against PostgreSQL 17, and
      include tenant constraints and RLS policies where needed.
- [ ] Documentation is updated for configuration or operational changes.
- [ ] I have read [SECURITY.md](../SECURITY.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
