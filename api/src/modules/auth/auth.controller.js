import * as authService from './auth.service.js'
import { loginSchema, registerSchema } from './auth.schema.js'
import { success } from '../../utils/response.js'

const issueToken = (reply, user) => reply.jwtSign({ sub: user.id, tenantId: user.tenantId, role: user.role })
export async function register(request, reply) {
  const user = await authService.register(request.server.prisma, registerSchema.parse(request.body))
  return success(reply, { token: await issueToken(reply, user), user }, 201)
}
export async function login(request, reply) {
  const user = await authService.login(request.server.prisma, loginSchema.parse(request.body))
  return success(reply, { token: await issueToken(reply, user), user })
}
export async function me(request, reply) {
  const user = await request.server.prisma.user.findUnique({ where: { id: request.user.sub }, include: { tenant: true } })
  return success(reply, { user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, tenant: user.tenant } })
}
