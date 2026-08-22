import * as authService from './auth.service.js'
import { loginSchema, registerSchema } from './auth.schema.js'
import { success } from '../../utils/response.js'

const TOKEN_EXPIRES_IN = '7d'

const issueToken = (reply, user) =>
  reply.jwtSign({ sub: user.id, tenantId: user.tenantId, role: user.role }, { expiresIn: TOKEN_EXPIRES_IN })

export async function register(request, reply) {
  const user = await authService.register(request.server.prisma, registerSchema.parse(request.body))
  return success(reply, { token: await issueToken(reply, user), user }, 201)
}

export async function login(request, reply) {
  const user = await authService.login(request.server.prisma, loginSchema.parse(request.body))
  return success(reply, { token: await issueToken(reply, user), user })
}

export async function me(request, reply) {
  const user = await authService.getMe(request.server.prisma, request.user.sub)
  return success(reply, { user })
}
