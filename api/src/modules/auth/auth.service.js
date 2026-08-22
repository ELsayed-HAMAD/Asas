import bcrypt from 'bcryptjs'
import { AppError } from '../../utils/errors.js'

const toUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  tenantId: user.tenantId,
  tenant: user.tenant,
})

const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function register(prisma, payload) {
  const email = payload.email.toLowerCase()
  const existingUser = await prisma.user.findFirst({ where: { email } })
  if (existingUser) {
    throw new AppError(400, 'An account with this email already exists.')
  }
  const baseSlug = slugify(payload.tenantName || `${payload.name}'s workspace`) || 'workspace'
  let slug = baseSlug
  let suffix = 1
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`
  }
  const passwordHash = await bcrypt.hash(payload.password, 12)
  const tenant = await prisma.tenant.create({
    data: {
      name: payload.tenantName || `${payload.name}'s workspace`,
      slug,
      supportEmail: email,
      onboardingStatus: 'PENDING',
    },
  })
  const user = await prisma.user.create({
    data: {
      name: payload.name,
      email,
      passwordHash,
      role: 'OWNER',
      tenantId: tenant.id,
    },
    include: { tenant: true },
  })
  return toUser(user)
}

export async function login(prisma, payload) {
  const email = payload.email.toLowerCase()
  const matches = await prisma.user.findMany({
    where: { email },
    include: { tenant: true },
    take: 2,
  })
  if (matches.length > 1) {
    throw new AppError(400, 'Multiple workspaces use this email. Workspace picker is not available yet — use a unique email per workspace for now.')
  }
  const user = matches[0]
  if (!user || !(await bcrypt.compare(payload.password, user.passwordHash))) {
    throw new AppError(401, 'Invalid email or password')
  }
  return toUser(user)
}

export async function getMe(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  })
  if (!user) throw new AppError(401, 'Session is no longer valid')
  return toUser(user)
}
