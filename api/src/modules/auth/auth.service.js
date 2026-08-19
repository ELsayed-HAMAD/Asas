import bcrypt from 'bcryptjs'
import { AppError } from '../../utils/errors.js'

const toUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, tenant: user.tenant })
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function register(prisma, payload) {
  const email = payload.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) throw new AppError(409, 'An account with this email already exists')
  const baseSlug = slugify(payload.tenantName || `${payload.name}'s workspace`) || 'workspace'
  let slug = baseSlug, suffix = 1
  while (await prisma.tenant.findUnique({ where: { slug } })) slug = `${baseSlug}-${suffix++}`
  const passwordHash = await bcrypt.hash(payload.password, 12)
  const tenant = await prisma.tenant.create({ data: { name: payload.tenantName || `${payload.name}'s workspace`, slug } })
  const user = await prisma.user.create({ data: { name: payload.name, email, passwordHash, role: 'OWNER', tenantId: tenant.id }, include: { tenant: true } })
  return toUser(user)
}

export async function login(prisma, payload) {
  const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() }, include: { tenant: true } })
  if (!user || !(await bcrypt.compare(payload.password, user.passwordHash))) throw new AppError(401, 'Invalid email or password')
  return toUser(user)
}
