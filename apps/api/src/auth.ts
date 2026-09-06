import type { PrismaClient } from '@prisma/client'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { organization } from 'better-auth/plugins'
import type { AsasEnv } from './config/env.js'

/**
 * Better Auth, with the `organization` plugin mapped onto the existing `Tenant` table.
 *
 * This is the "one delicate migration" from the rebuild plan (Phase 1 §4): `Member`/
 * `Invitation` remap better-auth's default `organizationId` column to `tenantId` so they read
 * like every other one of the 60 ERP models, and `organization.fields.logo` reuses the
 * existing `Tenant.logoUrl` column instead of adding a duplicate. `additionalFields` exposes
 * `Tenant`'s pre-existing business columns (currency, timezone, ...) through better-auth's own
 * API/client surface — no new columns, just visibility.
 *
 * The `databaseHooks.session.create.before` hook is the plan's "workspace picker closes for
 * free" moment: a fresh session for a user with exactly one organization gets its
 * `activeOrganizationId` auto-assigned, so a single-workspace user never sees a picker. Users
 * with zero or several organizations land on the onboarding page, which creates the first
 * or lets them choose among the rest.
 *
 * KNOWN GAP: `Member.role`/`Invitation.role` are the app's own `UserRole` enum
 * (`OWNER`/`ADMIN`/`MEMBER`) rather than better-auth's default lowercase role strings
 * (`'owner'`/`'admin'`/`'member'`). `creatorRole` below keeps organization *creation* correct,
 * but better-auth's *other* built-in org-management endpoints (delete organization, change a
 * member's role, remove a member) compare a member's role against those lowercase defaults
 * unless a custom `roles`/`access-control` set is supplied — which this does not yet do. Until
 * that's written, don't rely on those specific built-in endpoints to enforce anything; the
 * app's own RBAC preHandler (`middlewares/rbac.ts`) is what gates real business actions today.
 */
export function createAuth(prisma: PrismaClient, env: AsasEnv) {
  return betterAuth({
    secret: env.authSecret || undefined,
    baseURL: `http://${env.host}:${env.port}`,
    trustedOrigins: env.frontendOrigin.split(',').map(value => value.trim()),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      organization({
        creatorRole: 'OWNER',
        schema: {
          organization: {
            modelName: 'Tenant',
            fields: { logo: 'logoUrl' },
            additionalFields: {
              supportEmail: { type: 'string', required: false },
              timezone: { type: 'string', required: false },
              currency: { type: 'string', required: false },
              dateFormat: { type: 'string', required: false },
              onboardingStatus: { type: 'string', required: false },
            },
          },
          member: {
            modelName: 'Member',
            fields: { organizationId: 'tenantId' },
            additionalFields: {
              employeeId: { type: 'string', required: false },
            },
          },
          invitation: {
            modelName: 'Invitation',
            fields: { organizationId: 'tenantId' },
          },
        },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          // better-auth's `before` hook replaces the record being written when it returns
          // `{ data }` (see @better-auth/core init-options: "If the hook returns an object,
          // it'll be used instead of the original data"). Returning the raw session object —
          // as an earlier draft did — is type-invalid and not consumed as a replacement.
          before: async session => {
            if (session.activeOrganizationId) return
            const membershipCount = await prisma.member.count({ where: { userId: session.userId } })
            if (membershipCount === 1) {
              const onlyMember = await prisma.member.findFirst({ where: { userId: session.userId } })
              if (onlyMember) {
                return { data: { ...session, activeOrganizationId: onlyMember.tenantId } }
              }
            }
            return
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
