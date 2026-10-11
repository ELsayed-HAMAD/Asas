import type { PrismaClient } from '@prisma/client'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAccessControl, organization } from 'better-auth/plugins'
import type { AsasEnv } from './config/env.js'
import { mailer } from './services/mailer.js'

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
export function createAuth(prisma: PrismaClient, env: AsasEnv) {
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
    secret: env.authSecret || undefined,
    // The process binds 127.0.0.1 by default; the browser must use that same host.
    // `localhost` on Windows often resolves to ::1 and never reaches this listener.
    baseURL: process.env.BETTER_AUTH_URL || `http://127.0.0.1:${env.port}`,
    trustedOrigins: env.frontendOrigin.split(',').map(value => value.trim()),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async (data: { user: { email: string; name?: string | null }; url: string }) => {
        await mailer.send({
          to: data.user.email,
          subject: 'Reset your Asas password',
          text: `Reset your password by visiting: ${data.url}`,
          html: `<p>Hello ${data.user.name || 'there'},</p><p>You requested a password reset. Click below to choose a new password:</p><p><a href="${data.url}">Reset Password</a></p>`,
        })
      },
      sendEmailVerification: async (data: { user: { email: string; name?: string | null }; url: string }) => {
        await mailer.send({
          to: data.user.email,
          subject: 'Verify your Asas email address',
          text: `Verify your email by visiting: ${data.url}`,
          html: `<p>Hello ${data.user.name || 'there'},</p><p>Click below to verify your email address:</p><p><a href="${data.url}">Verify Email</a></p>`,
        })
      },
    },
    plugins: [
      organization({
        creatorRole: 'OWNER',
        ac,
        roles: { OWNER: owner, ADMIN: admin, MEMBER: member },
        sendInvitationEmail: async (data: { id: string; email: string; role: string; organization?: { name: string } | null }) => {
          const frontendBase = (env.frontendOrigin.split(',')[0] ?? 'http://localhost:5173').trim()
          const inviteUrl = `${frontendBase}/register?invitationId=${data.id}`
          const orgName = data.organization?.name || 'Workspace'
          await mailer.send({
            to: data.email,
            subject: `Invitation to join ${orgName} on Asas`,
            text: `You have been invited to join ${orgName} on Asas as ${data.role}. Accept your invitation: ${inviteUrl}`,
            html: `<p>You have been invited to join <strong>${orgName}</strong> as ${data.role}.</p><p><a href="${inviteUrl}">Accept Invitation</a></p>`,
          })
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
            },
          },
          member: {
            modelName: 'Member',
            fields: { organizationId: 'tenantId' },
            additionalFields: {
              employeeId: { type: 'string', required: false, input: false },
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
          before: async session => {
            if (session.activeOrganizationId) return { data: session }
            const membershipCount = await prisma.member.count({ where: { userId: session.userId } })
            if (membershipCount === 1) {
              const onlyMember = await prisma.member.findFirst({ where: { userId: session.userId } })
              if (onlyMember) {
                return { data: { ...session, activeOrganizationId: onlyMember.tenantId } }
              }
            }
            return { data: session }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
