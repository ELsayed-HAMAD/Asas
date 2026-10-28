import type { PrismaClient } from '@prisma/client'
import { APIError } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAccessControl, organization, twoFactor } from 'better-auth/plugins'
import type { AsasEnv } from './config/env.js'
import { invalidateAuthCacheForTenant, invalidateAuthCacheForToken, invalidateAuthCacheForUser } from './middlewares/rbac.js'
import { closeStreamsForUser } from './plugins/sse.js'
import { recordAuditLog } from './services/auditLog.js'
import { getPlatformFlags } from './modules/platform/platformSettings.js'
import { emailVerificationHtml, invitationHtml, passwordResetHtml } from './services/authEmailTemplates.js'
import { releaseWorkspaceSeat, reserveWorkspaceSeat } from './services/entitlements.js'
import { mailer } from './services/mailer.js'
import { withTwoFactorSessionMarker } from './services/twoFactorSession.js'

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
 * The organization plugin uses the same uppercase role names as the Prisma `UserRole` enum.
 * Its built-in management endpoints therefore enforce the same OWNER/ADMIN/MEMBER hierarchy
 * as the application's ERP permission map, while the app's RBAC preHandler continues to gate
 * business actions.
 */
function maskEmail(email: string): string {
  const parts = email.split('@')
  const local = parts[0]
  const domain = parts[1]
  if (!local || !domain) return '***'
  const visible = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***'
  return `${visible}@${domain}`
}

/** Minimal logger surface so auth hooks never write to stdout directly. */
export interface AuthLogger {
  info: (context: Record<string, unknown>, message: string) => void
  warn: (context: Record<string, unknown>, message: string) => void
  error: (context: Record<string, unknown>, message: string) => void
}

const noopLogger: AuthLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
}

