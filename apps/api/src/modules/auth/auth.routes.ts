import { randomBytes, randomUUID } from 'node:crypto'
import { makeSignature } from 'better-auth/crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../utils/errors.js'

const devSocialLoginBodySchema = z.object({
  provider: z.enum(['google', 'apple']),
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const env = app.environment

  // Public endpoint: reports which OAuth social providers are configured in the current environment
  app.get('/providers', async () => {
    return {
      data: {
        google: Boolean(env.googleClientId && env.googleClientSecret),
        apple: Boolean(env.appleClientId && env.appleClientSecret),
        email: Boolean(env.resendApiKey),
        devAuthAllowed: env.devSocialAuthEnabled,
      },
    }
  })

  // Development sandbox social sign-in: enables end-to-end testing of Google and Apple flows
  // without requiring external Google Cloud Console or Apple Developer accounts.
  // Disabled by default and only available as an explicit local-development opt-in.
  app.post('/dev-social-login', async (request, reply) => {
    if (!env.devSocialAuthEnabled) {
      throw new AppError(403, 'Development social authentication is disabled. Enable DEV_SOCIAL_AUTH_ENABLED only for local development.')
    }

    const parseResult = devSocialLoginBodySchema.safeParse(request.body)
    if (!parseResult.success) {
      throw new AppError(400, 'Invalid request body: ' + parseResult.error.issues.map(i => i.message).join(', '))
    }

    const { provider, email: rawEmail, name: rawName } = parseResult.data
    const email = rawEmail.trim().toLowerCase()
    const name = rawName?.trim() || (provider === 'apple' ? 'Apple Enterprise User' : 'Google Enterprise User')

    // Find or create the user in the database
    let user = await app.prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await app.prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          name,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }

    // Ensure linked account record exists
    const accountId = `${provider}_dev_${user.id}`
    const existingAccount = await app.prisma.account.findFirst({
      where: { providerId: provider, userId: user.id },
    })

    if (!existingAccount) {
      await app.prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId,
          providerId: provider,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }

    // Check if user has an existing workspace membership
    const membership = await app.prisma.member.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })

    const activeOrganizationId = membership?.tenantId ?? null

    // Create session in Prisma
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await app.prisma.session.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        token,
        expiresAt,
        ipAddress: request.ip || '127.0.0.1',
        userAgent: (request.headers['user-agent'] as string) || 'Development OAuth Sandbox',
        activeOrganizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Sign the session cookie with Better Auth's secret for full tamper-proof validation
    const secret = env.authSecret || 'development_fallback_secret_for_signing_cookies_32_bytes'
    const signature = await makeSignature(token, secret)
    const signedCookieValue = `${token}.${signature}`

    const maxAgeSeconds = 7 * 24 * 60 * 60
    const cookieHeader = `better-auth.session_token=${signedCookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`

    reply.header('set-cookie', cookieHeader)

    return {
      data: {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        hasOrganization: Boolean(activeOrganizationId),
        redirectUrl: activeOrganizationId ? '/dashboard' : '/onboarding',
      },
    }
  })
}