export function createAuth(prisma: PrismaClient, env: AsasEnv, logger: AuthLogger = noopLogger) {
  const ac = createAccessControl({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
  } as const)
  const owner = ac.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
  })
  const admin = ac.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
  })
  const member = ac.newRole({})

  return betterAuth({
    appName: 'Asas',
    secret: env.authSecret || undefined,
    // Public origin for OAuth callbacks, emailed links, and secure-cookie prefixes. `loadEnv`
    // defaults this to loopback in development; `assertEnv` requires an HTTPS origin in production.
    baseURL: env.betterAuthUrl,
    trustedOrigins: env.frontendOrigin.split(',').map(value => value.trim()),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: {
      additionalFields: {
        platformRole: { type: 'string', required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      sendResetPassword: async (data: { user: { email: string; name?: string | null }; url: string }) => {
        try {
          await mailer.enqueue({
            to: data.user.email,
            subject: 'Reset your Asas password',
            text: `Reset your password by visiting: ${data.url}`,
            html: passwordResetHtml(data.user.name, data.url),
          })
          logger.info({ email: maskEmail(data.user.email) }, 'Password reset email sent')
        } catch (mailError) {
          logger.error({ email: maskEmail(data.user.email), err: mailError }, 'Failed to send password reset email')
          throw mailError
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async (data: { user: { email: string; name?: string | null }; url: string }) => {
        const frontendBase = (env.frontendOrigin.split(',')[0] ?? 'http://localhost:5173').trim()
        let verificationUrl = data.url
        try {
          const parsed = new URL(verificationUrl)
          if (!parsed.searchParams.get('callbackURL')) {
            parsed.searchParams.set('callbackURL', `${frontendBase}/onboarding`)
            verificationUrl = parsed.toString()
          }
        } catch {
          // ignore parsing error
        }

        try {
          await mailer.enqueue({
            to: data.user.email,
            subject: 'Verify your Asas email address',
            text: `Verify your email by visiting: ${verificationUrl}`,
            html: emailVerificationHtml(data.user.name, verificationUrl),
          })
          logger.info({ email: maskEmail(data.user.email) }, 'Verification email sent')
        } catch (mailError) {
          logger.error({ email: maskEmail(data.user.email), err: mailError }, 'Failed to send verification email')
          throw mailError
        }
      },
    },
    socialProviders: {
      ...(env.googleClientId && env.googleClientSecret
        ? {
            google: {
              clientId: env.googleClientId,
              clientSecret: env.googleClientSecret,
            },
          }
        : {}),
    },
    plugins: [
      twoFactor({
        issuer: 'Asas',
        schema: { twoFactor: { modelName: 'TwoFactor' } },
      }),
      organization({
        creatorRole: 'OWNER',
        ac,
        roles: { OWNER: owner, ADMIN: admin, MEMBER: member },
        organizationHooks: {
          beforeAddMember: async ({ member: candidateMember }) => {
            const reservationId = await reserveWorkspaceSeat(prisma, candidateMember.organizationId, { purpose: 'MEMBER' })
            if (!reservationId) {
              throw new APIError('BAD_REQUEST', {
                message: 'Workspace seat limit reached. Please upgrade your subscription plan to add more members.',
              })
            }
            return { data: { ...candidateMember, seatReservationId: reservationId } }
          },
          afterAddMember: async ({ member: createdMember, organization }) => {
            if (createdMember.seatReservationId) {
              try {
                await releaseWorkspaceSeat(prisma, organization.id, createdMember.seatReservationId)
              } catch {
                // The reservation expires automatically if cleanup fails after the member is added.
              }
            }
          },
          beforeAcceptInvitation: async ({ invitation }) => {
            const reservationId = await reserveWorkspaceSeat(prisma, invitation.organizationId, {
              purpose: 'INVITATION_ACCEPTANCE',
              invitationId: invitation.id,
            })
            if (!reservationId) {
              throw new APIError('BAD_REQUEST', {
                message: 'Workspace seat limit reached. Please upgrade the workspace plan before accepting this invitation.',
              })
            }
          },
          afterAcceptInvitation: async ({ invitation, organization }) => {
            if (invitation.seatReservationId) {
              try {
                await releaseWorkspaceSeat(prisma, organization.id, invitation.seatReservationId)
              } catch {
                // The reservation expires and is recovered if cleanup fails after acceptance.
              }
            }
          },
        },
        sendInvitationEmail: async (data: { id: string; email: string; role: string; organization?: { name: string } | null }) => {
          const frontendBase = (env.frontendOrigin.split(',')[0] ?? 'http://localhost:5173').trim()
          const inviteUrl = `${frontendBase}/accept-invitation?invitationId=${data.id}`
          const orgName = data.organization?.name || 'Workspace'
          try {
            await mailer.enqueue({
              to: data.email,
              subject: `Invitation to join ${orgName} on Asas`,
              text: `You have been invited to join ${orgName} on Asas as ${data.role}. Accept your invitation: ${inviteUrl}`,
              html: invitationHtml(orgName, data.role, inviteUrl),
            })
          } catch {
            // Better Auth has already created the invitation at this point. Keep its direct link
            // available to the inviter instead of returning a failed request for a saved invite.
            logger.warn({ email: maskEmail(data.email) }, 'Invitation email could not be queued; share the direct invitation link instead')
          }
        },
        schema: {
          organization: {
            modelName: 'Tenant',
            fields: { logo: 'logoUrl' },
            additionalFields: {
              supportEmail: { type: 'string', required: false },
              timezone: { type: 'string', required: false },
              currency: { type: 'string', required: false, input: false },
              dateFormat: { type: 'string', required: false },
              onboardingStatus: { type: 'string', required: false, input: false },
              status: { type: 'string', required: false, input: false },
            },
          },
          member: {
            modelName: 'Member',
            fields: { organizationId: 'tenantId' },
            additionalFields: {
              employeeId: { type: 'string', required: false, input: false },
              seatReservationId: { type: 'string', required: false, input: false },
            },
          },
          invitation: {
            modelName: 'Invitation',
            fields: { organizationId: 'tenantId' },
            additionalFields: {
              seatReservationId: { type: 'string', required: false, input: false },
            },
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            const flags = await getPlatformFlags(prisma)
            if (!flags.signupsEnabled) {
              throw new APIError('FORBIDDEN', {
                message: 'New signups are paused by the platform administrator. Please try again later.',
              })
            }
            return { data: user }
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            // A session created by a `/two-factor/verify-*` endpoint has completed the second
            // factor. OAuth callbacks and trusted-device sign-ins do not pass through those
            // endpoints, so their sessions stay unmarked and the platform console asks for a
            // step-up verification.
            const sessionData = withTwoFactorSessionMarker(session, context?.path)
            // Bootstrap the platform owner as early as possible so the session payload exposes
            // the role to the user menu. The platform guard repeats this (and audits it) for
            // accounts that already had a session when the allow-list was added.
            if (env.platformOwnerEmails.length > 0) {
              const ownerCandidate = await prisma.user.findUnique({
                where: { id: sessionData.userId },
                select: { id: true, email: true, emailVerified: true, platformRole: true },
              })
              if (
                ownerCandidate &&
                ownerCandidate.emailVerified &&
                env.platformOwnerEmails.includes(ownerCandidate.email.toLowerCase()) &&
                ownerCandidate.platformRole === 'NONE'
              ) {
                await prisma.user.update({
                  where: { id: ownerCandidate.id },
                  data: { platformRole: 'OWNER' },
                })
                try {
                  await prisma.platformAuditLog.create({
                    data: {
                      actorId: ownerCandidate.id,
                      action: 'platform.owner.bootstrap',
                      targetType: 'User',
                      targetId: ownerCandidate.id,
                      metadata: JSON.stringify({ email: ownerCandidate.email, source: 'session.create' }),
                    },
                  })
                } catch {
                  // Non-blocking audit: a missing audit table must not block sign-in.
                }
              }
            }
            if (sessionData.activeOrganizationId) return { data: sessionData }
            const membershipCount = await prisma.member.count({ where: { userId: sessionData.userId } })
            if (membershipCount === 1) {
              const onlyMember = await prisma.member.findFirst({ where: { userId: sessionData.userId } })
              if (onlyMember) {
                return { data: { ...sessionData, activeOrganizationId: onlyMember.tenantId } }
              }
            }
            return { data: sessionData }
          },
        },
        update: {
          after: async (session: { token?: string | null }) => {
            // `organization.setActive` rewrites `activeOrganizationId` on the session row through
            // this update path. The RBAC context cache is keyed by session token and lives for
            // five seconds; without this, API calls made right after switching workspaces would
            // still resolve the previous tenant (and write settings/onboarding state there).
            if (session?.token) invalidateAuthCacheForToken(session.token)
          },
        },
        delete: {
          after: async (session: { token?: string | null }) => {
            // Sign-out must not leave a cached authorization context usable for its TTL.
            if (session?.token) invalidateAuthCacheForToken(session.token)
          },
        },
      },
      member: {
        create: {
          after: async (member: { id: string; userId: string; tenantId?: string; organizationId?: string; role: string }) => {
            const tenantId = member.tenantId ?? member.organizationId
            if (tenantId) {
              try {
                await recordAuditLog(prisma, {
                  tenantId,
                  actorId: member.userId,
                  action: 'auth.member.joined',
                  targetType: 'Member',
                  targetId: member.id,
                  metadata: { userId: member.userId, role: member.role },
                })
              } catch {
                // Non-blocking audit
              }
            }
          },
        },
        delete: {
          before: async (member: { id?: string }, context: { context?: { session?: { user?: { id?: string } } } } | null) => {
            if (member?.id) {
              const existing = await prisma.member.findUnique({ where: { id: member.id } })
              if (existing) {
                if (existing.role === 'OWNER') {
                  await prisma.$transaction(async (tx) => {
                    const owners = await tx.$queryRaw<{ id: string }[]>`
                      SELECT "id" FROM "Member"
                      WHERE "tenantId" = ${existing.tenantId} AND "role" = 'OWNER'
                      FOR UPDATE
                    `
                    if (owners.length <= 1) {
                      throw new APIError('BAD_REQUEST', {
                        message: 'Cannot remove the last owner of the workspace',
                      })
                    }
                  })
                }
                closeStreamsForUser(existing.userId)
                invalidateAuthCacheForUser(existing.userId)
                invalidateAuthCacheForTenant(existing.tenantId)
                try {
                  await recordAuditLog(prisma, {
                    tenantId: existing.tenantId,
                    actorId: context?.context?.session?.user?.id ?? 'system',
                    action: 'auth.member.removed',
                    targetType: 'Member',
                    targetId: existing.id,
                    metadata: { userId: existing.userId, role: existing.role },
                  })
                } catch {
                  // Non-blocking audit
                }
              }
            }
            return { data: member }
          },
        },
        update: {
          before: async (member: { id?: string; role?: string }) => {
            if (member?.id && member.role && member.role !== 'OWNER') {
              const existing = await prisma.member.findUnique({ where: { id: member.id } })
              if (existing) {
                if (existing.role === 'OWNER') {
                  await prisma.$transaction(async (tx) => {
                    const owners = await tx.$queryRaw<{ id: string }[]>`
                      SELECT "id" FROM "Member"
                      WHERE "tenantId" = ${existing.tenantId} AND "role" = 'OWNER'
                      FOR UPDATE
                    `
                    if (owners.length <= 1) {
                      throw new APIError('BAD_REQUEST', {
                        message: 'Cannot demote the last owner of the workspace',
                      })
                    }
                  })
                }
                invalidateAuthCacheForUser(existing.userId)
                invalidateAuthCacheForTenant(existing.tenantId)
              }
            }
            return { data: member }
          },
          after: async (member: { id: string; userId?: string; tenantId?: string; organizationId?: string; role?: string }, context: { context?: { session?: { user?: { id?: string } } } } | null) => {
            const tenantId = member.tenantId ?? member.organizationId ?? (await prisma.member.findUnique({ where: { id: member.id }, select: { tenantId: true } }))?.tenantId
            if (tenantId) {
              try {
                await recordAuditLog(prisma, {
                  tenantId,
                  actorId: context?.context?.session?.user?.id ?? 'system',
                  action: 'auth.member.role.updated',
                  targetType: 'Member',
                  targetId: member.id,
                  metadata: { role: member.role },
                })
              } catch {
                // Non-blocking audit
              }
            }
          },
        },
      },
      invitation: {
        create: {
          before: async (invitation: { tenantId?: string; organizationId?: string; seatReservationId?: string }) => {
            const tenantId = invitation.tenantId ?? invitation.organizationId
            if (tenantId) {
              const reservationId = await reserveWorkspaceSeat(prisma, tenantId, { purpose: 'INVITATION' })
              if (!reservationId) {
                throw new APIError('BAD_REQUEST', {
                  message: 'Workspace seat limit reached. Please upgrade your subscription plan to invite more members.',
                })
              }
              return { data: { ...invitation, seatReservationId: reservationId } }
            }
            return { data: invitation }
          },
          after: async (invitation: { id: string; tenantId?: string; organizationId?: string; email: string; role: string; inviterId?: string; seatReservationId?: string }) => {
            const tenantId = invitation.tenantId ?? invitation.organizationId
            if (tenantId) {
              if (invitation.seatReservationId) {
                try {
                  await releaseWorkspaceSeat(prisma, tenantId, invitation.seatReservationId)
                } catch {
                  // The reservation expires automatically if cleanup fails after invitation creation.
                }
              }
              try {
                await recordAuditLog(prisma, {
                  tenantId,
                  actorId: invitation.inviterId ?? 'system',
                  action: 'auth.invitation.sent',
                  targetType: 'Invitation',
                  targetId: invitation.id,
                  metadata: { email: invitation.email, role: invitation.role },
                })
              } catch {
                // Non-blocking audit
              }
            }
          },
        },
      },
      tenant: {
        delete: {
          before: async (tenant: { id?: string }) => {
            const tenantId = tenant?.id
            if (tenantId) {
              await prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe("SET LOCAL asas.allow_tenant_purge = 'on'")
                await tx.journalLine.deleteMany({ where: { entry: { tenantId } } })
                await tx.journalEntry.deleteMany({ where: { tenantId } })
                await tx.ledgerAccount.deleteMany({ where: { tenantId } })
                await tx.exchangeRate.deleteMany({ where: { tenantId } })
              })
              invalidateAuthCacheForTenant(tenantId)
            }
            return { data: tenant }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
